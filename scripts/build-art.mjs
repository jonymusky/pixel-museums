// Asset pipeline: resolves every work in content/museums.json against Wikidata and
// Wikimedia Commons, checks the image licence, downloads it once into .cache/ and
// writes the pixelated PNGs, src/data/manifest.json and CREDITS.md.
// Nothing here runs in the browser: the site ships only the pixelated outputs.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const UA = 'pixel-museums-build/1.0 (static asset pipeline)';
const CACHE = path.join(ROOT, '.cache');
const OUT = path.join(ROOT, 'public/art');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const WALL_W = 300;
const WALL_H = 76; // keep in sync with ART_MAX_H in src/engine/textures.ts
const DETAIL = 112;
const OK_LICENCE = /^(public domain|pd\b|cc0|cc[ -]by(-sa)?[ -]\d|no restrictions)/i;

async function fetchRetry(url, accept) {
  for (let i = 0; i < 8; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA, ...(accept ? { Accept: accept } : {}) } });
    if (r.ok) return r;
    const wait = (Number(r.headers.get('retry-after')) || 10 * (i + 1)) + 2;
    console.error(`   ${r.status} — waiting ${wait}s`);
    await sleep(wait * 1000);
  }
  throw new Error('request failed: ' + url);
}

async function cachedJson(name, url, accept) {
  const file = path.join(CACHE, name);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const j = await (await fetchRetry(url, accept)).json();
  fs.writeFileSync(file, JSON.stringify(j));
  return j;
}

const content = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/museums.json'), 'utf8'));
const works = content.museums.flatMap((m) => m.works.map((w) => ({ ...w, museum: m })));

// ---- 1. facts from Wikidata (one query) ----
const sparql = `SELECT ?item (SAMPLE(?img) AS ?image) (SAMPLE(?es) AS ?les) (SAMPLE(?en) AS ?len) (MIN(?d) AS ?date)
  (GROUP_CONCAT(DISTINCT ?crl; separator="|") AS ?creators) (GROUP_CONCAT(DISTINCT ?ml; separator="|") AS ?materials) WHERE {
  VALUES ?item { ${works.map((w) => 'wd:' + w.qid).join(' ')} }
  OPTIONAL { ?item wdt:P18 ?img }
  OPTIONAL { ?item rdfs:label ?es . FILTER(LANG(?es)="es") }
  OPTIONAL { ?item rdfs:label ?en . FILTER(LANG(?en)="en") }
  OPTIONAL { ?item wdt:P571 ?d }
  OPTIONAL { ?item wdt:P170 ?cr . ?cr rdfs:label ?crl . FILTER(LANG(?crl)="es") }
  OPTIONAL { ?item wdt:P186 ?m . ?m rdfs:label ?ml . FILTER(LANG(?ml)="es") }
} GROUP BY ?item`;
const wd = await cachedJson(
  'wikidata-' + createHash('sha1').update(works.map((w) => w.qid).join(' ')).digest('hex').slice(0, 12) + '.json',
  'https://query.wikidata.org/sparql?query=' + encodeURIComponent(sparql),
  'application/sparql-results+json',
);
const facts = {};
for (const b of wd.results.bindings) {
  const v = (k) => b[k]?.value ?? '';
  facts[v('item').split('/').pop()] = {
    file: v('image') ? decodeURIComponent(v('image').split('/Special:FilePath/')[1]) : '',
    es: v('les'),
    en: v('len'),
    year: v('date') ? String(Number(v('date').replace(/^([+-]?\d+)-.*/, '$1'))) : '',
    creators: v('creators').split('|').filter(Boolean),
    materials: v('materials').split('|').filter(Boolean),
  };
}

// ---- 2. licence + thumbnail from Commons (batched) ----
for (const w of works) w.file = (w.file || facts[w.qid]?.file || '').replace(/_/g, ' ');
const missing = works.filter((w) => !w.file);
if (missing.length) throw new Error('no image for: ' + missing.map((w) => w.id).join(', '));
const info = {};
const titles = [...new Set(works.map((w) => 'File:' + w.file))];
for (let i = 0; i < titles.length; i += 40) {
  const batch = titles.slice(i, i + 40);
  const key = 'commons-' + createHash('sha1').update(batch.join('|')).digest('hex').slice(0, 12) + '.json';
  const j = await cachedJson(
    key,
    'https://commons.wikimedia.org/w/api.php?format=json&action=query&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=960&titles=' +
      encodeURIComponent(batch.join('|')),
  );
  const norm = Object.fromEntries((j.query.normalized ?? []).map((n) => [n.to, n.from]));
  for (const p of Object.values(j.query.pages)) {
    const ii = p.imageinfo?.[0];
    if (!ii) continue;
    const m = ii.extmetadata ?? {};
    const strip = (s) => (s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    // "Artist" is sometimes the painter or a placeholder: prefer an explicit attribution line
    const artist = /unknown|an[oó]n/i.test(strip(m.Artist?.value)) ? '' : strip(m.Artist?.value);
    const credit = /^own work$/i.test(strip(m.Credit?.value)) ? '' : strip(m.Credit?.value);
    const entry = { thumb: ii.thumburl, page: ii.descriptionurl, licence: strip(m.LicenseShortName?.value), licenceUrl: m.LicenseUrl?.value ?? '', author: (strip(m.Attribution?.value) || artist || credit).slice(0, 80) };
    info[p.title] = entry;
    if (norm[p.title]) info[norm[p.title]] = entry;
  }
}

// ---- 3. download + pixelate ----
const manifest = {};
const credits = [];
const problems = [];
for (const w of works) {
  const f = facts[w.qid] ?? {};
  const ci = info['File:' + w.file];
  if (!ci) {
    problems.push(`${w.id}: Commons has no file "${w.file}"`);
    continue;
  }
  if (!OK_LICENCE.test(ci.licence)) {
    problems.push(`${w.id}: licence "${ci.licence}" is not on the allow list (${ci.page})`);
    continue;
  }
  // keyed by source file, so swapping a work's image never reuses a stale download
  const tag = Buffer.from(w.file).toString('base64url').slice(-10);
  const raw = path.join(CACHE, `${w.id}.${tag}${path.extname(new URL(ci.thumb).pathname).toLowerCase()}`);
  if (!fs.existsSync(raw)) {
    const r = await fetchRetry(ci.thumb);
    fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
    console.log('  downloaded', w.id);
    await sleep(1200);
  }
  const src = sharp(raw).flatten({ background: '#1a1620' }).modulate({ saturation: 1.25 }).linear(1.08, -8);
  const pixel = async (maxW, maxH, colours, file) => {
    const o = await src
      .clone()
      .resize(maxW, maxH, { fit: 'inside', kernel: 'lanczos3' })
      .png({ palette: true, colours, dither: 0, effort: 10 })
      .toFile(path.join(OUT, file));
    return [o.width, o.height];
  };
  if (w.kind === 'painting') await pixel(WALL_W, WALL_H, 16, `${w.id}-wall.png`);
  const detail = await pixel(DETAIL, DETAIL, 16, `${w.id}-detail.png`);

  const isPD = /^(public domain|pd\b|cc0|no restrictions)/i.test(ci.licence);
  const title = w.title || f.es || f.en;
  const artist = w.artist || f.creators.join(' / ') || 'Autor desconocido';
  manifest[w.id] = {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    artist,
    year: w.year || f.year,
    medium: w.medium || medium(f.materials),
    license: isPD ? 'Dominio público' : ci.licence,
    // when the photo's author field is just the painter's name, point at the file page instead
    credit: isPD ? 'Wikimedia Commons' : isPainter(ci.author) ? 'Foto: ver autoría en el enlace' : `Foto: ${ci.author}`,
    source: ci.page,
    detail,
  };
  credits.push(`| ${manifest[w.id].title} | ${artist} | ${w.museum.short} | [${w.file.replace(/\|/g, ' ')}](${ci.page}) | ${ci.author.replace(/\|/g, ' ') || '—'} | ${ci.licenceUrl ? `[${ci.licence}](${ci.licenceUrl})` : ci.licence} |`);
}

function isPainter(author) {
  return !author || /^(raphael|rafael)/i.test(author);
}

// Wikidata lists materials unordered ("lienzo, óleo"): put the paint before its support
function medium(materials) {
  const paint = materials.filter((m) => /óleo|témpera|temple|fresco|acrílic|acuarela/i.test(m));
  const support = materials.filter((m) => !paint.includes(m));
  if (paint.length && support.length) return capitalise(`${paint.join(' y ')} sobre ${support.join(' y ')}`);
  return capitalise(materials.join(', '));
}

function capitalise(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

if (problems.length) {
  console.error('\nPROBLEMS:\n' + problems.map((p) => ' - ' + p).join('\n'));
  process.exitCode = 1;
}

fs.mkdirSync(path.join(ROOT, 'src/data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'src/data/manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
fs.writeFileSync(
  path.join(ROOT, 'CREDITS.md'),
  `# Créditos de imágenes

Las imágenes del sitio son versiones pixeladas (reducidas y con paleta limitada) de archivos de
[Wikimedia Commons](https://commons.wikimedia.org). Este archivo se genera con \`npm run art\` a partir
de los metadatos de licencia de cada archivo. Las obras derivadas de imágenes con licencia Creative
Commons se distribuyen bajo la misma licencia que su original.

| Obra | Autor de la obra | Museo | Archivo original | Autor de la imagen | Licencia |
| --- | --- | --- | --- | --- | --- |
${credits.join('\n')}
`,
);
console.log(`\n${Object.keys(manifest).length}/${works.length} works written`);

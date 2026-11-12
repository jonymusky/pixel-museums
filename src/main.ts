import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-600.css';
import './style.css';
import content from '../content/museums.json';
import manifestJson from './data/manifest.json';
import { buildWorld, type MuseumDef, type World, type WorkDef } from './engine/world';
import { Renderer, move, W, H, type Player } from './engine/raycaster';

interface ManifestEntry {
  title: string;
  artist: string;
  year: string;
  medium: string;
  license: string;
  credit: string;
  source: string;
  detail: [number, number];
}

const museums = content.museums as unknown as MuseumDef[];
const manifest = manifestJson as unknown as Record<string, ManifestEntry>;
const base = import.meta.env.BASE_URL;
const artUrl = (id: string, kind: 'wall' | 'detail') => `${base}art/${id}-${kind}.png`;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- progress ----------
const seen = new Set<string>();
try {
  for (const id of JSON.parse(localStorage.getItem('pm-seen') ?? '[]')) seen.add(id);
} catch {
  /* storage unavailable: progress just lasts for this visit */
}
function markSeen(id: string) {
  seen.add(id);
  try {
    localStorage.setItem('pm-seen', JSON.stringify([...seen]));
  } catch {
    /* ignore */
  }
}
const seenIn = (m: MuseumDef) => m.works.filter((w) => seen.has(w.id)).length;

// ---------- lobby ----------
const lobby = $('lobby');
const game = $('game');
const grid = $('museums');

function renderLobby() {
  grid.replaceChildren(
    ...museums.map((m) => {
      const b = document.createElement('button');
      b.className = 'museum';
      b.type = 'button';
      b.style.setProperty('--accent', m.theme.accent);
      const cover = m.works.find((w) => w.kind === 'painting') ?? m.works[0];
      const n = seenIn(m);
      b.innerHTML = `
        <span class="thumb"><img src="${artUrl(cover.id, 'detail')}" alt="" loading="lazy" /></span>
        <span class="m-name">${m.short}</span>
        <span class="m-city">${m.city}, ${m.country} · ${m.founded}</span>
        <span class="m-blurb">${m.blurb}</span>
        <span class="m-foot"><span>${n === m.works.length ? '★ COMPLETO' : `${n}/${m.works.length} OBRAS`}</span><span class="go">ENTRAR ▶</span></span>`;
      b.addEventListener('click', () => {
        location.hash = m.id;
      });
      return b;
    }),
  );
}

// ---------- game ----------
const canvas = $<HTMLCanvasElement>('view');
const renderer = new Renderer(canvas);
const promptEl = $<HTMLButtonElement>('prompt');
const hint = $('hint');
const loading = $('loading');
const detail = $('detail');
const keys = new Set<string>();
const player: Player = { x: 0, y: 0, a: 0 };
let world: World | null = null;
let museum: MuseumDef | null = null;
let showMap = true;
let raf = 0;
let last = 0;
let walk = 0;
let moved = false;
let currentTarget: string | null = null;

function fitStage() {
  const stage = $('stage');
  const padH = getComputedStyle($('pad')).display === 'none' ? 0 : 190;
  const availW = window.innerWidth;
  const availH = window.innerHeight - padH;
  let scale = Math.min(availW / W, availH / H);
  if (scale >= 2) scale = Math.floor(scale);
  stage.style.width = `${Math.floor(W * scale)}px`;
  stage.style.height = `${Math.floor(H * scale)}px`;
  stage.style.setProperty('--px', `${Math.max(1, Math.floor(scale))}px`);
}
window.addEventListener('resize', fitStage);

function updateHud() {
  if (!museum) return;
  $('hud-name').textContent = museum.short.toUpperCase();
  $('hud-count').textContent = `OBRAS ${seenIn(museum)}/${museum.works.length}`;
}

async function enter(m: MuseumDef) {
  museum = m;
  lobby.hidden = true;
  game.hidden = false;
  document.body.classList.add('playing');
  fitStage();
  loading.hidden = false;
  world = null;
  updateHud();
  const built = await buildWorld(m, (id) => artUrl(id, 'wall'));
  if (museum !== m) return;
  world = built;
  Object.assign(player, built.start);
  loading.hidden = true;
  moved = false;
  hint.textContent = matchMedia('(pointer: coarse)').matches
    ? 'USÁ LAS FLECHAS PARA CAMINAR · VER PARA LEER'
    : 'FLECHAS O WASD: CAMINAR · ESPACIO: VER OBRA · M: MAPA';
  hint.hidden = false;
  cancelAnimationFrame(raf);
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

function leave() {
  cancelAnimationFrame(raf);
  world = null;
  museum = null;
  keys.clear();
  closeDetail();
  game.hidden = true;
  lobby.hidden = false;
  document.body.classList.remove('playing');
  renderLobby();
}

function frame(now: number) {
  raf = requestAnimationFrame(frame);
  if (!world || !museum) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (detail.hidden) {
    const fwd = (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0) - (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0);
    const turn = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
    const strafe = (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0);
    player.a += turn * 2.3 * dt;
    if (fwd || strafe) {
      const sp = 2.6 * dt;
      const cx = Math.cos(player.a);
      const sy = Math.sin(player.a);
      move(world, player, (cx * fwd - sy * strafe) * sp, (sy * fwd + cx * strafe) * sp);
      walk += dt * 9;
      if (!moved) {
        moved = true;
        hint.hidden = true;
      }
    }
  }
  renderer.render(world, player, Math.sin(walk) * 1.6, seen, showMap);
  const t = renderer.target?.workId ?? null;
  if (t !== currentTarget) {
    currentTarget = t;
    if (t && manifest[t]) {
      promptEl.textContent = `▶ ${manifest[t].title}`;
      promptEl.hidden = false;
    } else promptEl.hidden = true;
  }
}

// ---------- detail panel ----------
function openDetail(id: string) {
  if (!museum) return;
  const work = museum.works.find((w) => w.id === id) as WorkDef | undefined;
  const info = manifest[id];
  if (!work || !info) return;
  keys.clear();
  markSeen(id);
  updateHud();
  const img = $<HTMLImageElement>('d-img');
  img.src = artUrl(id, 'detail');
  img.alt = `${info.title}, versión pixelada`;
  img.width = info.detail[0];
  img.height = info.detail[1];
  $('d-kicker').textContent = `${museum.short} · ${museum.city}`;
  $('d-title').textContent = info.title;
  $('d-artist').textContent = info.artist;
  const facts = $('d-facts');
  facts.replaceChildren();
  for (const [k, v] of [
    ['Año', info.year],
    ['Técnica', info.medium],
  ]) {
    if (!v) continue;
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    facts.append(dt, dd);
  }
  $('d-story').textContent = work.story;
  const credit = $('d-credit');
  credit.replaceChildren();
  const a = document.createElement('a');
  a.href = info.source;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = 'Imagen original';
  credit.append(a, ` · ${info.credit} · ${info.license}`);
  detail.hidden = false;
  // whole-number upscale so every source pixel stays a clean square
  const box = img.parentElement!;
  const maxH = window.innerHeight * (window.innerWidth <= 720 ? 0.42 : 0.72);
  const scale = Math.max(1, Math.floor(Math.min((box.clientWidth - 24) / info.detail[0], maxH / info.detail[1])));
  img.style.width = `${info.detail[0] * scale}px`;
  img.style.height = `${info.detail[1] * scale}px`;
  $('d-close').focus();
}

function closeDetail() {
  if (detail.hidden) return;
  detail.hidden = true;
  canvas.focus();
}

function interact() {
  if (!detail.hidden) closeDetail();
  else if (currentTarget) openDetail(currentTarget);
}

// ---------- input ----------
const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
window.addEventListener('keydown', (e) => {
  if (game.hidden) return;
  if (e.code === 'Escape') {
    if (!detail.hidden) closeDetail();
    else location.hash = '';
    return;
  }
  if (e.code === 'Space' || e.code === 'Enter') {
    if (e.target instanceof HTMLButtonElement && e.target.id !== 'prompt') return;
    e.preventDefault();
    if (!e.repeat) interact();
    return;
  }
  if (e.code === 'KeyM' && !e.repeat) toggleMap();
  if (GAME_KEYS.includes(e.code)) e.preventDefault();
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

function toggleMap() {
  showMap = !showMap;
  $('map').setAttribute('aria-pressed', String(showMap));
}
$('map').addEventListener('click', toggleMap);
$('exit').addEventListener('click', () => (location.hash = ''));
promptEl.addEventListener('click', interact);
canvas.addEventListener('click', () => currentTarget && openDetail(currentTarget));
$('d-close').addEventListener('click', closeDetail);
detail.addEventListener('click', (e) => e.target === detail && closeDetail());
$('act').addEventListener('click', interact);

for (const b of document.querySelectorAll<HTMLButtonElement>('#pad [data-k]')) {
  const k = b.dataset.k!;
  const on = (e: Event) => {
    e.preventDefault();
    keys.add(k);
  };
  const off = () => keys.delete(k);
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off);
  b.addEventListener('pointerleave', off);
  b.addEventListener('pointercancel', off);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ---------- routing ----------
function route() {
  const id = location.hash.slice(1);
  const m = museums.find((x) => x.id === id);
  if (m) void enter(m);
  else if (!game.hidden) leave();
}
window.addEventListener('hashchange', route);
renderLobby();
route();

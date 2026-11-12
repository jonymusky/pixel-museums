// Procedural pixel textures. Everything here is generated in code: no external tiles.

export interface Tex {
  w: number;
  h: number;
  data: Uint32Array;
}

export type RGB = [number, number, number];

export const pack = (r: number, g: number, b: number): number =>
  ((255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
export const tone = (c: RGB, k: number): number => pack(clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k));
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function makeTex(w: number, h: number): Tex {
  return { w, h, data: new Uint32Array(w * h) };
}

function hash(x: number, y: number, s: number): number {
  let n = (x * 374761393 + y * 668265263 + s * 1274126177) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = n ^ (n >>> 16);
  return ((n >>> 0) % 1000) / 1000;
}

export type WallStyle = 'panel' | 'damask' | 'stone' | 'white';
export type FloorStyle = 'checker' | 'wood' | 'herring' | 'marble';

export interface Theme {
  wallStyle: WallStyle;
  wall: RGB;
  trim: RGB;
  floorStyle: FloorStyle;
  floorA: RGB;
  floorB: RGB;
  ceil: RGB;
  accent: string;
}

export const TEX = 64;

export function wallTexture(t: Theme): Tex {
  const tex = makeTex(TEX, TEX);
  const d = tex.data;
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      let c: number;
      const n = hash(x, y, 7);
      if (t.wallStyle === 'stone') {
        const row = y >> 4;
        const xx = (x + (row & 1) * 16) & 63;
        const mortar = (y & 15) === 0 || (xx & 31) === 0;
        const block = hash((xx >> 5) + row * 3, row, 3);
        let k = 0.9 + block * 0.16 + (n > 0.86 ? -0.07 : 0);
        if ((y & 15) === 1 || (xx & 31) === 1) k += 0.08;
        c = mortar ? tone(t.wall, 0.66) : tone(t.wall, k);
        if (y >= 60) c = tone(t.trim, mortar ? 0.7 : 0.9 + block * 0.1);
      } else if (t.wallStyle === 'white') {
        c = tone(t.wall, n > 0.93 ? 0.97 : 1);
        if (y >= 59) c = tone(t.trim, y === 59 ? 0.8 : 1);
      } else {
        // painted wall + picture rail + wainscot + baseboard
        let k = n > 0.9 ? 0.94 : n < 0.06 ? 1.05 : 1;
        if (t.wallStyle === 'damask' && y > 7 && y < 46) {
          const dx = Math.abs(((x + ((y >> 4) & 1) * 8) & 15) - 8);
          const dy = Math.abs((y & 15) - 8);
          if (dx + dy === 5 || (dx + dy < 2)) k = 1.16;
        }
        c = tone(t.wall, k);
        if (y === 5) c = tone(t.trim, 1.25);
        if (y === 6) c = tone(t.trim, 0.8);
        if (y >= 46) {
          const px = x & 31;
          const inset = px > 3 && px < 28 && y > 49 && y < 58;
          const edge = inset && (px === 4 || y === 50);
          const edge2 = inset && (px === 27 || y === 57);
          c = tone(t.trim, edge ? 0.72 : edge2 ? 1.2 : inset ? 0.92 : 1);
          if (y === 46) c = tone(t.trim, 1.3);
          if (y === 47) c = tone(t.trim, 0.7);
        }
        if (y >= 60) c = tone(t.trim, y === 60 ? 0.5 : 0.62);
      }
      d[y * TEX + x] = c;
    }
  }
  return tex;
}

export const FTEX = 32;

export function floorTexture(t: Theme): Tex {
  const tex = makeTex(FTEX, FTEX);
  const d = tex.data;
  for (let y = 0; y < FTEX; y++) {
    for (let x = 0; x < FTEX; x++) {
      const n = hash(x, y, 11);
      let c: number;
      if (t.floorStyle === 'checker') {
        const a = ((x >> 4) + (y >> 4)) & 1;
        const base = a ? t.floorA : t.floorB;
        const seam = (x & 15) === 0 || (y & 15) === 0;
        c = tone(base, seam ? 0.8 : n > 0.9 ? 0.93 : 1);
      } else if (t.floorStyle === 'marble') {
        const seam = x === 0 || y === 0;
        const vein = Math.abs(((x * 3 + y * 5 + ((hash(x >> 2, y >> 2, 5) * 6) | 0)) % 23) - 11) < 1;
        c = seam ? tone(t.floorB, 0.85) : vein ? tone(mix(t.floorA, t.floorB, 0.6), 1) : tone(t.floorA, n > 0.9 ? 0.96 : 1);
      } else if (t.floorStyle === 'herring') {
        const bx = x >> 3;
        const by = y >> 3;
        const horiz = ((bx + by) & 1) === 0;
        const along = horiz ? y & 7 : x & 7;
        const v = hash(bx, by, 2);
        const seam = along === 0 || (horiz ? (x & 7) === 0 && (by & 1) === 0 : (y & 7) === 0 && (bx & 1) === 0);
        c = tone(v > 0.5 ? t.floorA : t.floorB, seam ? 0.72 : 0.95 + v * 0.1 + (n > 0.9 ? -0.06 : 0));
      } else {
        const plank = y >> 3;
        const xx = (x + plank * 11) & 31;
        const v = hash(plank, (x + plank * 11) >> 5, 4);
        const seam = (y & 7) === 0 || xx === 0;
        c = tone(v > 0.5 ? t.floorA : t.floorB, seam ? 0.72 : 0.94 + v * 0.12 + (n > 0.88 ? -0.07 : 0));
      }
      d[y * FTEX + x] = c;
    }
  }
  return tex;
}

export function ceilTexture(t: Theme): Tex {
  const tex = makeTex(FTEX, FTEX);
  const d = tex.data;
  for (let y = 0; y < FTEX; y++) {
    for (let x = 0; x < FTEX; x++) {
      const b = Math.min(x, y, FTEX - 1 - x, FTEX - 1 - y);
      let k = 1;
      if (b === 0) k = 0.72;
      else if (b === 1) k = 0.86;
      else if (b === 5) k = 0.8;
      else if (b === 6) k = 1.08;
      else if (b > 6) k = 0.93;
      d[y * FTEX + x] = tone(t.ceil, k);
    }
  }
  return tex;
}

// ---------- wall decals (framed paintings, signs) ----------

export const DCELL = 128; // decal texels per wall cell
export const DSPAN = 3; // cells covered by a decal
export const ART_MAX_W = 300;
export const ART_MAX_H = 76;

function decalBase(base: Tex): Tex {
  const tex = makeTex(DCELL * DSPAN, DCELL);
  for (let y = 0; y < tex.h; y++) {
    for (let x = 0; x < tex.w; x++) {
      tex.data[y * tex.w + x] = base.data[((y >> 1) & 63) * TEX + ((x >> 1) & 63)];
    }
  }
  return tex;
}

function darken(c: number, k: number): number {
  return pack(clamp((c & 255) * k), clamp(((c >> 8) & 255) * k), clamp(((c >> 16) & 255) * k));
}

export function paintingDecal(base: Tex, art: Tex): Tex {
  const tex = decalBase(base);
  const d = tex.data;
  const W = tex.w;
  const fw = 5;
  const x0 = (W - art.w) >> 1;
  const y0 = 9 + ((ART_MAX_H - art.h) >> 1);
  const fx0 = x0 - fw;
  const fy0 = y0 - fw;
  const fx1 = x0 + art.w + fw;
  const fy1 = y0 + art.h + fw;
  // drop shadow
  for (let y = fy0 + 4; y < fy1 + 4; y++)
    for (let x = fx0 + 3; x < fx1 + 3; x++) if (y >= 0 && y < tex.h && x >= 0 && x < W) d[y * W + x] = darken(d[y * W + x], 0.62);
  const gold: RGB = [204, 160, 52];
  for (let y = fy0; y < fy1; y++) {
    for (let x = fx0; x < fx1; x++) {
      const b = Math.min(x - fx0, y - fy0, fx1 - 1 - x, fy1 - 1 - y);
      let c: number;
      if (b === 0) c = pack(38, 24, 10);
      else if (b === 4) c = pack(60, 40, 14);
      else {
        const lit = x - fx0 === b || y - fy0 === b;
        c = tone(gold, b === 2 ? 1.2 : lit ? 1.05 : 0.74);
        if (b === 2 && ((x + y) & 3) === 0) c = tone(gold, 0.9);
      }
      d[y * W + x] = c;
    }
  }
  for (let y = 0; y < art.h; y++) for (let x = 0; x < art.w; x++) d[(y0 + y) * W + x0 + x] = art.data[y * art.w + x];
  // little label plaque under the frame
  const py = fy1 + 5;
  const px = (W >> 1) - 11;
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 22; x++) {
      const edge = x === 0 || y === 0 || x === 21 || y === 6;
      const ink = (y === 2 && x > 2 && x < 17) || (y === 4 && x > 2 && x < 12);
      d[(py + y) * W + px + x] = edge ? pack(70, 62, 50) : ink ? pack(60, 54, 46) : pack(236, 228, 204);
    }
  return tex;
}

export function signDecal(base: Tex, name: string, sub: string, font: string): Tex {
  const tex = decalBase(base);
  const cw = 128;
  const ch = 30;
  const scale = 3;
  const cv = document.createElement('canvas');
  cv.width = cw;
  cv.height = ch;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, cw, ch);
  g.textAlign = 'center';
  g.textBaseline = 'top';
  g.font = `8px ${font}`;
  g.fillStyle = '#fff';
  g.fillText(name, cw / 2, 6, cw - 8);
  g.fillStyle = '#777';
  g.fillText(sub, cw / 2, 17, cw - 8);
  const img = g.getImageData(0, 0, cw, ch).data;
  const W = tex.w;
  const oy = 12;
  for (let y = 0; y < ch * scale; y++) {
    for (let x = 0; x < cw * scale; x++) {
      const sx = (x / scale) | 0;
      const sy = (y / scale) | 0;
      const v = img[(sy * cw + sx) * 4];
      const b = Math.min(x, y, cw * scale - 1 - x, ch * scale - 1 - y);
      let c = pack(28, 24, 34);
      if (b < 2) c = pack(20, 14, 8);
      else if (b < 5) c = pack(204, 160, 52);
      else if (v > 180) c = pack(244, 232, 196);
      else if (v > 70) c = pack(204, 160, 52);
      tex.data[(oy + y) * W + x] = c;
    }
  }
  return tex;
}

// ---------- sculpture sprites (drawn in code) ----------

export type SpriteKind = 'figure' | 'venus' | 'winged' | 'bust' | 'stele' | 'moai' | 'vase' | 'vitrine' | 'group' | 'torso' | 'relief';
export type Material = 'marble' | 'bronze' | 'basalt' | 'granite' | 'gold' | 'glass';

const MATERIALS: Record<Material, RGB> = {
  marble: [226, 220, 204],
  bronze: [120, 96, 60],
  basalt: [92, 90, 96],
  granite: [70, 70, 78],
  gold: [222, 178, 60],
  glass: [40, 56, 110],
};

export const SW = 32;
export const SH = 64;

class Raster {
  m = new Uint8Array(SW * SH); // material index per pixel, 0 = empty
  cols: RGB[] = [[0, 0, 0]];
  cur = 1;
  use(c: RGB) {
    this.cols.push(c);
    this.cur = this.cols.length - 1;
  }
  px(x: number, y: number) {
    x |= 0;
    y |= 0;
    if (x >= 0 && x < SW && y >= 0 && y < SH) this.m[y * SW + x] = this.cur;
  }
  rect(x0: number, y0: number, x1: number, y1: number) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.px(x, y);
  }
  ell(cx: number, cy: number, rx: number, ry: number) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y);
      }
  }
  // vertical trapezoid: width interpolates from w0 (top) to w1 (bottom) around cx
  trap(cx: number, y0: number, y1: number, w0: number, w1: number, lean = 0) {
    for (let y = y0; y <= y1; y++) {
      const t = (y - y0) / Math.max(1, y1 - y0);
      const w = w0 + (w1 - w0) * t;
      const c = cx + lean * t;
      for (let x = Math.round(c - w / 2); x < Math.round(c + w / 2); x++) this.px(x, y);
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, th = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = y0 + ((y1 - y0) * i) / n;
      this.rect(Math.round(x), Math.round(y), Math.round(x) + th - 1, Math.round(y) + th - 1);
    }
  }
  bake(): Tex {
    const tex = makeTex(SW, SH);
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= SW || y >= SH ? 0 : this.m[y * SW + x]);
    for (let y = 0; y < SH; y++) {
      for (let x = 0; x < SW; x++) {
        const i = at(x, y);
        if (i) {
          // light from the upper left, shadow on the right edge
          let k = 1;
          if (!at(x - 1, y) || at(x - 1, y) !== i) k = 1.14;
          if (!at(x + 1, y) || !at(x + 2, y)) k = 0.7;
          else if (!at(x + 3, y)) k = 0.86;
          if (at(x, y - 1) && at(x, y - 1) !== i) k *= 0.82;
          tex.data[y * SW + x] = tone(this.cols[i], k);
        } else if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) {
          tex.data[y * SW + x] = pack(24, 20, 26);
        }
      }
    }
    return tex;
  }
}

const PLINTH: RGB = [150, 144, 136];

export function sculptureSprite(kind: SpriteKind, material: Material): Tex {
  const r = new Raster();
  const mat = MATERIALS[material];
  const plinth = (top: number, w = 16) => {
    r.use(PLINTH);
    r.rect(16 - w / 2, top, 15 + w / 2, 62);
    r.use([120, 114, 108]);
    r.rect(15 - w / 2, top, 16 + w / 2, top + 1);
    r.rect(15 - w / 2, 60, 16 + w / 2, 62);
  };
  switch (kind) {
    case 'figure': {
      plinth(48);
      r.use(mat);
      r.trap(13, 30, 47, 4, 4, 0); // legs
      r.trap(18, 30, 47, 4, 4, 1);
      r.trap(15.5, 16, 31, 11, 8); // torso
      r.line(10, 17, 7, 29, 2); // arms
      r.line(21, 17, 24, 11, 2);
      r.line(24, 11, 26, 6, 2);
      r.rect(14, 12, 16, 15);
      r.ell(15.5, 9, 3.2, 3.8);
      break;
    }
    case 'venus': {
      plinth(52);
      r.use(mat);
      r.trap(16, 33, 51, 12, 15, 1); // drapery slipping off the hips
      r.ell(16, 32, 6.5, 3);
      r.trap(15.5, 17, 31, 11, 8, 0.5); // bare torso
      r.rect(9, 17, 10, 21); // arm stumps
      r.rect(21, 17, 22, 19);
      r.rect(14, 13, 16, 16);
      r.ell(15, 9.5, 3.2, 3.8);
      r.ell(17.5, 6.5, 1.6, 1.4); // hair bun
      break;
    }
    case 'winged': {
      plinth(50, 20);
      r.use([170, 164, 152]);
      r.trap(16, 44, 49, 14, 22); // ship prow base
      r.use(mat);
      r.trap(17, 26, 44, 9, 13, -1); // windswept drapery
      r.trap(17, 16, 27, 8, 8); // torso (headless)
      for (let i = 0; i < 7; i++) {
        r.line(13 - i, 17 + i, 4 - (i >> 1), 6 + i * 2, 2); // back wing
        r.line(21, 18 + i, 30, 8 + i * 2, 2);
      }
      break;
    }
    case 'bust': {
      plinth(34, 12);
      r.use(mat);
      r.trap(16, 25, 33, 16, 10); // shoulders
      r.rect(14, 20, 17, 25);
      r.ell(15.5, 14, 4.6, 6);
      r.rect(11, 8, 20, 10); // headdress / hair
      break;
    }
    case 'torso': {
      plinth(46, 14);
      r.use(mat);
      r.trap(15, 26, 45, 12, 15, 2); // seated thighs / rock
      r.trap(15, 12, 28, 13, 10, 1);
      r.ell(11, 13, 2.5, 3);
      r.ell(20, 14, 2.5, 3);
      break;
    }
    case 'group': {
      plinth(50, 26);
      r.use(mat);
      // central large figure
      r.trap(16, 30, 49, 6, 9);
      r.trap(16, 14, 31, 11, 8);
      r.ell(16, 9, 3.4, 4);
      r.line(21, 15, 26, 6, 2);
      r.line(10, 16, 6, 22, 2);
      // two smaller figures
      r.trap(6, 34, 49, 4, 5);
      r.trap(6, 24, 34, 6, 5);
      r.ell(6, 20, 2.4, 2.8);
      r.trap(27, 34, 49, 4, 5);
      r.trap(27, 24, 34, 6, 5);
      r.ell(27, 20, 2.4, 2.8);
      // serpents
      r.line(4, 28, 14, 24, 1);
      r.line(14, 24, 22, 30, 1);
      r.line(22, 30, 30, 26, 1);
      break;
    }
    case 'stele': {
      plinth(54, 22);
      r.use(mat);
      r.trap(16, 14, 53, 16, 20);
      r.rect(9, 9, 16, 14); // broken top corner
      r.use(material === 'marble' ? [150, 144, 132] : [150, 150, 160]);
      for (let y = 17; y < 52; y += 3) r.rect(9, y, 22 - ((y * 7) % 4), y);
      break;
    }
    case 'relief': {
      plinth(46, 30);
      r.use(mat);
      r.rect(2, 20, 29, 45);
      r.use([170, 164, 150]);
      for (let i = 0; i < 4; i++) {
        const x = 5 + i * 7;
        r.ell(x, 26, 1.8, 2.2);
        r.trap(x, 29, 38, 4, 5);
        r.line(x - 1, 38, x - 2, 43, 1);
        r.line(x + 1, 38, x + 3, 43, 1);
      }
      break;
    }
    case 'moai': {
      plinth(54, 20);
      r.use(mat);
      r.trap(16, 30, 53, 18, 16); // body
      r.trap(16, 6, 30, 11, 13); // long head
      r.rect(10, 12, 21, 13); // heavy brow
      r.rect(14, 14, 17, 22); // nose
      r.rect(12, 26, 19, 26); // mouth
      r.rect(8, 12, 9, 24); // ears
      r.rect(22, 12, 23, 24);
      break;
    }
    case 'vase': {
      plinth(38, 14);
      r.use(MATERIALS.glass);
      r.ell(16, 28, 7, 8);
      r.rect(13, 14, 18, 22);
      r.rect(12, 13, 19, 14);
      r.rect(13, 35, 18, 37);
      r.line(11, 16, 9, 24, 1);
      r.line(20, 16, 22, 24, 1);
      r.use([230, 230, 236]);
      for (let x = 10; x < 22; x += 3) r.rect(x, 26 + (x % 2), x + 1, 30);
      r.rect(10, 23, 21, 23);
      break;
    }
    case 'vitrine': {
      plinth(40, 18);
      r.use([150, 196, 214]);
      r.rect(7, 18, 24, 39);
      r.use([196, 228, 238]);
      r.rect(9, 20, 22, 38);
      r.use(mat);
      r.ell(15.5, 30, 4.5, 5.5);
      r.rect(12, 35, 19, 37);
      r.use([40, 34, 30]);
      r.rect(13, 29, 14, 30);
      r.rect(17, 29, 18, 30);
      break;
    }
  }
  return r.bake();
}

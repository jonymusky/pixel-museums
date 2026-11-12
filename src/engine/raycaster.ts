import { type World, decalKey } from './world';
import { DCELL, TEX, FTEX, pack } from './textures';

export const W = 320;
export const H = 180;
const PLANE = 0.75;
const S = W / (2 * PLANE); // wall height in pixels at distance 1

export interface Player {
  x: number;
  y: number;
  a: number;
}

export interface Target {
  workId: string;
  dist: number;
}

const SHADES = 9;
function shadeOf(dist: number, side: number): number {
  let f = 1.12 - dist * 0.062;
  if (f > 1) f = 1;
  if (f < 0.3) f = 0.3;
  f = Math.round(f * SHADES) / SHADES;
  if (side) f *= 0.84;
  return (f * 256) | 0;
}

function shade(c: number, f: number): number {
  return (
    (0xff000000 | ((((c >> 16) & 255) * f) >> 8 << 16) | ((((c >> 8) & 255) * f) >> 8 << 8) | (((c & 255) * f) >> 8)) >>> 0
  );
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private buf: Uint32Array;
  private zbuf = new Float32Array(W);
  target: Target | null = null;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.ctx.imageSmoothingEnabled = false;
    this.img = this.ctx.createImageData(W, H);
    this.buf = new Uint32Array(this.img.data.buffer);
  }

  render(world: World, p: Player, bob: number, seen: Set<string>, showMap: boolean) {
    const buf = this.buf;
    const dirX = Math.cos(p.a);
    const dirY = Math.sin(p.a);
    const planeX = -dirY * PLANE;
    const planeY = dirX * PLANE;
    const horizon = H / 2 + Math.round(bob);
    const ft = world.floorTex.data;
    const ct = world.ceilTex.data;

    // floor and ceiling
    for (let y = 0; y < H; y++) {
      const isFloor = y >= horizon;
      const pp = isFloor ? y - horizon + 0.5 : horizon - y - 0.5;
      const rowDist = (0.5 * S) / pp;
      const f = shadeOf(rowDist, 0);
      const stepX = (rowDist * 2 * planeX) / W;
      const stepY = (rowDist * 2 * planeY) / W;
      let fx = p.x + rowDist * (dirX - planeX);
      let fy = p.y + rowDist * (dirY - planeY);
      const tex = isFloor ? ft : ct;
      let o = y * W;
      for (let x = 0; x < W; x++) {
        const tx = ((fx - Math.floor(fx)) * FTEX) | 0;
        const ty = ((fy - Math.floor(fy)) * FTEX) | 0;
        buf[o++] = shade(tex[ty * FTEX + tx], f);
        fx += stepX;
        fy += stepY;
      }
    }

    // walls
    let centerHit: Target | null = null;
    for (let x = 0; x < W; x++) {
      const cam = (2 * (x + 0.5)) / W - 1;
      const rdx = dirX + planeX * cam;
      const rdy = dirY + planeY * cam;
      let mx = Math.floor(p.x);
      let my = Math.floor(p.y);
      const ddx = Math.abs(1 / rdx);
      const ddy = Math.abs(1 / rdy);
      const sx = rdx < 0 ? -1 : 1;
      const sy = rdy < 0 ? -1 : 1;
      let sdx = rdx < 0 ? (p.x - mx) * ddx : (mx + 1 - p.x) * ddx;
      let sdy = rdy < 0 ? (p.y - my) * ddy : (my + 1 - p.y) * ddy;
      let side = 0;
      for (let i = 0; i < 96; i++) {
        if (sdx < sdy) {
          sdx += ddx;
          mx += sx;
          side = 0;
        } else {
          sdy += ddy;
          my += sy;
          side = 1;
        }
        if (mx < 0 || my < 0 || mx >= world.w || my >= world.h || world.solid[my * world.w + mx] === 1) break;
      }
      const perp = side === 0 ? sdx - ddx : sdy - ddy;
      this.zbuf[x] = perp;
      let face: number;
      let u: number;
      if (side === 0) {
        const hy = p.y + perp * rdy;
        u = hy - Math.floor(hy);
        face = rdx > 0 ? 1 : 3;
        if (rdx < 0) u = 1 - u;
      } else {
        const hx = p.x + perp * rdx;
        u = hx - Math.floor(hx);
        face = rdy < 0 ? 0 : 2;
        if (rdy > 0) u = 1 - u;
      }
      const decal = world.decals.get(decalKey(world.w, mx, my, face));
      let tex = world.wallTex.data;
      let tw = TEX;
      let th = TEX;
      let tx = (u * TEX) | 0;
      if (decal) {
        tex = decal.tex.data;
        tw = decal.tex.w;
        th = DCELL;
        tx = ((decal.off + u) * DCELL) | 0;
        if (x === W >> 1 && decal.workId) centerHit = { workId: decal.workId, dist: perp };
      }
      const lineH = S / perp;
      const top = horizon - lineH / 2;
      const y0 = Math.max(0, Math.ceil(top));
      const y1 = Math.min(H, Math.ceil(top + lineH));
      const f = shadeOf(perp, side);
      const k = th / lineH;
      for (let y = y0; y < y1; y++) {
        let ty = ((y - top) * k) | 0;
        if (ty >= th) ty = th - 1;
        buf[y * W + x] = shade(tex[ty * tw + tx], f);
      }
    }

    // sprites, far to near
    const order = world.sprites
      .map((s) => ({ s, d: (s.x - p.x) ** 2 + (s.y - p.y) ** 2 }))
      .sort((a, b) => b.d - a.d);
    const inv = 1 / (planeX * dirY - dirX * planeY);
    let spriteHit: Target | null = null;
    for (const { s } of order) {
      const dx = s.x - p.x;
      const dy = s.y - p.y;
      const tX = inv * (dirY * dx - dirX * dy);
      const tY = inv * (-planeY * dx + planeX * dy);
      if (tY < 0.15) continue;
      const cx = (W / 2) * (1 + tX / tY);
      const sh = S / tY;
      const sw = (sh * s.tex.w) / s.tex.h;
      const left = cx - sw / 2;
      const top = horizon - sh / 2;
      const x0 = Math.max(0, Math.ceil(left));
      const x1 = Math.min(W, Math.ceil(left + sw));
      const y0 = Math.max(0, Math.ceil(top));
      const y1 = Math.min(H, Math.ceil(top + sh));
      const f = shadeOf(tY, 0);
      const mid = W >> 1;
      if (mid >= left - 6 && mid < left + sw + 6 && tY < this.zbuf[mid]) spriteHit = { workId: s.workId, dist: tY };
      for (let x = x0; x < x1; x++) {
        if (tY >= this.zbuf[x]) continue;
        const tx = Math.min(s.tex.w - 1, (((x - left) / sw) * s.tex.w) | 0);
        for (let y = y0; y < y1; y++) {
          const ty = Math.min(s.tex.h - 1, (((y - top) / sh) * s.tex.h) | 0);
          const c = s.tex.data[ty * s.tex.w + tx];
          if (c) buf[y * W + x] = shade(c, f);
        }
      }
    }

    const t = spriteHit && (!centerHit || spriteHit.dist < centerHit.dist) ? spriteHit : centerHit;
    this.target = t && t.dist < 3.2 ? t : null;

    if (showMap) this.minimap(world, p, seen);
    this.ctx.putImageData(this.img, 0, 0);
  }

  private minimap(world: World, p: Player, seen: Set<string>) {
    const buf = this.buf;
    const ox = W - world.w - 5;
    const oy = 5;
    const bg = pack(18, 16, 26);
    const floor = pack(88, 84, 104);
    for (let y = -1; y <= world.h; y++)
      for (let x = -1; x <= world.w; x++) {
        const inside = x >= 0 && y >= 0 && x < world.w && y < world.h;
        const s = inside ? world.solid[y * world.w + x] : 1;
        buf[(oy + y) * W + ox + x] = s === 1 ? bg : floor;
      }
    for (const [id, pos] of world.workPos) {
      const c = seen.has(id) ? pack(96, 208, 120) : pack(240, 196, 64);
      buf[(oy + (pos.y | 0)) * W + ox + (pos.x | 0)] = c;
    }
    const px = ox + (p.x | 0);
    const py = oy + (p.y | 0);
    buf[py * W + px] = pack(255, 255, 255);
    const hx = Math.round(Math.cos(p.a));
    const hy = Math.round(Math.sin(p.a));
    buf[(py + hy) * W + px + hx] = pack(255, 96, 96);
  }
}

const R = 0.24;
export function move(world: World, p: Player, dx: number, dy: number) {
  const blocked = (x: number, y: number) => {
    for (const ox of [-R, R])
      for (const oy of [-R, R]) {
        const cx = Math.floor(x + ox);
        const cy = Math.floor(y + oy);
        if (cx < 0 || cy < 0 || cx >= world.w || cy >= world.h || world.solid[cy * world.w + cx]) return true;
      }
    return false;
  };
  if (!blocked(p.x + dx, p.y)) p.x += dx;
  if (!blocked(p.x, p.y + dy)) p.y += dy;
}

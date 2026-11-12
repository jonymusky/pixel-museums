import {
  type Tex,
  type Theme,
  type SpriteKind,
  type Material,
  wallTexture,
  floorTexture,
  ceilTexture,
  paintingDecal,
  signDecal,
  sculptureSprite,
  makeTex,
  DSPAN,
} from './textures';

export interface WorkDef {
  id: string;
  qid: string;
  // 'painting' hangs on a wall, 'object' stands on a plinth
  kind: 'painting' | 'object';
  sprite?: SpriteKind;
  material?: Material;
  file?: string;
  title?: string;
  story: string;
}

export interface MuseumDef {
  id: string;
  name: string;
  short: string;
  city: string;
  country: string;
  founded: string;
  blurb: string;
  theme: Theme;
  layout: [number, number][];
  chain?: boolean;
  links?: [number, number][];
  works: WorkDef[];
}

export interface Decal {
  tex: Tex;
  off: number;
  workId: string | null;
}

export interface Sprite {
  x: number;
  y: number;
  tex: Tex;
  workId: string;
}

export interface World {
  w: number;
  h: number;
  solid: Uint8Array; // 1 = wall, 2 = blocked floor (plinth)
  decals: Map<number, Decal>;
  sprites: Sprite[];
  wallTex: Tex;
  floorTex: Tex;
  ceilTex: Tex;
  start: { x: number; y: number; a: number };
  workPos: Map<string, { x: number; y: number }>;
}

const P = 8; // room pitch: 7 interior cells + 1 shared wall
// faces are named by the direction a viewer is looking when they see them
const DIRS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const ANGLES = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];

export const decalKey = (w: number, x: number, y: number, face: number) => (y * w + x) * 4 + face;

async function loadTex(url: string): Promise<Tex> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth;
  cv.height = img.naturalHeight;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, cv.width, cv.height);
  const tex = makeTex(cv.width, cv.height);
  tex.data.set(new Uint32Array(id.data.buffer));
  return tex;
}

// the pixel font has no accented capitals, so signs use plain ones
const plain = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

export async function buildWorld(m: MuseumDef, artUrl: (id: string) => string): Promise<World> {
  const rooms = m.layout;
  const minX = Math.min(...rooms.map((r) => r[0]));
  const minY = Math.min(...rooms.map((r) => r[1]));
  const rs = rooms.map(([x, y]) => [x - minX, y - minY] as [number, number]);
  const w = (Math.max(...rs.map((r) => r[0])) + 1) * P + 1;
  const h = (Math.max(...rs.map((r) => r[1])) + 1) * P + 1;
  const solid = new Uint8Array(w * h).fill(1);
  for (const [rx, ry] of rs) for (let y = 1; y < P; y++) for (let x = 1; x < P; x++) solid[(ry * P + y) * w + rx * P + x] = 0;

  // doors[i][face] = true when room i has an opening on that side
  const doors = rs.map(() => [false, false, false, false]);
  const pairs: [number, number][] = [];
  if (m.chain !== false) for (let i = 1; i < rs.length; i++) pairs.push([i - 1, i]);
  for (const l of m.links ?? []) pairs.push(l);
  for (const [a, b] of pairs) {
    const dx = rs[b][0] - rs[a][0];
    const dy = rs[b][1] - rs[a][1];
    const face = DIRS.findIndex((d) => d[0] === dx && d[1] === dy);
    if (face < 0) throw new Error(`rooms ${a} and ${b} of ${m.id} are not adjacent`);
    doors[a][face] = true;
    doors[b][(face + 2) % 4] = true;
    const cx = rs[a][0] * P + 4 + dx * 4;
    const cy = rs[a][1] * P + 4 + dy * 4;
    for (let k = -1; k <= 1; k++) solid[(cy + (dx ? k : 0)) * w + cx + (dy ? k : 0)] = 0;
  }

  const wallTex = wallTexture(m.theme);
  const decals = new Map<number, Decal>();
  const workPos = new Map<string, { x: number; y: number }>();

  const place = (room: number, face: number, tex: Tex, workId: string | null) => {
    const [dx, dy] = DIRS[face];
    const cx = rs[room][0] * P + 4 + dx * 4;
    const cy = rs[room][1] * P + 4 + dy * 4;
    for (let i = 0; i < DSPAN; i++) {
      const k = i - 1;
      const x = cx + (dy ? k : 0);
      const y = cy + (dx ? k : 0);
      // texture runs left to right from the viewer's point of view
      const off = face === 0 || face === 1 ? i : DSPAN - 1 - i;
      decals.set(decalKey(w, x, y, face), { tex, off, workId });
    }
    if (workId) workPos.set(workId, { x: cx + 0.5 - dx * 0.5, y: cy + 0.5 - dy * 0.5 });
  };

  // free wall slots per room
  const slots: number[][] = rs.map((_, i) => [0, 1, 2, 3].filter((f) => !doors[i][f]));
  const paintings = m.works.filter((x) => x.kind === 'painting');
  const objects = m.works.filter((x) => x.kind === 'object');
  const total = slots.reduce((n, s) => n + s.length, 0);
  let startAngle = ANGLES[doors[0].findIndex(Boolean)] ?? 0;

  if (total > paintings.length && slots[0].length) {
    await document.fonts.load('8px "Press Start 2P"');
    const face = slots[0].shift()!;
    place(0, face, signDecal(wallTex, plain(m.short), plain(m.city), '"Press Start 2P"'), null);
    startAngle = ANGLES[face];
  }

  const arts = await Promise.all(paintings.map((p) => loadTex(artUrl(p.id))));
  let pi = 0;
  for (let i = 0; i < rs.length && pi < paintings.length; i++) {
    const remainingRooms = rs.length - i;
    let quota = Math.ceil((paintings.length - pi) / remainingRooms);
    // later rooms might not have enough slots: take more here when needed
    const later = slots.slice(i + 1).reduce((n, s) => n + s.length, 0);
    quota = Math.max(quota, paintings.length - pi - later);
    while (quota-- > 0 && slots[i].length && pi < paintings.length) {
      place(i, slots[i].shift()!, paintingDecal(wallTex, arts[pi]), paintings[pi].id);
      pi++;
    }
  }
  if (pi < paintings.length) console.warn(`${m.id}: ${paintings.length - pi} paintings without a wall`);

  // objects on plinths: spread over rooms, away from the centre of the entrance room
  const sprites: Sprite[] = [];
  const spots: [number, number][] = [
    [2, 2],
    [6, 6],
    [6, 2],
    [2, 6],
  ];
  const perRoom: WorkDef[][] = rs.map(() => []);
  objects.forEach((o, i) => {
    perRoom[rs.length > 1 ? 1 + (i % (rs.length - 1)) : 0].push(o);
  });
  perRoom.forEach((list, room) => {
    list.forEach((o, i) => {
      const [sx, sy] = list.length === 1 && room !== 0 ? [4, 4] : spots[i % spots.length];
      const x = rs[room][0] * P + sx;
      const y = rs[room][1] * P + sy;
      solid[y * w + x] = 2;
      sprites.push({ x: x + 0.5, y: y + 0.5, tex: sculptureSprite(o.sprite ?? 'figure', o.material ?? 'marble'), workId: o.id });
      workPos.set(o.id, { x: x + 0.5, y: y + 0.5 });
    });
  });

  return {
    w,
    h,
    solid,
    decals,
    sprites,
    wallTex,
    floorTex: floorTexture(m.theme),
    ceilTex: ceilTexture(m.theme),
    start: { x: rs[0][0] * P + 4.5, y: rs[0][1] * P + 4.5, a: startAngle },
    workPos,
  };
}

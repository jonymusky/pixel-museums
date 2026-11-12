// Three small games played with the museum's own pixel art. All tap-friendly.
import { audio } from './audio/engine';

export interface GameWork {
  id: string;
  title: string;
  artist: string;
  museum: string;
  painting: boolean;
  size: [number, number];
  img: string;
}

export interface GameDef {
  id: string;
  name: string;
  blurb: string;
  icon: string;
}

export const GAMES: GameDef[] = [
  { id: 'pixel', name: 'Píxel a píxel', blurb: 'La obra aparece borrosa y se va definiendo. Cuanto antes la reconozcas, más puntos.', icon: '▦' },
  { id: 'memo', name: 'Memotest', blurb: 'Dieciséis cartas, ocho obras. Encontrá los pares en la menor cantidad de jugadas.', icon: '◧' },
  { id: 'puzzle', name: 'Rompecabezas', blurb: 'Una obra maestra cortada en nueve piezas mezcladas. Tocá dos para intercambiarlas.', icon: '▚' },
];

const shuffle = <T>(a: T[]): T[] => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function best(key: string, value: number, lowerIsBetter: boolean): number {
  let prev = NaN;
  try {
    prev = Number(localStorage.getItem(key) ?? NaN);
  } catch {
    /* ignore */
  }
  const improved = Number.isNaN(prev) || (lowerIsBetter ? value < prev : value > prev);
  if (improved) {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* ignore */
    }
    return value;
  }
  return prev;
}

let cleanup: (() => void) | null = null;

export function closeGame() {
  cleanup?.();
  cleanup = null;
}

export function openGame(id: string, root: HTMLElement, status: HTMLElement, works: GameWork[]) {
  closeGame();
  root.replaceChildren();
  status.textContent = '';
  const restart = () => openGame(id, root, status, works);
  if (id === 'pixel') cleanup = pixelGame(root, status, works, restart);
  else if (id === 'memo') cleanup = memoGame(root, status, works, restart);
  else cleanup = puzzleGame(root, status, works, restart);
}

function endScreen(root: HTMLElement, lines: string[], restart: () => void) {
  const box = el('div', 'g-end');
  lines.forEach((l, i) => box.append(el('p', i === 0 ? 'g-big' : '', l)));
  const again = el('button', 'btn g-btn', 'JUGAR DE NUEVO');
  again.type = 'button';
  again.addEventListener('click', restart);
  const back = el('a', 'btn g-btn ghost', 'VOLVER A LOS MUSEOS');
  back.href = '#';
  box.append(again, back);
  root.append(box);
  again.focus();
}

// ---------- 1. Píxel a píxel ----------
const LEVELS = [4, 6, 9, 13, 19, 28, 42];
const ROUNDS = 8;

function pixelGame(root: HTMLElement, status: HTMLElement, works: GameWork[], restart: () => void) {
  const pool = works.filter((w) => w.painting);
  const answers = shuffle(pool).slice(0, ROUNDS);
  let round = 0;
  let score = 0;
  let timer = 0;

  const canvas = el('canvas', 'g-canvas');
  const cx = canvas.getContext('2d')!;
  const off = document.createElement('canvas');
  const ox = off.getContext('2d')!;
  const meter = el('div', 'g-meter');
  const opts = el('div', 'g-opts');
  const note = el('p', 'g-note');
  const frame = el('div', 'g-frame');
  frame.append(canvas);
  root.append(frame, meter, opts, note);

  const draw = (img: HTMLImageElement, w: GameWork, cols: number) => {
    const [iw, ih] = w.size;
    if (cols >= iw) {
      cx.imageSmoothingEnabled = false;
      cx.drawImage(img, 0, 0);
      return;
    }
    const rows = Math.max(2, Math.round((cols * ih) / iw));
    off.width = cols;
    off.height = rows;
    ox.imageSmoothingEnabled = true;
    ox.drawImage(img, 0, 0, cols, rows);
    cx.imageSmoothingEnabled = false;
    cx.drawImage(off, 0, 0, cols, rows, 0, 0, iw, ih);
  };

  const play = () => {
    clearInterval(timer);
    if (round >= ROUNDS) {
      root.replaceChildren();
      const max = ROUNDS * 100;
      const top = best('pm-best-pixel', score, false);
      status.textContent = `${score} PTS`;
      audio.sfx('win');
      endScreen(root, [`${score} / ${max}`, score >= max * 0.7 ? '¡Ojo de curador!' : score >= max * 0.4 ? 'Buen ojo.' : 'Hay que volver al museo.', `Mejor puntaje: ${top}`], restart);
      return;
    }
    const w = answers[round];
    const others = shuffle(pool.filter((p) => p.title !== w.title)).slice(0, 3);
    const choices = shuffle([w, ...others]);
    let level = 0;
    let done = false;
    status.textContent = `OBRA ${round + 1}/${ROUNDS} · ${score} PTS`;
    note.textContent = '';
    opts.replaceChildren();
    const [iw, ih] = w.size;
    canvas.width = iw;
    canvas.height = ih;
    const scale = Math.max(1, Math.floor(Math.min(336, root.clientWidth - 24) / Math.max(iw, ih)));
    canvas.style.width = `${iw * scale}px`;
    canvas.style.height = `${ih * scale}px`;
    cx.fillStyle = '#0e0c14';
    cx.fillRect(0, 0, iw, ih);

    const img = new Image();
    const paintMeter = () => {
      meter.replaceChildren(...LEVELS.map((_, i) => el('span', i < level ? 'off' : '')));
    };
    img.onload = () => {
      draw(img, w, LEVELS[0]);
      paintMeter();
      timer = window.setInterval(() => {
        if (level >= LEVELS.length - 1) return clearInterval(timer);
        level++;
        draw(img, w, LEVELS[level]);
        paintMeter();
      }, 1700);
    };
    img.src = w.img;

    for (const c of choices) {
      const b = el('button', 'btn g-opt', c.title);
      b.type = 'button';
      b.addEventListener('click', () => {
        if (done) return;
        done = true;
        clearInterval(timer);
        const ok = c === w;
        const pts = ok ? 100 - level * 15 : 0;
        score += pts;
        audio.sfx(ok ? 'good' : 'bad');
        if (img.complete) draw(img, w, 9999);
        for (const o of opts.querySelectorAll<HTMLButtonElement>('button')) {
          o.disabled = true;
          if (o.textContent === w.title) o.classList.add('right');
          else if (o === b) o.classList.add('wrong');
        }
        note.textContent = `${ok ? `+${pts} · ` : ''}${w.title}, ${w.artist}. ${w.museum}.`;
        status.textContent = `OBRA ${round + 1}/${ROUNDS} · ${score} PTS`;
        const next = el('button', 'btn g-btn', round + 1 >= ROUNDS ? 'VER RESULTADO ▶' : 'SIGUIENTE ▶');
        next.type = 'button';
        next.addEventListener('click', () => {
          round++;
          play();
        });
        opts.append(next);
        next.focus();
      });
      opts.append(b);
    }
  };
  play();
  return () => clearInterval(timer);
}

// ---------- 2. Memotest ----------
function memoGame(root: HTMLElement, status: HTMLElement, works: GameWork[], restart: () => void) {
  const picks = shuffle(works).slice(0, 8);
  const deck = shuffle([...picks, ...picks]);
  const grid = el('div', 'g-memo');
  const note = el('p', 'g-note', 'Tocá dos cartas.');
  root.append(grid, note);
  let open: HTMLButtonElement[] = [];
  let moves = 0;
  let found = 0;
  let lock = 0;
  status.textContent = 'JUGADAS 0';

  deck.forEach((w, i) => {
    const card = el('button', 'g-card');
    card.type = 'button';
    card.dataset.id = w.id;
    card.setAttribute('aria-label', `Carta ${i + 1}`);
    const img = el('img');
    img.src = w.img;
    img.alt = '';
    card.append(img);
    card.addEventListener('click', () => {
      if (lock || card.classList.contains('up')) return;
      card.classList.add('up');
      card.setAttribute('aria-label', w.title);
      audio.sfx('flip');
      open.push(card);
      if (open.length < 2) return;
      moves++;
      status.textContent = `JUGADAS ${moves}`;
      const [a, b] = open;
      open = [];
      if (a.dataset.id === b.dataset.id) {
        a.classList.add('done');
        b.classList.add('done');
        found++;
        note.textContent = `${w.title}, ${w.artist}.`;
        audio.sfx('good');
        if (found === picks.length) {
          const top = best('pm-best-memo', moves, true);
          audio.sfx('win');
          endScreen(root, [`${moves} jugadas`, moves <= 12 ? '¡Memoria de elefante!' : moves <= 18 ? 'Muy bien.' : 'Completado.', `Mejor marca: ${top} jugadas`], restart);
        }
      } else {
        lock = window.setTimeout(() => {
          for (const c of [a, b]) {
            c.classList.remove('up');
            c.setAttribute('aria-label', 'Carta');
          }
          lock = 0;
        }, 850);
      }
    });
    grid.append(card);
  });
  return () => clearTimeout(lock);
}

// ---------- 3. Rompecabezas ----------
function puzzleGame(root: HTMLElement, status: HTMLElement, works: GameWork[], restart: () => void) {
  const N = 3;
  const w = shuffle(works.filter((x) => x.painting))[0];
  const [iw, ih] = w.size;
  const scale = Math.max(1, Math.floor(Math.min(336, root.clientWidth - 24) / Math.max(iw, ih)));
  let order = [...Array(N * N).keys()];
  do order = shuffle(order);
  while (order.every((v, i) => v === i));
  let picked = -1;
  let moves = 0;
  let solved = false;
  status.textContent = 'MOVIMIENTOS 0';

  const board = el('div', 'g-board');
  board.style.width = `${iw * scale}px`;
  board.style.height = `${ih * scale}px`;
  board.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
  const note = el('p', 'g-note', 'Tocá dos piezas para intercambiarlas.');
  const frame = el('div', 'g-frame');
  frame.append(board);
  const ref = el('img', 'g-ref');
  ref.src = w.img;
  ref.width = iw;
  ref.height = ih;
  ref.alt = 'Referencia: la obra completa';
  root.append(frame, note, ref);

  const render = () => {
    board.replaceChildren(
      ...order.map((piece, slot) => {
        const t = el('button', 'g-tile' + (slot === picked ? ' sel' : '') + (solved ? ' ok' : ''));
        t.type = 'button';
        t.setAttribute('aria-label', `Pieza ${piece + 1} en posición ${slot + 1}`);
        t.style.backgroundImage = `url("${w.img}")`;
        t.style.backgroundSize = `${N * 100}% ${N * 100}%`;
        t.style.backgroundPosition = `${((piece % N) / (N - 1)) * 100}% ${(Math.floor(piece / N) / (N - 1)) * 100}%`;
        t.disabled = solved;
        t.addEventListener('click', () => {
          if (picked < 0) {
            picked = slot;
            audio.sfx('select');
          } else if (picked === slot) picked = -1;
          else {
            [order[picked], order[slot]] = [order[slot], order[picked]];
            picked = -1;
            moves++;
            status.textContent = `MOVIMIENTOS ${moves}`;
            audio.sfx('flip');
            solved = order.every((v, i) => v === i);
          }
          render();
          if (solved) {
            const top = best('pm-best-puzzle', moves, true);
            audio.sfx('win');
            note.textContent = `${w.title}, ${w.artist}. ${w.museum}.`;
            endScreen(root, [`${moves} movimientos`, `Mejor marca: ${top}`], restart);
          } else (board.children[slot] as HTMLElement | undefined)?.focus();
        });
        return t;
      }),
    );
  };
  render();
  return () => {};
}

// One original chiptune loop per museum, written in a regional or period idiom.
// Notation: "C5/2" = pitch / length in steps, "-" = rest, "|" = bar line (ignored).
// Every voice of a tune must add up to the same number of steps.

export interface Voice {
  notes: string;
  wave: OscillatorType;
  gain: number;
  pluck?: boolean; // decaying note (guitar, harpsichord) instead of a held one
}

export interface Tune {
  name: string;
  spm: number; // steps per minute
  bar: number; // steps per bar
  swing?: number; // delay of every second step, as a fraction of a step
  echo?: number; // 0..1 hall echo
  perc?: string; // one bar: x = shaker, o = low drum, . = silence
  voices: Voice[];
}

const rep = (s: string, n: number) => Array(n).fill(s).join(' | ');

export const TUNES: Record<string, Tune> = {
  louvre: {
    name: 'Vals del Sena',
    spm: 264,
    bar: 6,
    voices: [
      { wave: 'square', gain: 0.07, notes: 'B4/2 D5/2 G5/2 | F#5/3 E5/1 D5/2 | A4/2 C5/2 F#5/2 | E5/3 D5/1 C5/2 | C5/2 E5/2 A5/2 | G5/2 F#5/2 E5/2 | D5/4 B4/2 | G4/6' },
      { wave: 'triangle', gain: 0.16, notes: 'G2/2 D3/2 D3/2 | G2/2 D3/2 D3/2 | D2/2 A2/2 A2/2 | D2/2 C3/2 C3/2 | A2/2 E3/2 E3/2 | D2/2 A2/2 A2/2 | G2/2 D3/2 D3/2 | G2/2 D3/2 -/2' },
    ],
  },
  prado: {
    name: 'Soleá de Madrid',
    spm: 400,
    bar: 16,
    perc: 'x...x.x...x.x.x.',
    voices: [
      {
        wave: 'sawtooth',
        gain: 0.07,
        pluck: true,
        notes:
          'A4/2 C5/2 E5/2 A5/2 E5/2 C5/2 B4/2 C5/2 | G4/2 B4/2 D5/2 G5/2 D5/2 B4/2 A4/2 B4/2 | F4/2 A4/2 C5/2 F5/2 C5/2 A4/2 G4/2 A4/2 | E4/2 G#4/2 B4/2 E5/2 F5/1 E5/1 D5/1 C5/1 B4/2 G#4/2 | ' +
          'E5/4 D5/2 C5/2 B4/2 C5/2 A4/4 | D5/4 C5/2 B4/2 A4/2 B4/2 G4/4 | C5/4 B4/2 A4/2 G4/2 A4/2 F4/4 | E5/1 F5/1 E5/1 D5/1 E5/4 G#4/4 E4/4',
      },
      { wave: 'triangle', gain: 0.16, notes: rep('A2/6 A2/2 E3/4 A2/4 | G2/6 G2/2 D3/4 G2/4 | F2/6 F2/2 C3/4 F2/4 | E2/6 E2/2 B2/4 E2/4', 2) },
    ],
  },
  uffizi: {
    name: 'Danza del giglio',
    spm: 232,
    bar: 8,
    perc: 'o..xo.x.',
    voices: [
      { wave: 'square', gain: 0.06, notes: 'D5/2 E5/1 F5/1 G5/2 A5/2 | G5/1 F5/1 E5/2 F5/2 D5/2 | C5/2 D5/1 E5/1 F5/2 E5/2 | D5/2 C#5/2 D5/4 | A5/2 G5/1 F5/1 G5/2 E5/2 | F5/2 E5/1 D5/1 E5/2 C5/2 | D5/1 E5/1 F5/2 E5/2 C#5/2 | D5/8' },
      { wave: 'triangle', gain: 0.15, notes: 'D3/4 A3/4 | D3/4 A3/4 | C3/4 G3/4 | A2/4 D3/4 | D3/4 C3/4 | F3/4 C3/4 | D3/4 A2/4 | D3/8' },
    ],
  },
  vaticano: {
    name: 'Canto llano',
    spm: 132,
    bar: 8,
    echo: 0.55,
    voices: [
      { wave: 'triangle', gain: 0.14, notes: 'D4/2 F4/2 G4/2 A4/2 | A4/4 G4/2 A4/2 | C5/2 A4/2 G4/2 F4/2 | G4/4 A4/4 | A4/2 C5/2 D5/2 C5/2 | A4/2 G4/2 F4/2 G4/2 | E4/2 F4/2 E4/2 D4/2 | D4/8' },
      { wave: 'sine', gain: 0.12, notes: rep('D3/16', 4) },
      { wave: 'sine', gain: 0.08, notes: rep('A3/16', 4) },
    ],
  },
  rijksmuseum: {
    name: 'Minueto de los canales',
    spm: 252,
    bar: 6,
    voices: [
      { wave: 'sawtooth', gain: 0.14, pluck: true, notes: 'E5/2 G5/2 C6/2 | B5/1 A5/1 G5/2 D5/2 | C5/2 E5/2 A5/2 | A5/1 G5/1 F5/2 C5/2 | D5/2 F5/2 A5/2 | G5/1 F5/1 E5/1 D5/1 B4/2 | C5/2 E5/2 D5/2 | C5/6' },
      { wave: 'sawtooth', gain: 0.16, pluck: true, notes: 'C3/2 E3/2 G3/2 | G2/2 B2/2 D3/2 | A2/2 C3/2 E3/2 | F2/2 A2/2 C3/2 | D3/2 F3/2 A3/2 | G2/2 B2/2 D3/2 | E3/2 C3/2 G2/2 | C3/6' },
    ],
  },
  'national-gallery': {
    name: 'Aire de Trafalgar',
    spm: 220,
    bar: 6,
    voices: [
      { wave: 'triangle', gain: 0.15, notes: 'E5/2 G5/1 A5/2 B5/1 | A5/2 G5/1 F#5/2 D5/1 | E5/2 G5/1 A5/2 B5/1 | C#6/2 B5/1 A5/3 | B5/2 D6/1 B5/2 A5/1 | G5/2 A5/1 F#5/2 D5/1 | E5/2 F#5/1 G5/2 F#5/1 | E5/6' },
      { wave: 'square', gain: 0.045, notes: 'E3/3 B2/3 | D3/3 A2/3 | E3/3 B2/3 | A2/3 A2/3 | G2/3 D3/3 | D3/3 A2/3 | E3/3 B2/3 | E3/6' },
    ],
  },
  orsay: {
    name: 'Reflejos en el agua',
    spm: 320,
    bar: 16,
    echo: 0.4,
    voices: [
      {
        wave: 'triangle',
        gain: 0.12,
        pluck: true,
        notes:
          'D4/2 A4/2 E5/2 F#5/2 A5/2 F#5/2 E5/2 A4/2 | B3/2 F#4/2 D5/2 E5/2 F#5/2 E5/2 D5/2 F#4/2 | G3/2 D4/2 B4/2 D5/2 E5/2 D5/2 B4/2 D4/2 | C4/2 E4/2 F#4/2 G#4/2 A#4/2 C5/2 D5/2 E5/2 | ' +
          'D4/2 A4/2 E5/2 F#5/2 B5/2 F#5/2 E5/2 A4/2 | B3/2 F#4/2 D5/2 E5/2 F#5/2 E5/2 D5/2 F#4/2 | E3/2 B3/2 G4/2 B4/2 D5/2 B4/2 G4/2 B3/2 | A3/2 E4/2 A4/2 C#5/2 E5/4 -/4',
      },
      { wave: 'sine', gain: 0.13, notes: 'D2/16 | B1/16 | G2/16 | C2/16 | D2/16 | B1/16 | E2/16 | A1/16' },
    ],
  },
  met: {
    name: 'Rag de la Quinta Avenida',
    spm: 420,
    bar: 16,
    voices: [
      {
        wave: 'square',
        gain: 0.06,
        notes:
          'E5/1 G5/2 E5/1 G5/2 C6/2 A5/1 G5/2 E5/1 G5/4 | E5/1 G5/2 E5/1 G5/2 C6/2 D6/1 C6/2 A5/1 G5/4 | D5/1 F5/2 D5/1 F5/2 B5/2 A5/1 G5/2 F5/1 D5/4 | B4/1 D5/2 F5/1 G5/2 A5/2 B5/1 A5/2 G5/1 F5/4 | ' +
          'E5/1 G5/2 E5/1 G5/2 C6/2 A5/1 G5/2 E5/1 G5/4 | F5/1 A5/2 F5/1 A5/2 C6/2 D6/1 C6/2 A5/1 F5/4 | E5/2 G5/2 C6/2 E6/2 D6/2 B5/2 G5/2 F5/2 | E5/2 C5/2 G4/2 C5/2 C5/4 -/4',
      },
      {
        wave: 'triangle',
        gain: 0.16,
        pluck: true,
        notes:
          rep('C3/2 G3/2 E3/2 G3/2 C3/2 G3/2 E3/2 G3/2', 2) +
          ' | ' +
          rep('G2/2 F3/2 D3/2 F3/2 G2/2 F3/2 B2/2 F3/2', 2) +
          ' | C3/2 G3/2 E3/2 G3/2 C3/2 G3/2 E3/2 G3/2 | F2/2 C3/2 A2/2 C3/2 F2/2 C3/2 A2/2 C3/2 | C3/2 G3/2 E3/2 G3/2 G2/2 F3/2 B2/2 F3/2 | C3/2 G3/2 C3/4 C2/4 -/4',
      },
    ],
  },
  britanico: {
    name: 'Arenas del tiempo',
    spm: 176,
    bar: 8,
    echo: 0.3,
    perc: 'o..o..x.',
    voices: [
      { wave: 'square', gain: 0.055, notes: 'D5/2 Eb5/1 F#5/1 G5/2 F#5/2 | Eb5/1 D5/1 Eb5/2 D5/4 | A5/2 Bb5/1 A5/1 G5/2 F#5/2 | G5/1 F#5/1 Eb5/2 D5/4 | D5/1 F#5/1 A5/2 Bb5/2 A5/2 | C#6/2 D6/2 A5/4 | Bb5/1 A5/1 G5/1 F#5/1 Eb5/2 F#5/2 | D5/8' },
      { wave: 'triangle', gain: 0.16, notes: rep('D2/3 D2/3 A2/2', 8) },
    ],
  },
  hermitage: {
    name: 'Vals de invierno',
    spm: 276,
    bar: 6,
    echo: 0.2,
    voices: [
      { wave: 'square', gain: 0.06, notes: 'E5/4 A5/2 | C6/3 B5/1 A5/2 | F5/4 A5/2 | D6/3 C6/1 A5/2 | G#5/4 B5/2 | E6/3 D6/1 B5/2 | C6/2 B5/2 A5/2 | A5/6' },
      { wave: 'triangle', gain: 0.16, notes: 'A2/2 E3/2 E3/2 | A2/2 E3/2 E3/2 | D3/2 A3/2 A3/2 | D3/2 F3/2 F3/2 | E2/2 B2/2 B2/2 | E2/2 G#2/2 G#2/2 | A2/2 E3/2 E3/2 | A2/2 E3/2 -/2' },
    ],
  },
  moma: {
    name: 'Boogie de la calle 53',
    spm: 300,
    bar: 8,
    swing: 0.3,
    perc: 'x.x.x.x.',
    voices: [
      {
        wave: 'square',
        gain: 0.055,
        notes:
          '-/1 Eb5/1 E5/2 G5/2 A5/1 G5/1 | C6/2 A5/1 G5/1 Eb5/1 E5/1 C5/2 | -/1 Eb5/1 E5/2 G5/2 A5/1 G5/1 | C6/2 Bb5/2 G5/2 E5/2 | ' +
          '-/1 Ab5/1 A5/2 C6/2 D6/1 C6/1 | C6/2 A5/1 F5/1 Eb5/2 C5/2 | -/1 Eb5/1 E5/2 G5/2 A5/1 G5/1 | C6/2 A5/1 G5/1 Eb5/1 E5/1 C5/2 | ' +
          'D6/2 B5/2 G5/2 F5/2 | C6/2 A5/2 F5/2 Eb5/2 | C6/2 A5/1 G5/1 Eb5/1 E5/1 C5/2 | C5/2 E5/2 G5/2 B4/2',
      },
      {
        wave: 'triangle',
        gain: 0.17,
        pluck: true,
        notes: (() => {
          const c = 'C3 E3 G3 A3 Bb3 A3 G3 E3';
          const f = 'F2 A2 C3 D3 Eb3 D3 C3 A2';
          const g = 'G2 B2 D3 E3 F3 E3 D3 B2';
          return [c, c, c, c, f, f, c, c, g, f, c, g].join(' | ');
        })(),
      },
    ],
  },
};

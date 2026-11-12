// Tiny chiptune engine on Web Audio: no audio files, everything is synthesised.
import { TUNES, type Tune, type Voice } from './tunes';

interface Note {
  step: number;
  len: number;
  freq: number;
}

interface Compiled {
  tune: Tune;
  steps: number;
  voices: { voice: Voice; byStep: Map<number, Note> }[];
}

const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function freqOf(name: string): number {
  const m = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!m) throw new Error(`bad note "${name}"`);
  const midi = 12 * (Number(m[3]) + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

export function compile(tune: Tune): Compiled {
  let steps = 0;
  const voices = tune.voices.map((voice) => {
    const byStep = new Map<number, Note>();
    let at = 0;
    for (const tok of voice.notes.replace(/\|/g, ' ').trim().split(/\s+/)) {
      const [pitch, l] = tok.split('/');
      const len = l ? Number(l) : 1;
      if (pitch !== '-') byStep.set(at, { step: at, len, freq: freqOf(pitch) });
      at += len;
    }
    if (steps && at !== steps) throw new Error(`"${tune.name}": voices are ${steps} and ${at} steps long`);
    steps = at;
    return { voice, byStep };
  });
  if (steps % tune.bar) throw new Error(`"${tune.name}": ${steps} steps is not a whole number of ${tune.bar}-step bars`);
  return { tune, steps, voices };
}

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 1234567;
  for (let i = 0; i < d.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    d[i] = seed / 2147483648 - 1;
  }
  noiseBuf = buf;
  return buf;
}

function tone(ctx: BaseAudioContext, dest: AudioNode, freq: number, t: number, dur: number, wave: OscillatorType, gain: number, pluck = false, slideTo = 0) {
  const osc = ctx.createOscillator();
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.008);
  if (pluck) {
    // sharp attack, then ring down to a soft tail and release just before the next note
    g.gain.setTargetAtTime(gain * 0.2, t + 0.008, Math.max(0.04, dur * 0.3));
    g.gain.setTargetAtTime(0, t + Math.max(0.05, dur - 0.03), 0.012);
  } else {
    g.gain.setValueAtTime(gain, t + Math.max(0.012, dur - 0.035));
    g.gain.linearRampToValueAtTime(0, t + dur);
  }
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + Math.max(0.1, dur) + 0.08);
}

function burst(ctx: BaseAudioContext, dest: AudioNode, t: number, dur: number, type: BiquadFilterType, freq: number, gain: number) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, (t * 7.3) % 0.4);
  src.stop(t + dur + 0.02);
}

function stepTime(c: Compiled, t0: number, n: number): number {
  const d = 60 / c.tune.spm;
  return t0 + n * d + (n % 2 ? (c.tune.swing ?? 0) * d : 0);
}

function scheduleStep(ctx: BaseAudioContext, bus: AudioNode, c: Compiled, t0: number, n: number) {
  const d = 60 / c.tune.spm;
  const i = n % c.steps;
  const t = stepTime(c, t0, n);
  for (const { voice, byStep } of c.voices) {
    const note = byStep.get(i);
    if (note) tone(ctx, bus, note.freq, t, note.len * d * 0.96, voice.wave, voice.gain, voice.pluck);
  }
  const p = c.tune.perc?.[i % c.tune.perc.length];
  if (p === 'x') burst(ctx, bus, t, 0.04, 'highpass', 6000, 0.05);
  else if (p === 'o') tone(ctx, bus, 110, t, 0.13, 'sine', 0.22, true, 55);
}

function makeBus(ctx: BaseAudioContext, dest: AudioNode, echo = 0): GainNode {
  const bus = ctx.createGain();
  bus.connect(dest);
  if (echo) {
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.29;
    const fb = ctx.createGain();
    fb.gain.value = echo * 0.6;
    const wet = ctx.createGain();
    wet.gain.value = echo;
    bus.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(dest);
  }
  return bus;
}

/** Renders one loop offline and reports level statistics. Used to check tunes without ears. */
export async function analyse(id: string) {
  const c = compile(TUNES[id]);
  const seconds = (c.steps * 60) / c.tune.spm;
  const ctx = new OfflineAudioContext(1, Math.ceil((seconds + 1) * 22050), 22050);
  const master = ctx.createGain();
  master.gain.value = MASTER;
  master.connect(ctx.destination);
  const bus = makeBus(ctx, master, c.tune.echo);
  for (let n = 0; n < c.steps; n++) scheduleStep(ctx, bus, c, 0.05, n);
  const data = (await ctx.startRendering()).getChannelData(0);
  let peak = 0;
  let sum = 0;
  let quiet = 0;
  const win = 2205;
  for (let i = 0; i < data.length; i += win) {
    let p = 0;
    for (let j = i; j < Math.min(data.length, i + win); j++) {
      const a = Math.abs(data[j]);
      if (a > p) p = a;
      sum += a * a;
    }
    if (p > peak) peak = p;
    if (p < 0.004 && i / 22050 < seconds) quiet++;
  }
  return { id, name: c.tune.name, steps: c.steps, bars: c.steps / c.tune.bar, seconds: +seconds.toFixed(1), peak: +peak.toFixed(3), rms: +Math.sqrt(sum / data.length).toFixed(4), silentTenths: quiet };
}

const MASTER = 0.85;

export type Sfx = 'open' | 'close' | 'select' | 'good' | 'bad' | 'win' | 'flip';
export type Floor = 'wood' | 'stone';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private timer = 0;
  private current: Compiled | null = null;
  private wanted: string | null = null;
  private t0 = 0;
  private next = 0;
  private _muted = false;

  constructor() {
    try {
      this._muted = localStorage.getItem('pm-muted') === '1';
    } catch {
      /* storage unavailable */
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) void this.ctx.suspend();
        else void this.ctx.resume();
      });
    }
  }

  get muted() {
    return this._muted;
  }

  get state() {
    return { context: this.ctx?.state ?? 'none', playing: this.current?.tune.name ?? null, wanted: this.wanted, timers: this.timer ? 1 : 0, muted: this._muted };
  }

  setMuted(m: boolean) {
    this._muted = m;
    try {
      localStorage.setItem('pm-muted', m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : MASTER, this.ctx.currentTime, 0.02);
  }

  /** Call from inside a user gesture: browsers keep audio locked until then. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : MASTER;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume();
    if (this.wanted && !this.current) this.start(this.wanted);
  }

  /** Sets the museum loop. It starts right away if audio is unlocked, otherwise on the first gesture. */
  play(id: string | null) {
    this.wanted = id && TUNES[id] ? id : null;
    this.stopLoop();
    if (this.wanted && this.ctx) this.start(this.wanted);
  }

  private start(id: string) {
    if (!this.ctx || !this.master) return;
    this.stopLoop();
    const c = compile(TUNES[id]);
    this.current = c;
    this.bus = makeBus(this.ctx, this.master, c.tune.echo);
    this.bus.gain.setValueAtTime(0, this.ctx.currentTime);
    this.bus.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 0.4);
    this.t0 = this.ctx.currentTime + 0.12;
    this.next = 0;
    this.timer = window.setInterval(() => this.pump(), 40);
    this.pump();
  }

  private pump() {
    const { ctx, bus, current: c } = this;
    if (!ctx || !bus || !c || ctx.state !== 'running') return;
    // after a long pause (hidden tab) jump ahead instead of playing a burst of late notes
    if (stepTime(c, this.t0, this.next) < ctx.currentTime - 0.05) {
      this.t0 = ctx.currentTime + 0.05 - (this.next * 60) / c.tune.spm;
    }
    while (stepTime(c, this.t0, this.next) < ctx.currentTime + 0.18) scheduleStep(ctx, bus, c, this.t0, this.next++);
  }

  private stopLoop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = 0;
    this.current = null;
    const bus = this.bus;
    this.bus = null;
    if (bus && this.ctx) {
      bus.gain.cancelScheduledValues(this.ctx.currentTime);
      bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
      setTimeout(() => bus.disconnect(), 400);
    }
  }

  sfx(kind: Sfx) {
    const { ctx, master } = this;
    if (!ctx || !master || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.01;
    const seq = (notes: number[], step: number, wave: OscillatorType = 'square', gain = 0.09) =>
      notes.forEach((f, i) => tone(ctx, master, f, t + i * step, step * 1.6, wave, gain, true));
    if (kind === 'open') seq([523, 659, 784, 1047], 0.055);
    else if (kind === 'close') seq([784, 523], 0.06, 'square', 0.07);
    else if (kind === 'select') seq([880], 0.05, 'square', 0.06);
    else if (kind === 'flip') seq([440, 660], 0.035, 'triangle', 0.14);
    else if (kind === 'good') seq([659, 880, 1319], 0.07);
    else if (kind === 'bad') tone(ctx, master, 196, t, 0.28, 'sawtooth', 0.09, false, 98);
    else if (kind === 'win') seq([523, 659, 784, 1047, 784, 1047, 1319], 0.09, 'square', 0.1);
  }

  footstep(floor: Floor) {
    const { ctx, master } = this;
    if (!ctx || !master || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.005;
    if (floor === 'wood') burst(ctx, master, t, 0.07, 'lowpass', 420, 0.5);
    else burst(ctx, master, t, 0.045, 'bandpass', 1500, 0.22);
  }
}

export const audio = new AudioEngine();

/**
 * Hiệu ứng âm thanh cho mini game - tổng hợp bằng Web Audio (không dùng file âm thanh nào).
 * Dùng: sfx.play('slice'). Trình duyệt chỉ cho phát sau khi người dùng chạm / bấm lần đầu.
 */
import { signal } from '@angular/core';

export type SfxName =
  | 'whoosh' | 'slice' | 'combo' | 'bomb' | 'miss' | 'gameover' | 'win'
  | 'shot' | 'hit' | 'explode' | 'playerHit' | 'pickup' | 'spell'
  | 'tick' | 'shake' | 'reveal-common' | 'reveal-rare' | 'reveal-epic' | 'reveal-legendary'
  | 'flip' | 'wrong' | 'correct'
  | 'launch' | 'boom' | 'curtain' | 'click'
  | 'key' | 'typo' | 'reflect' | 'heal' | 'freeze' | 'bossIn' | 'bossHit' | 'kill';

const MUTE_KEY = 'fumo.sfx.muted';
/** Khoảng cách tối thiểu giữa hai lần phát cùng một âm (ms) - tránh rè khi bắn liên tục. */
const THROTTLE: Partial<Record<SfxName, number>> = { key: 25, typo: 90, shot: 95, hit: 45, pickup: 60, tick: 28, whoosh: 160, flip: 60, launch: 120, boom: 70 };

class Sfx {
  readonly muted = signal(readMuted());
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private readonly last = new Map<SfxName, number>();

  constructor() {
    if (typeof window === 'undefined') return;
    // Lần chạm / bấm phím đầu tiên: mở khoá âm thanh của trình duyệt (phát 1 khung lặng để Safari / Chrome cho phép),
    // đồng thời tải sẵn các file âm thanh → lần chơi đầu không bị mất tiếng / phát trễ.
    const unlock = () => {
      const ctx = this.ensure();
      if (!ctx) return;
      if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
      try {
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        src.connect(ctx.destination);
        src.start();
      } catch {
        /* bỏ qua */
      }
      for (const f of PRELOAD) void this.loadFile(f);
    };
    addEventListener('pointerdown', unlock, { passive: true, capture: true });
    addEventListener('keydown', unlock, { capture: true });
    addEventListener('touchend', unlock, { passive: true, capture: true });
  }

  toggle(): void {
    const m = !this.muted();
    this.muted.set(m);
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* bỏ qua */
    }
    if (!m) this.play('click');
  }

  play(name: SfxName): void {
    if (this.muted()) return;
    const now = performance.now();
    const gap = THROTTLE[name];
    if (gap && now - (this.last.get(name) ?? 0) < gap) return;
    this.last.set(name, now);
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state !== 'running') {
      // Âm thanh đang "ngủ" (vừa mở trang / quay lại tab): đánh thức rồi phát ngay khi sẵn sàng thay vì bỏ mất tiếng.
      void ctx
        .resume()
        .then(() => performance.now() - now < 400 && this.render(name))
        .catch(() => undefined);
      return;
    }
    this.render(name);
  }

  // ---------- Âm thanh từ file (giải mã sẵn vào Web Audio - phát tức thì, không trễ) ----------
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();

  loadFile(src: string): Promise<AudioBuffer | null> {
    const ctx = this.ensure();
    if (!ctx) return Promise.resolve(null);
    let p = this.buffers.get(src);
    if (!p) {
      p = fetch(src)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((b) => ctx.decodeAudioData(b))
        .catch(() => {
          this.buffers.delete(src);
          return null;
        });
      this.buffers.set(src, p);
    }
    return p;
  }

  playFile(src: string, volume: number): void {
    if (this.muted()) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const asked = performance.now();
    const go = (buf: AudioBuffer | null) => {
      // Tải / mở khoá quá lâu thì thôi (tránh tiếng phát lệch hẳn khỏi lúc thua).
      if (!buf || performance.now() - asked > 1500 || this.muted()) return;
      const s = ctx.createBufferSource();
      s.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = volume / 0.6; // master đang ở 0.6
      s.connect(g);
      g.connect(this.master!);
      s.start();
    };
    const ready = ctx.state === 'running' ? Promise.resolve() : ctx.resume().catch(() => undefined);
    void ready.then(() => this.loadFile(src)).then(go);
  }

  private render(name: SfxName): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.005;
    switch (name) {
      case 'click': this.tone(t, 900, 0.05, 'triangle', 0.25); break;
      case 'whoosh': this.noise(t, 0.2, 'bandpass', 500, 2600, 0.28); break;
      case 'slice':
        this.noise(t, 0.09, 'highpass', 2500, 5000, 0.35);
        this.tone(t, 520, 0.12, 'triangle', 0.3, 260);
        break;
      case 'combo': [523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.06, f, 0.14, 'triangle', 0.28)); break;
      case 'bomb':
        this.tone(t, 140, 1.1, 'sine', 0.7, 35);
        this.noise(t, 1.2, 'lowpass', 1800, 120, 0.8);
        break;
      case 'miss': this.tone(t, 240, 0.28, 'square', 0.18, 110); break;
      case 'gameover': [392, 330, 262, 196].forEach((f, i) => this.tone(t + i * 0.16, f, 0.26, 'triangle', 0.3)); break;
      case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(t + i * 0.09, f, i === 4 ? 0.5 : 0.16, 'triangle', 0.3)); break;
      case 'shot': this.tone(t, 1500, 0.035, 'square', 0.04, 1100); break;
      case 'hit': this.noise(t, 0.04, 'highpass', 3000, 3000, 0.08); break;
      case 'explode':
        this.noise(t, 0.35, 'lowpass', 2200, 200, 0.4);
        this.tone(t, 180, 0.25, 'sine', 0.3, 60);
        break;
      case 'playerHit': this.tone(t, 520, 0.45, 'sawtooth', 0.22, 70); break;
      case 'pickup': this.tone(t, 880, 0.07, 'sine', 0.18, 1400); break;
      case 'spell':
        [659, 831, 988, 1319].forEach((f, i) => this.tone(t + i * 0.04, f, 0.6, 'sine', 0.14));
        this.noise(t, 0.6, 'highpass', 4000, 8000, 0.08);
        break;
      case 'tick': this.tone(t, 1900, 0.018, 'square', 0.07); break;
      case 'shake': for (let i = 0; i < 5; i++) this.noise(t + i * 0.11, 0.07, 'bandpass', 900, 1400, 0.22); break;
      case 'reveal-common': [784, 988].forEach((f, i) => this.tone(t + i * 0.08, f, 0.25, 'triangle', 0.28)); break;
      case 'reveal-rare': [659, 784, 988, 1175].forEach((f, i) => this.tone(t + i * 0.08, f, 0.3, 'triangle', 0.28)); break;
      case 'reveal-epic':
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(t + i * 0.08, f, 0.35, 'triangle', 0.28));
        this.noise(t + 0.4, 0.5, 'highpass', 5000, 9000, 0.1);
        break;
      case 'reveal-legendary':
        [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(t + i * 0.085, f, i === 7 ? 0.9 : 0.2, 'square', 0.12));
        [523, 659, 784].forEach((f) => this.tone(t + 0.68, f, 0.9, 'sine', 0.18));
        this.noise(t + 0.6, 0.9, 'highpass', 5000, 9000, 0.14);
        break;
      case 'flip': this.tone(t, 620, 0.05, 'triangle', 0.16, 820); break;
      case 'wrong': this.tone(t, 180, 0.22, 'sine', 0.3, 120); break;
      case 'correct': [784, 1047].forEach((f, i) => this.tone(t + i * 0.07, f, 0.18, 'triangle', 0.25)); break;
      case 'launch': this.tone(t, 500, 0.55, 'sine', 0.06, 1700); break;
      case 'boom':
        this.noise(t, 0.6, 'lowpass', 1600, 150, 0.35);
        for (let i = 0; i < 6; i++) this.noise(t + 0.15 + Math.random() * 0.4, 0.03, 'highpass', 4000, 4000, 0.06);
        break;
      case 'curtain': this.noise(t, 1.4, 'bandpass', 300, 1200, 0.25); break;
      // ----- Gõ chữ diệt Fumo -----
      case 'key': this.tone(t, 1200 + Math.random() * 400, 0.025, 'square', 0.05); break;
      case 'typo': this.tone(t, 150, 0.12, 'square', 0.12, 110); break;
      case 'kill':
        this.tone(t, 660, 0.09, 'triangle', 0.22, 1320);
        this.noise(t + 0.03, 0.12, 'highpass', 3000, 6000, 0.12);
        break;
      case 'reflect':
        this.tone(t, 300, 0.25, 'sawtooth', 0.12, 1600);
        this.noise(t, 0.2, 'bandpass', 800, 4000, 0.15);
        break;
      case 'heal': [523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.08, f, 0.3, 'sine', 0.2)); break;
      case 'freeze':
        [2093, 1760, 1568, 1319, 1175].forEach((f, i) => this.tone(t + i * 0.05, f, 0.4, 'sine', 0.1));
        this.noise(t, 0.5, 'highpass', 6000, 9000, 0.08);
        break;
      case 'bossIn':
        this.tone(t, 110, 1.2, 'sawtooth', 0.18, 55);
        [220, 207, 196, 185].forEach((f, i) => this.tone(t + 0.2 + i * 0.22, f, 0.3, 'square', 0.1));
        break;
      case 'bossHit':
        this.noise(t, 0.3, 'lowpass', 2500, 300, 0.4);
        this.tone(t, 240, 0.3, 'square', 0.15, 80);
        break;
    }
  }

  // ---------- Bộ tạo âm ----------
  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return this.ctx;
  }

  private env(t: number, dur: number, vol: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.012, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.master!);
    return g;
  }

  private tone(t: number, freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number): void {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    o.connect(this.env(t, dur, vol));
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(t: number, dur: number, filter: BiquadFilterType, from: number, to: number, vol: number): void {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx!.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    f.Q.value = filter === 'bandpass' ? 1.4 : 0.7;
    src.connect(f);
    f.connect(this.env(t, dur, vol));
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export const sfx = new Sfx();

// ---------- Âm thanh từ file (mp3 ngắn) ----------
const fileLast = new Map<string, number>();
const BAKA = 'sfx/baka-cirno.mp3';
/** File tải sẵn ngay lần chạm đầu. */
const OHAYOU = 'sfx/guide-ohayou.mp3';
const PRELOAD = [BAKA, OHAYOU];

/** Phát 1 file âm thanh ngắn (tôn trọng nút tắt tiếng). `gapMs`: không phát lại cùng file trong khoảng này. */
export function playFile(src: string, opts: { volume?: number; gapMs?: number } = {}): void {
  const now = Date.now();
  if (now - (fileLast.get(src) ?? 0) < (opts.gapMs ?? 600)) return;
  fileLast.set(src, now);
  sfx.playFile(src, opts.volume ?? 0.7);
}

/** "Baka!" của Cirno - phát khi thua minigame và khi Cirno nhún ở trang chủ. */
export const playBaka = () => playFile(BAKA, { volume: 0.75, gapMs: 1200 });

/** "Ohayou!" - phát khi bấm nút triệu hồi người hướng dẫn. */
export const playOhayou = () => playFile(OHAYOU, { volume: 0.8, gapMs: 800 });

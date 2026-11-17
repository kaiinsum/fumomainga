/**
 * "Fumo Ninja" — vuốt để chém các bé fumo bị tung lên. Chém trúng Reimu viền neon đỏ (bom) là thua ngay;
 * để rơi 3 bé là thua. Càng chơi càng nhiều, càng nhanh.
 */

import { sfx } from '../../shared/sfx';

export const W = 900;
export const H = 600;
const STEP = 1000 / 60;
const MAX_MISSES = 3;

export interface Kind {
  id: string;
  name: string;
  /** Điểm gốc khi chém. */
  points: number;
  /** Màu "bụi bông" khi chém. */
  color: string;
  bomb?: boolean;
}

export const KINDS: Kind[] = [
  { id: 'cirno', name: 'Cirno', points: 9, color: '#4a86d9' },
  { id: 'meiling', name: 'Meiling', points: 5, color: '#3a9a5f' },
  { id: 'yuyuko', name: 'Yuyuko', points: 8, color: '#f19ac4' },
  { id: 'teto', name: 'Teto', points: 10, color: '#e0566f' },
  { id: 'remilia', name: 'Remilia', points: 12, color: '#f3a6c0' },
  { id: 'flandre', name: 'Flandre', points: 12, color: '#f1c84b' },
  { id: 'koishi', name: 'Koishi', points: 15, color: '#7bc59a' },
  { id: 'yukari', name: 'Yukari', points: 20, color: '#9b6fd6' },
];
export const BOMB: Kind = { id: 'reimu', name: 'Reimu', points: 0, color: '#ff1744', bomb: true };

export type NinjaState = 'title' | 'playing' | 'over';
export interface NinjaResult {
  score: number;
  best: number;
  newBest: boolean;
  reason: 'bomb' | 'miss';
  sliced: number;
}

interface Item {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  scale: number;
  r: number;
  dead?: boolean;
}

interface Half {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  scale: number;
  /** Góc nhát chém so với ảnh (để cắt ảnh đúng theo đường chém). */
  cut: number;
  side: 1 | -1;
  life: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

const BEST_KEY = 'fumo.ninja.best';
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Khoảng cách từ điểm tới đoạn thẳng. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export class NinjaGame {
  state: NinjaState = 'title';
  private readonly ctx: CanvasRenderingContext2D;
  private readonly images = new Map<string, HTMLImageElement>();
  private raf = 0;
  private last = 0;
  private acc = 0;

  private items: Item[] = [];
  private halves: Half[] = [];
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private trail: { x: number; y: number; t: number }[] = [];
  private pointerDown = false;
  /** Điểm chạm trước — dùng để chém (không phụ thuộc vệt sáng, vốn tự mờ sau 140ms). */
  private lastPt: { x: number; y: number } | null = null;
  private swipeHits = 0;
  private swipeTimer = 0;

  private time = 0;
  private nextWave = 0;
  private score = 0;
  private best = 0;
  private misses = 0;
  private sliced = 0;
  private flash = 0;
  private shake = 0;
  private overAt = 0;
  private overReason: NinjaResult['reason'] = 'miss';

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onState: (s: NinjaState, r?: NinjaResult) => void,
  ) {
    this.ctx = canvas.getContext('2d')!;
    for (const k of [...KINDS, BOMB]) {
      const img = new Image();
      img.src = `fumo-ninja/${k.id}.webp`;
      this.images.set(k.id, img);
    }
    try {
      this.best = Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      this.best = 0;
    }
    this.resize();
    addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.onHidden);
    canvas.addEventListener('pointerdown', this.onDown);
    addEventListener('pointermove', this.onMove);
    addEventListener('pointerup', this.onUp);
    addEventListener('pointercancel', this.onUp);
    this.raf = requestAnimationFrame(this.loop);
  }

  get bestScore(): number {
    return this.best;
  }

  start(): void {
    this.items = [];
    this.halves = [];
    this.particles = [];
    this.popups = [];
    this.trail = [];
    this.time = 0;
    this.nextWave = 40;
    this.score = 0;
    this.misses = 0;
    this.sliced = 0;
    this.flash = 0;
    this.shake = 0;
    this.overAt = 0;
    this.state = 'playing';
    this.onState('playing');
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.onHidden);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    removeEventListener('pointermove', this.onMove);
    removeEventListener('pointerup', this.onUp);
    removeEventListener('pointercancel', this.onUp);
  }

  // ================= Vòng lặp =================
  private readonly loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.last) this.last = now;
    this.acc += Math.min(100, now - this.last);
    this.last = now;
    let n = 0;
    while (this.acc >= STEP && n < 5) {
      this.update();
      this.acc -= STEP;
      n++;
    }
    if (n === 5) this.acc = 0;
    this.render();
  };

  /** Cấp độ tăng dần theo thời gian chơi (mỗi ~12 giây). */
  private get level(): number {
    return 1 + Math.floor(this.time / 720);
  }

  private update(): void {
    const playing = this.state === 'playing' && !this.overAt;
    const speed = playing ? 1 + Math.min(0.9, (this.level - 1) * 0.07) : 1;
    const g = 0.32 * speed * speed;

    if (playing) {
      this.time++;
      if (--this.nextWave <= 0) this.spawnWave();
      if (this.swipeTimer > 0 && --this.swipeTimer === 0) this.endSwipe();
    }

    for (const it of this.items) {
      it.x += it.vx * speed;
      it.y += it.vy * speed;
      it.vy += g / speed;
      it.rot += it.vr * speed;
      if (it.y - it.r > H + 40 && it.vy > 0) {
        it.dead = true;
        if (playing && !it.kind.bomb) this.miss(it);
      }
    }
    this.items = this.items.filter((i) => !i.dead);

    for (const h of this.halves) {
      h.x += h.vx;
      h.y += h.vy;
      h.vy += 0.35;
      h.rot += h.vr;
      h.life++;
    }
    this.halves = this.halves.filter((h) => h.y < H + 200 && h.life < 180);

    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.18;
      p.vx *= 0.98;
      p.life++;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const p of this.popups) {
      p.y -= 0.8;
      p.life++;
    }
    this.popups = this.popups.filter((p) => p.life < 60);
    const now = performance.now();
    this.trail = this.trail.filter((p) => now - p.t < 140);
    if (this.flash > 0) this.flash--;
    if (this.shake > 0) this.shake--;

    if (this.overAt && this.time >= this.overAt) this.finish();
    if (this.overAt) this.time++;
  }

  private spawnWave(): void {
    const lv = this.level;
    const count = Math.min(7, 1 + Math.floor(Math.random() * Math.min(lv + 1, 5)) + (lv >= 6 ? 1 : 0));
    const bombChance = Math.min(0.32, 0.06 + lv * 0.03);
    for (let i = 0; i < count; i++) {
      const isBomb = Math.random() < bombChance && i < 2;
      this.toss(isBomb ? BOMB : KINDS[Math.floor(Math.random() * KINDS.length)], i * 6);
    }
    // Đợt sau đến sớm dần: từ ~1.6 giây xuống ~0.55 giây.
    this.nextWave = Math.max(33, 100 - lv * 8) + Math.floor(rand(0, 25));
  }

  private toss(kind: Kind, delayFrames: number): void {
    const scale = kind.bomb ? rand(0.85, 1.05) : Math.random() < 0.3 ? rand(0.5, 0.7) : Math.random() < 0.75 ? rand(0.8, 1.05) : rand(1.15, 1.4);
    const x = rand(W * 0.12, W * 0.88);
    const peak = rand(H * 0.12, H * 0.42);
    const vy = -Math.sqrt(2 * 0.32 * (H + 60 - peak));
    const vx = ((W / 2 - x) / W) * rand(3, 7) + rand(-1.2, 1.2);
    const r = 54 * scale;
    this.items.push({ kind, x, y: H + 60 + delayFrames * 6, vx, vy, rot: rand(-0.4, 0.4), vr: rand(-0.06, 0.06), scale, r });
  }

  private miss(it: Item): void {
    this.misses++;
    this.popups.push({ x: Math.max(30, Math.min(W - 30, it.x)), y: H - 30, text: '✕', color: '#ff4d6d', life: 0 });
    sfx.play('miss');
    if (this.misses >= MAX_MISSES) this.gameOver('miss');
  }

  private gameOver(reason: NinjaResult['reason']): void {
    if (this.overAt) return;
    this.overReason = reason;
    this.overAt = this.time + (reason === 'bomb' ? 70 : 30);
    if (reason === 'bomb') {
      this.flash = 40;
      this.shake = 30;
    }
  }

  private finish(): void {
    const newBest = this.score > this.best;
    if (newBest) {
      this.best = this.score;
      try {
        localStorage.setItem(BEST_KEY, String(this.best));
      } catch {
        /* bỏ qua */
      }
    }
    this.state = 'over';
    this.overAt = 0;
    if (this.overReason !== 'bomb') sfx.play('gameover');
    this.onState('over', { score: this.score, best: this.best, newBest, reason: this.overReason, sliced: this.sliced });
  }

  // ================= Chém =================
  private sliceAlong(ax: number, ay: number, bx: number, by: number): void {
    if (this.state !== 'playing' || this.overAt) return;
    const angle = Math.atan2(by - ay, bx - ax);
    for (const it of this.items) {
      if (it.dead || segDist(it.x, it.y, ax, ay, bx, by) > it.r) continue;
      it.dead = true;
      if (it.kind.bomb) {
        this.explode(it);
        this.gameOver('bomb');
        return;
      }
      this.cut(it, angle);
    }
    this.items = this.items.filter((i) => !i.dead);
  }

  private cut(it: Item, angle: number): void {
    // Hai nửa bay ra hai phía vuông góc với đường chém.
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    for (const side of [1, -1] as const) {
      this.halves.push({
        kind: it.kind,
        x: it.x + nx * side * 4,
        y: it.y + ny * side * 4,
        vx: it.vx * 0.6 + nx * side * rand(2.5, 4),
        vy: Math.min(it.vy, 0) * 0.4 + ny * side * rand(2.5, 4) - 2,
        rot: it.rot,
        vr: it.vr + side * rand(0.04, 0.09),
        scale: it.scale,
        cut: angle - it.rot,
        side,
        life: 0,
      });
    }
    for (let i = 0; i < 22; i++) {
      const a = angle + Math.PI / 2 + rand(-1.2, 1.2) * (Math.random() < 0.5 ? 1 : -1);
      const s = rand(1.5, 6);
      this.particles.push({ x: it.x, y: it.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 0, max: rand(25, 45), color: it.kind.color, size: rand(3, 7) });
    }
    // Bé nhỏ khó chém hơn → nhân đôi điểm.
    const small = it.scale < 0.75;
    const pts = it.kind.points * (small ? 2 : 1);
    this.score += pts;
    this.sliced++;
    this.swipeHits++;
    this.swipeTimer = 12;
    this.popups.push({ x: it.x, y: it.y - it.r * 0.6, text: `+${pts}${small ? ' nhỏ x2' : ''}`, color: '#fff', life: 0 });
    sfx.play('slice');
  }

  /** Kết thúc một nhát vuốt: chém từ 3 bé trở lên được thưởng combo. */
  private endSwipe(): void {
    if (this.swipeHits >= 3) {
      const bonus = this.swipeHits * 5;
      this.score += bonus;
      this.popups.push({ x: W / 2, y: H * 0.3, text: `COMBO x${this.swipeHits}  +${bonus}`, color: '#ffd23f', life: 0 });
      sfx.play('combo');
    }
    this.swipeHits = 0;
  }

  private explode(it: Item): void {
    for (let i = 0; i < 90; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(2, 12);
      this.particles.push({ x: it.x, y: it.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: rand(30, 70), color: i % 3 ? '#ff1744' : '#ffd23f', size: rand(3, 9) });
    }
    this.popups.push({ x: it.x, y: it.y, text: 'BÙM! Trúng Reimu', color: '#ff4d6d', life: 0 });
    sfx.play('bomb');
  }

  // ================= Vẽ =================
  private readonly resize = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    const scale = (rect.width || W) / W;
    this.canvas.width = Math.round(W * scale * dpr);
    this.canvas.height = Math.round(H * scale * dpr);
    this.ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  };

  private drawKind(kind: Kind, size: number): void {
    const img = this.images.get(kind.id);
    if (!img?.complete || !img.naturalWidth) {
      this.ctx.fillStyle = kind.color;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
      this.ctx.fill();
      return;
    }
    const k = size / Math.max(img.naturalWidth, img.naturalHeight);
    this.ctx.drawImage(img, (-img.naturalWidth * k) / 2, (-img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
  }

  private render(): void {
    const g = this.ctx;
    g.save();
    if (this.shake) g.translate(rand(-1, 1) * this.shake * 0.5, rand(-1, 1) * this.shake * 0.5);

    // Nền: tấm gỗ dojo
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#3b2416');
    bg.addColorStop(1, '#1f130c');
    g.fillStyle = bg;
    g.fillRect(-30, -30, W + 60, H + 60);
    g.strokeStyle = 'rgba(255,220,180,.06)';
    g.lineWidth = 2;
    for (let x = 0; x < W; x += 90) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 20, H);
      g.stroke();
    }

    // Nửa bị chém
    for (const h of this.halves) {
      const size = 108 * h.scale;
      g.save();
      g.globalAlpha = Math.max(0, 1 - h.life / 180);
      g.translate(h.x, h.y);
      g.rotate(h.rot);
      g.save();
      g.rotate(h.cut);
      g.beginPath();
      g.rect(-size, h.side > 0 ? 0 : -size, size * 2, size);
      g.restore();
      g.clip();
      this.drawKind(h.kind, size);
      g.restore();
    }

    // Vật đang bay
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 120);
    for (const it of this.items) {
      const size = 108 * it.scale;
      g.save();
      g.translate(it.x, it.y);
      g.rotate(it.rot);
      if (it.kind.bomb) {
        // Viền neon đỏ nhấp nháy để nhận ra Reimu là bom.
        g.shadowColor = '#ff1744';
        g.shadowBlur = 25 + pulse * 30;
        g.strokeStyle = `rgba(255, 23, 68, ${0.6 + pulse * 0.4})`;
        g.lineWidth = 4;
        g.beginPath();
        g.arc(0, 0, it.r + 6, 0, Math.PI * 2);
        g.stroke();
        this.drawKind(it.kind, size);
        g.shadowBlur = 0;
        // Biểu tượng cảnh báo nhỏ
        g.rotate(-it.rot);
        g.fillStyle = '#ff1744';
        g.font = '900 20px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText('💣', it.r * 0.75, -it.r * 0.7);
      } else {
        g.shadowColor = 'rgba(0,0,0,.45)';
        g.shadowBlur = 12;
        g.shadowOffsetY = 6;
        this.drawKind(it.kind, size);
      }
      g.restore();
    }

    for (const p of this.particles) {
      g.globalAlpha = 1 - p.life / p.max;
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, p.size * (1 - p.life / p.max / 2), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    // Vệt chém
    if (this.trail.length > 1) {
      const now = performance.now();
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i - 1];
        const b = this.trail[i];
        const k = 1 - (now - b.t) / 140;
        g.strokeStyle = `rgba(255,255,255,${Math.max(0, k)})`;
        g.shadowColor = '#bfe8ff';
        g.shadowBlur = 16;
        g.lineWidth = 2 + 9 * k * (i / this.trail.length);
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
      }
      g.shadowBlur = 0;
    }

    for (const p of this.popups) {
      g.globalAlpha = 1 - p.life / 60;
      g.fillStyle = p.color;
      g.font = `900 ${p.text.startsWith('COMBO') || p.text.startsWith('BÙM') ? 34 : 22}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(0,0,0,.55)';
      g.strokeText(p.text, p.x, p.y);
      g.fillText(p.text, p.x, p.y);
    }
    g.globalAlpha = 1;

    if (this.state !== 'title') this.drawHud();

    if (this.flash) {
      g.fillStyle = `rgba(255, ${this.flash > 30 ? 255 : 40}, ${this.flash > 30 ? 255 : 60}, ${this.flash / 50})`;
      g.fillRect(-30, -30, W + 60, H + 60);
    }
    g.restore();
  }

  private drawHud(): void {
    const g = this.ctx;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillStyle = '#ffd23f';
    g.font = '900 34px system-ui, sans-serif';
    g.fillText(String(this.score), 18, 14);
    g.font = '700 14px system-ui, sans-serif';
    g.fillStyle = 'rgba(255,255,255,.75)';
    g.fillText(`Kỷ lục ${Math.max(this.best, this.score)} · Cấp ${this.level}`, 20, 54);
    g.textAlign = 'right';
    g.font = '900 30px system-ui, sans-serif';
    for (let i = 0; i < MAX_MISSES; i++) {
      g.fillStyle = i < this.misses ? '#ff4d6d' : 'rgba(255,255,255,.25)';
      g.fillText('✕', W - 18 - i * 34, 14);
    }
    g.textBaseline = 'alphabetic';
  }

  // ================= Chuột / cảm ứng =================
  private toLocal(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  }

  private readonly onDown = (e: PointerEvent) => {
    if (this.state !== 'playing') return;
    this.pointerDown = true;
    this.canvas.setPointerCapture?.(e.pointerId);
    const p = this.toLocal(e);
    this.lastPt = p;
    this.trail = [{ ...p, t: performance.now() }];
    e.preventDefault();
  };

  private readonly onMove = (e: PointerEvent) => {
    if (!this.pointerDown || this.state !== 'playing') return;
    const p = this.toLocal(e);
    const prev = this.lastPt;
    this.trail.push({ ...p, t: performance.now() });
    if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) > 3) {
      // Tiếng "vút" khi vuốt nhanh.
      if (Math.hypot(p.x - prev.x, p.y - prev.y) > 35) sfx.play('whoosh');
      this.sliceAlong(prev.x, prev.y, p.x, p.y);
      this.lastPt = p;
    }
  };

  private readonly onUp = () => {
    this.pointerDown = false;
    this.lastPt = null;
  };

  private readonly onHidden = () => {
    this.pointerDown = false;
  };
}

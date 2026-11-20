/**
 * "Merge Fumo" — thả các bé fumo vào hộp quà; 2 bé cùng loại chạm nhau sẽ gộp thành bé lớn hơn.
 * Bé nào nằm vượt vạch đỏ quá 2 giây là thua. Gộp 2 bé lớn nhất → nổ tung, ăn điểm thưởng.
 * Vật lý hình tròn tự viết (trọng lực + va chạm), không dùng thư viện ngoài.
 */
import { playBaka, sfx } from '../../shared/sfx';
import { perf } from '../../core/perf';

export const W = 600;
export const H = 860;
const FONT = 'Montserrat, "Segoe UI", Roboto, Arial, sans-serif';
const BEST_KEY = 'fumo.merge.best';

// Hộp chứa
const BOX_L = 24;
const BOX_R = W - 24;
const BOX_B = H - 24;
const DANGER_Y = 210;
const DROP_Y = 120;
const GRAVITY = 1500;
const SUBSTEPS = 6;

export interface Tier {
  id: string;
  name: string;
  r: number;
  color: string;
  points: number;
}

/** 9 cấp, từ nhỏ tới lớn. */
export const TIERS: Tier[] = [
  { id: 'cirno', name: 'Cirno', r: 22, color: '#2f9bff', points: 2 },
  { id: 'meiling', name: 'Meiling', r: 30, color: '#21d07a', points: 6 },
  { id: 'yuyuko', name: 'Yuyuko', r: 39, color: '#ff7ad9', points: 12 },
  { id: 'teto', name: 'Satori', r: 49, color: '#ff3b5c', points: 20 },
  { id: 'flandre', name: 'Flandre', r: 60, color: '#ffd21f', points: 30 },
  { id: 'koishi', name: 'Koishi', r: 72, color: '#5fe39b', points: 42 },
  { id: 'yukari', name: 'Yukari', r: 86, color: '#a35cff', points: 56 },
  { id: 'remilia', name: 'Remilia', r: 101, color: '#ff8fb1', points: 72 },
  { id: 'reimu', name: 'Reimu', r: 118, color: '#ff4040', points: 90 },
];
const TOP_BONUS = 500;

export type MergeState = 'title' | 'playing' | 'over';
export interface MergeResult {
  score: number;
  best: number;
  newBest: boolean;
  biggest: number;
  merges: number;
}

interface Body {
  id: number;
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  m: number;
  rot: number;
  /** Thời điểm thả (s) — bé vừa thả chưa tính vượt vạch. */
  born: number;
  /** Hiệu ứng phồng lên khi vừa gộp. */
  pop: number;
  dead?: boolean;
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

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class MergeGame {
  state: MergeState = 'title';
  /** Thông số admin chỉnh (xem models/game-params.ts). */
  params: Record<string, number> = {};
  private p = (k: string, d: number) => this.params[k] ?? d;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly imgs: HTMLImageElement[] = [];
  private sprites: (HTMLCanvasElement | null)[] = [];
  private scale = 1;
  private raf = 0;
  private last = 0;
  private time = 0;

  private bodies: Body[] = [];
  private parts: Particle[] = [];
  private pops: { x: number; y: number; text: string; life: number; color: string }[] = [];
  private nextId = 1;
  private current = 0;
  private next = 0;
  private aimX = W / 2;
  private cooldown = 0;
  private dangerT = 0;
  private score = 0;
  private best = 0;
  private merges = 0;
  private biggest = 0;
  private shake = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onState: (s: MergeState, r?: MergeResult) => void,
  ) {
    this.ctx = canvas.getContext('2d')!;
    TIERS.forEach((t, i) => {
      const img = new Image();
      img.onload = () => this.buildSprite(i);
      img.src = `fumo-ninja/${t.id}.webp`;
      this.imgs[i] = img;
    });
    try {
      this.best = Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      this.best = 0;
    }
    this.resize();
    addEventListener('resize', this.resize);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerdown', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    addEventListener('keydown', this.onKey);
    this.raf = requestAnimationFrame(this.loop);
  }

  get bestScore(): number {
    return this.best;
  }

  start(): void {
    this.bodies = [];
    this.parts = [];
    this.pops = [];
    this.score = 0;
    this.merges = 0;
    this.biggest = 0;
    this.dangerT = 0;
    this.cooldown = 0.3;
    this.current = this.randTier();
    this.next = this.randTier();
    this.state = 'playing';
    this.onState('playing');
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.resize);
    removeEventListener('keydown', this.onKey);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerdown', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
  }

  // ---------- Hiển thị ----------
  private readonly resize = () => {
    const dpr = Math.min(perf.lite ? 1 : 2, devicePixelRatio || 1);
    const w = this.canvas.clientWidth || W;
    this.scale = (w / W) * dpr;
    this.canvas.width = Math.round(W * this.scale);
    this.canvas.height = Math.round(H * this.scale);
    TIERS.forEach((_, i) => this.buildSprite(i));
  };

  /** Dựng sẵn ảnh từng bé (vòng tròn màu + glow + ảnh fumo) để vẽ nhanh. */
  private buildSprite(i: number): void {
    const t = TIERS[i];
    const img = this.imgs[i];
    const pad = 10;
    const size = Math.ceil((t.r * 2 + pad * 2) * this.scale);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d')!;
    x.scale(this.scale, this.scale);
    const cx = t.r + pad;
    const g = x.createRadialGradient(cx, cx, t.r * 0.2, cx, cx, t.r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.7, t.color + '55');
    g.addColorStop(1, t.color + 'aa');
    x.fillStyle = g;
    x.beginPath();
    x.arc(cx, cx, t.r, 0, Math.PI * 2);
    x.fill();
    x.lineWidth = Math.max(2.5, t.r * 0.07);
    x.strokeStyle = t.color;
    x.shadowColor = t.color;
    x.shadowBlur = 10;
    x.stroke();
    x.shadowBlur = 0;
    if (img?.complete && img.naturalWidth) {
      x.save();
      x.beginPath();
      x.arc(cx, cx, t.r - 2, 0, Math.PI * 2);
      x.clip();
      const k = Math.min((t.r * 1.85) / img.naturalWidth, (t.r * 1.85) / img.naturalHeight);
      const iw = img.naturalWidth * k;
      const ih = img.naturalHeight * k;
      x.drawImage(img, cx - iw / 2, cx - ih / 2 + t.r * 0.06, iw, ih);
      x.restore();
    }
    this.sprites[i] = c;
  }

  // ---------- Điều khiển ----------
  private toGame(e: PointerEvent): number {
    const r = this.canvas.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * W;
  }

  private readonly onMove = (e: PointerEvent) => {
    if (this.state !== 'playing') return;
    this.aimX = this.toGame(e);
  };

  private readonly onUp = (e: PointerEvent) => {
    if (this.state !== 'playing') return;
    this.aimX = this.toGame(e);
    this.drop();
  };

  private readonly onKey = (e: KeyboardEvent) => {
    if (this.state !== 'playing') return;
    if (e.key === 'ArrowLeft') this.aimX -= 24;
    else if (e.key === 'ArrowRight') this.aimX += 24;
    else if (e.key === ' ' || e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      this.drop();
    }
  };

  /** Bé rơi ngẫu nhiên: chỉ 5 cấp nhỏ nhất, bé nhỏ hay ra hơn. */
  private randTier(): number {
    const w = [32, 26, 20, 13, 9];
    let n = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < w.length; i++) if ((n -= w[i]) < 0) return i;
    return 0;
  }

  private clampAim(t: number): number {
    const r = TIERS[t].r;
    return Math.min(BOX_R - r, Math.max(BOX_L + r, this.aimX));
  }

  private drop(): void {
    if (this.cooldown > 0) return;
    const t = TIERS[this.current];
    this.bodies.push(this.body(this.current, this.clampAim(this.current), DROP_Y, 0, 0));
    this.current = this.next;
    this.next = this.randTier();
    this.cooldown = this.p('cooldown', 0.55);
    sfx.play('whoosh');
    void t;
  }

  private body(t: number, x: number, y: number, vx: number, vy: number): Body {
    const r = TIERS[t].r;
    return { id: this.nextId++, t, x, y, vx, vy, r, m: r * r, rot: rand(-0.3, 0.3), born: this.time, pop: 0 };
  }

  // ---------- Vật lý ----------
  private step(dt: number): void {
    const h = dt / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) {
      for (const b of this.bodies) {
        b.vy += GRAVITY * (this.p('gravity', 100) / 100) * h;
        b.x += b.vx * h;
        b.y += b.vy * h;
        b.rot += (b.vx / b.r) * h * 0.6;
      }
      // Va chạm giữa các bé (vài vòng để chồng nhau ổn định).
      for (let it = 0; it < 3; it++) {
        const list = this.bodies;
        for (let i = 0; i < list.length; i++) {
          const a = list[i];
          if (a.dead) continue;
          for (let j = i + 1; j < list.length; j++) {
            const b = list[j];
            if (b.dead) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const min = a.r + b.r;
            const d2 = dx * dx + dy * dy;
            if (d2 >= min * min) continue;
            const d = Math.sqrt(d2) || 0.01;
            // Cùng loại → gộp.
            if (a.t === b.t) {
              this.merge(a, b);
              break;
            }
            const nx = dx / d;
            const ny = dy / d;
            const overlap = min - d;
            const total = a.m + b.m;
            a.x -= nx * overlap * (b.m / total);
            a.y -= ny * overlap * (b.m / total);
            b.x += nx * overlap * (a.m / total);
            b.y += ny * overlap * (a.m / total);
            const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (rv < 0) {
              const imp = (-(1 + 0.12) * rv) / (1 / a.m + 1 / b.m);
              a.vx -= (imp / a.m) * nx;
              a.vy -= (imp / a.m) * ny;
              b.vx += (imp / b.m) * nx;
              b.vy += (imp / b.m) * ny;
              // Ma sát tiếp tuyến nhẹ.
              const tx = -ny;
              const ty = nx;
              const vt = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
              const f = vt * 0.04;
              a.vx += tx * f * (b.m / total);
              a.vy += ty * f * (b.m / total);
              b.vx -= tx * f * (a.m / total);
              b.vy -= ty * f * (a.m / total);
            }
          }
        }
        if (this.bodies.some((b) => b.dead)) this.bodies = this.bodies.filter((b) => !b.dead);
        // Thành hộp.
        for (const b of this.bodies) {
          if (b.x - b.r < BOX_L) {
            b.x = BOX_L + b.r;
            if (b.vx < 0) b.vx *= -0.2;
          } else if (b.x + b.r > BOX_R) {
            b.x = BOX_R - b.r;
            if (b.vx > 0) b.vx *= -0.2;
          }
          if (b.y + b.r > BOX_B) {
            b.y = BOX_B - b.r;
            if (b.vy > 0) b.vy *= -0.15;
            b.vx *= 0.985;
          }
        }
      }
      for (const b of this.bodies) {
        b.vx *= 0.9995;
        b.vy *= 0.9995;
      }
    }
  }

  private merge(a: Body, b: Body): void {
    a.dead = b.dead = true;
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;
    const t = a.t;
    this.merges++;
    if (t === TIERS.length - 1) {
      // 2 bé lớn nhất → nổ tung, ăn thưởng.
      const bonus = this.p('topBonus', TOP_BONUS);
      this.score += bonus;
      this.burst(x, y, TIERS[t].color, 40);
      this.pops.push({ x, y, text: `🎉 +${bonus}`, life: 1.4, color: '#ffd23f' });
      this.shake = 14;
      sfx.play('win');
      return;
    }
    const n = this.body(t + 1, x, y, (a.vx + b.vx) / 2, (a.vy + b.vy) / 2 - 60);
    n.pop = 1;
    n.born = this.time - 10;
    this.bodies.push(n);
    const pts = TIERS[t + 1].points;
    this.score += pts;
    this.biggest = Math.max(this.biggest, t + 1);
    this.burst(x, y, TIERS[t + 1].color, perf.lite ? 8 : 16);
    this.pops.push({ x, y: y - TIERS[t + 1].r, text: '+' + pts, life: 0.9, color: TIERS[t + 1].color });
    if (t + 1 >= 6) this.shake = 6;
    sfx.play(t + 1 >= 5 ? 'combo' : 'pickup');
  }

  private burst(x: number, y: number, color: string, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(80, 320);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: 0, max: rand(0.4, 0.9), color, size: rand(3, 7) });
    }
  }

  private gameOver(): void {
    this.state = 'over';
    playBaka();
    const newBest = this.score > this.best;
    if (newBest) {
      this.best = this.score;
      try {
        localStorage.setItem(BEST_KEY, String(this.best));
      } catch {
        /* bỏ qua */
      }
    }
    sfx.play('gameover');
    this.onState('over', { score: this.score, best: this.best, newBest, biggest: this.biggest, merges: this.merges });
  }

  // ---------- Vòng lặp ----------
  private readonly loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden) {
      this.last = now;
      return;
    }
    const dt = Math.min(1 / 30, (now - (this.last || now)) / 1000);
    this.last = now;
    this.time += dt;
    if (this.state === 'playing') {
      this.cooldown = Math.max(0, this.cooldown - dt);
      this.step(dt);
      // Vượt vạch đỏ (bé đã thả hơn 1,2 giây) quá 2 giây → thua.
      const over = this.bodies.some((b) => this.time - b.born > 1.2 && b.y - b.r < DANGER_Y && Math.abs(b.vy) < 400);
      this.dangerT = over ? this.dangerT + dt : Math.max(0, this.dangerT - dt * 2);
      if (this.dangerT > this.p('dangerTime', 2)) this.gameOver();
    }
    for (const b of this.bodies) b.pop = Math.max(0, b.pop - dt * 4);
    for (const p of this.parts) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 600 * dt;
    }
    this.parts = this.parts.filter((p) => p.life < p.max);
    for (const p of this.pops) {
      p.life -= dt;
      p.y -= 50 * dt;
    }
    this.pops = this.pops.filter((p) => p.life > 0);
    this.shake = Math.max(0, this.shake - dt * 30);
    this.draw();
  };

  private draw(): void {
    const x = this.ctx;
    x.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    x.clearRect(0, 0, W, H);
    x.save();
    if (this.shake) x.translate(rand(-this.shake, this.shake) * 0.5, rand(-this.shake, this.shake) * 0.5);

    // Nền
    const bg = x.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#fff3f8');
    bg.addColorStop(1, '#ffe0ec');
    x.fillStyle = bg;
    x.fillRect(0, 0, W, H);
    // Hộp quà
    x.fillStyle = 'rgba(255,255,255,.55)';
    roundRect(x, BOX_L - 8, DANGER_Y - 40, BOX_R - BOX_L + 16, BOX_B - DANGER_Y + 48, 22);
    x.fill();
    x.lineWidth = 6;
    x.strokeStyle = '#ff9ec4';
    x.stroke();
    // Ruy băng 2 bên
    x.fillStyle = 'rgba(255,120,170,.18)';
    x.fillRect(W / 2 - 18, DANGER_Y - 40, 36, BOX_B - DANGER_Y + 48);

    // Vạch đỏ
    const warn = this.dangerT > 0;
    x.setLineDash([12, 10]);
    x.lineWidth = 3;
    x.strokeStyle = warn ? `rgba(255,40,60,${0.5 + Math.abs(Math.sin(this.time * 12)) * 0.5})` : 'rgba(255,60,90,.35)';
    x.beginPath();
    x.moveTo(BOX_L, DANGER_Y);
    x.lineTo(BOX_R, DANGER_Y);
    x.stroke();
    x.setLineDash([]);

    // Đường ngắm + bé đang cầm
    if (this.state === 'playing') {
      const ax = this.clampAim(this.current);
      x.strokeStyle = 'rgba(255,120,170,.45)';
      x.lineWidth = 2;
      x.setLineDash([4, 8]);
      x.beginPath();
      x.moveTo(ax, DROP_Y);
      x.lineTo(ax, BOX_B);
      x.stroke();
      x.setLineDash([]);
      x.globalAlpha = this.cooldown > 0 ? 0.45 : 1;
      this.drawBody(x, this.current, ax, DROP_Y, 0, 1);
      x.globalAlpha = 1;
    }

    for (const b of this.bodies) this.drawBody(x, b.t, b.x, b.y, b.rot, 1 + b.pop * 0.15);

    for (const p of this.parts) {
      x.globalAlpha = 1 - p.life / p.max;
      x.fillStyle = p.color;
      x.beginPath();
      x.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      x.fill();
    }
    x.globalAlpha = 1;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    for (const p of this.pops) {
      x.globalAlpha = Math.min(1, p.life * 2);
      x.font = `900 26px ${FONT}`;
      x.lineWidth = 5;
      x.strokeStyle = '#fff';
      x.strokeText(p.text, p.x, p.y);
      x.fillStyle = p.color;
      x.fillText(p.text, p.x, p.y);
    }
    x.globalAlpha = 1;
    x.restore();

    // HUD
    x.textAlign = 'left';
    x.fillStyle = '#7a2d50';
    x.font = `900 30px ${FONT}`;
    x.fillText(this.score.toLocaleString('vi-VN'), 28, 40);
    x.font = `700 14px ${FONT}`;
    x.fillStyle = '#b0607f';
    x.fillText(`Kỷ lục ${Math.max(this.best, this.score).toLocaleString('vi-VN')}`, 28, 70);
    if (this.state === 'playing') {
      x.textAlign = 'right';
      x.fillStyle = '#b0607f';
      x.font = `800 14px ${FONT}`;
      x.fillText('Tiếp theo', W - 86, 46);
      const nt = TIERS[this.next];
      const s = Math.min(1, 26 / nt.r);
      this.drawBody(x, this.next, W - 48, 46, 0, s);
    }
    if (this.dangerT > 0.3 && this.state === 'playing') {
      x.textAlign = 'center';
      x.fillStyle = '#e0233f';
      x.font = `900 20px ${FONT}`;
      x.fillText(`⚠ Sắp tràn hộp! ${Math.max(0, this.p('dangerTime', 2) - this.dangerT).toFixed(1)}s`, W / 2, DANGER_Y - 18);
    }
  }

  private drawBody(x: CanvasRenderingContext2D, t: number, px: number, py: number, rot: number, s: number): void {
    const sp = this.sprites[t];
    const tier = TIERS[t];
    if (!sp) {
      x.fillStyle = tier.color;
      x.beginPath();
      x.arc(px, py, tier.r * s, 0, Math.PI * 2);
      x.fill();
      return;
    }
    const size = (tier.r * 2 + 20) * s;
    x.save();
    x.translate(px, py);
    x.rotate(rot);
    x.drawImage(sp, -size / 2, -size / 2, size, size);
    x.restore();
  }
}

function roundRect(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, r: number): void {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}

import { Component, DestroyRef, ElementRef, effect, inject, input, viewChild } from '@angular/core';
import { perf } from '../../core/perf';

interface TrailPt {
  x: number;
  y: number;
  t: number;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  color: string;
}
interface Bubble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
  color: string;
}
interface Ring {
  x: number;
  y: number;
  life: number;
  max: number;
  color: string;
}

const NEON = ['#ff2d95', '#ff5fd2', '#b26bff', '#00e5ff'];
const PASTEL = ['#60b5ff', '#ff9ec4', '#ffd23f', '#9be7c4', '#c9a7ff'];

/**
 * Hiệu ứng con trỏ cho trang khách:
 *  - Giao diện tối: vệt neon phát sáng chạy theo chuột.
 *  - Giao diện sáng: bụi lấp lánh pastel rơi theo chuột.
 *  - Bấm / chạm: chùm bong bóng bung ra, bay lên rồi vỡ.
 * Canvas phủ màn hình nhưng không bắt chuột; chỉ vẽ khi có hiệu ứng. Tắt khi "giảm chuyển động".
 */
@Component({
  selector: 'app-cursor-fx',
  template: `<canvas #cv aria-hidden="true"></canvas>`,
  styles: `
    :host { display: contents; }
    canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 998; pointer-events: none; }
  `,
})
export class CursorFxComponent {
  readonly dark = input(false);
  private readonly cv = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
  private ctx?: CanvasRenderingContext2D;
  private dpr = 1;
  private raf = 0;
  private last = 0;
  private trail: TrailPt[] = [];
  private sparks: Spark[] = [];
  private bubbles: Bubble[] = [];
  private rings: Ring[] = [];
  private mouse: { x: number; y: number } | null = null;
  private lastSpark = { x: 0, y: 0 };
  private hue = 0;
  /** Chuột thật (không phải màn cảm ứng) → mới có vệt theo con trỏ. */
  private readonly finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() {
    const onMove = (e: PointerEvent) => this.move(e);
    const onDown = (e: PointerEvent) => this.burst(e.clientX, e.clientY);
    const onLeave = () => (this.mouse = null);
    const onResize = () => this.resize();
    if (!this.reduced) {
      addEventListener('pointermove', onMove, { passive: true });
      addEventListener('pointerdown', onDown, { passive: true });
      document.addEventListener('pointerleave', onLeave);
      addEventListener('resize', onResize);
    }
    effect(() => {
      this.dark();
      // Đổi sáng / tối → xoá hiệu ứng cũ.
      this.trail = [];
      this.sparks = [];
    });
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(this.raf);
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointerleave', onLeave);
      removeEventListener('resize', onResize);
    });
  }

  private ensure(): CanvasRenderingContext2D | undefined {
    if (!this.ctx) {
      this.ctx = this.cv().nativeElement.getContext('2d') ?? undefined;
      this.resize();
    }
    return this.ctx;
  }

  private resize(): void {
    const c = this.cv().nativeElement;
    this.dpr = Math.min(perf.lite ? 1 : 1.5, devicePixelRatio || 1);
    c.width = Math.round(innerWidth * this.dpr);
    c.height = Math.round(innerHeight * this.dpr);
  }

  private kick(): void {
    if (!this.raf) {
      this.last = 0;
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  private move(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || !this.finePointer || perf.lite) return;
    this.ensure();
    const now = performance.now();
    this.mouse = { x: e.clientX, y: e.clientY };
    if (this.dark()) {
      this.trail.push({ x: e.clientX, y: e.clientY, t: now });
      if (this.trail.length > 40) this.trail.shift();
    } else {
      // Rắc bụi lấp lánh theo quãng đường chuột đi.
      const dx = e.clientX - this.lastSpark.x;
      const dy = e.clientY - this.lastSpark.y;
      if (dx * dx + dy * dy > 120) {
        this.lastSpark = { x: e.clientX, y: e.clientY };
        this.sparks.push({
          x: e.clientX + (Math.random() - 0.5) * 8,
          y: e.clientY + (Math.random() - 0.5) * 8,
          vx: (Math.random() - 0.5) * 30,
          vy: 20 + Math.random() * 40,
          life: 0,
          max: 0.6 + Math.random() * 0.5,
          size: 3 + Math.random() * 4,
          rot: Math.random() * Math.PI,
          color: PASTEL[Math.floor(Math.random() * PASTEL.length)],
        });
        if (this.sparks.length > 80) this.sparks.shift();
      }
    }
    this.kick();
  }

  private burst(x: number, y: number): void {
    if (!this.ensure()) return;
    const colors = this.dark() ? NEON : PASTEL;
    const n = perf.lite ? 6 : 10;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
      const s = 60 + Math.random() * 140;
      this.bubbles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        r: 4 + Math.random() * 10,
        life: 0,
        max: 0.7 + Math.random() * 0.6,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
    this.rings.push({ x, y, life: 0, max: 0.45, color: colors[0] });
    if (this.bubbles.length > 120) this.bubbles.splice(0, this.bubbles.length - 120);
    this.kick();
  }

  private readonly frame = (now: number) => {
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    const x = this.ctx;
    if (!x) {
      this.raf = 0;
      return;
    }
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    x.clearRect(0, 0, innerWidth, innerHeight);
    const dark = this.dark();

    // ----- Vệt neon (tối) -----
    if (dark) {
      const cut = performance.now() - 260;
      this.trail = this.trail.filter((p) => p.t > cut);
      this.hue = (this.hue + dt * 90) % 360;
      if (this.trail.length > 1) {
        x.save();
        x.globalCompositeOperation = 'lighter';
        x.lineCap = 'round';
        x.lineJoin = 'round';
        for (let i = 1; i < this.trail.length; i++) {
          const a = this.trail[i - 1];
          const b = this.trail[i];
          const k = i / this.trail.length;
          const col = `hsl(${(this.hue + k * 120) % 360}, 100%, 62%)`;
          x.strokeStyle = col;
          x.shadowColor = col;
          x.shadowBlur = 16;
          x.globalAlpha = k * 0.9;
          x.lineWidth = 1.5 + k * 5;
          x.beginPath();
          x.moveTo(a.x, a.y);
          x.lineTo(b.x, b.y);
          x.stroke();
        }
        x.restore();
      }
      if (this.mouse) {
        const g = x.createRadialGradient(this.mouse.x, this.mouse.y, 0, this.mouse.x, this.mouse.y, 22);
        g.addColorStop(0, `hsla(${this.hue}, 100%, 75%, .55)`);
        g.addColorStop(1, `hsla(${this.hue}, 100%, 60%, 0)`);
        x.fillStyle = g;
        x.beginPath();
        x.arc(this.mouse.x, this.mouse.y, 22, 0, Math.PI * 2);
        x.fill();
      }
    }

    // ----- Bụi lấp lánh (sáng) -----
    for (const s of this.sparks) {
      s.life += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += dt * 3;
      const k = 1 - s.life / s.max;
      if (k <= 0) continue;
      x.save();
      x.globalAlpha = k;
      x.translate(s.x, s.y);
      x.rotate(s.rot);
      x.fillStyle = s.color;
      const r = s.size * (0.6 + k * 0.4);
      // Ngôi sao 4 cánh
      x.beginPath();
      for (let i = 0; i < 8; i++) {
        const rr = i % 2 ? r * 0.35 : r;
        const a = (i / 8) * Math.PI * 2;
        x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      x.closePath();
      x.fill();
      x.restore();
    }
    this.sparks = this.sparks.filter((s) => s.life < s.max);

    // ----- Bong bóng khi bấm -----
    for (const r of this.rings) {
      r.life += dt;
      const k = r.life / r.max;
      x.save();
      x.globalAlpha = Math.max(0, 1 - k);
      x.strokeStyle = r.color;
      x.lineWidth = 2;
      if (dark) {
        x.shadowColor = r.color;
        x.shadowBlur = 12;
      }
      x.beginPath();
      x.arc(r.x, r.y, 6 + k * 34, 0, Math.PI * 2);
      x.stroke();
      x.restore();
    }
    this.rings = this.rings.filter((r) => r.life < r.max);

    for (const b of this.bubbles) {
      b.life += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx *= 0.96;
      b.vy = b.vy * 0.96 - 40 * dt; // bay lên nhẹ
      const k = b.life / b.max;
      if (k >= 1) continue;
      const r = b.r * (0.6 + k * 0.7);
      x.save();
      x.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1;
      if (dark) {
        x.shadowColor = b.color;
        x.shadowBlur = 10;
      }
      // Thân bong bóng trong suốt + viền màu
      const g = x.createRadialGradient(b.x - r * 0.3, b.y - r * 0.3, r * 0.1, b.x, b.y, r);
      g.addColorStop(0, 'rgba(255,255,255,.55)');
      g.addColorStop(0.6, dark ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.25)');
      g.addColorStop(1, b.color + '55');
      x.fillStyle = g;
      x.strokeStyle = b.color;
      x.lineWidth = 1.5;
      x.beginPath();
      x.arc(b.x, b.y, r, 0, Math.PI * 2);
      x.fill();
      x.stroke();
      // Đốm sáng phản chiếu
      x.fillStyle = 'rgba(255,255,255,.85)';
      x.beginPath();
      x.arc(b.x - r * 0.35, b.y - r * 0.35, Math.max(1, r * 0.18), 0, Math.PI * 2);
      x.fill();
      x.restore();
      // Vỡ: chấm nhỏ bắn ra lúc cuối
      if (k > 0.93 && !perf.lite) {
        x.fillStyle = b.color;
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + b.r;
          x.fillRect(b.x + Math.cos(a) * r * 1.2, b.y + Math.sin(a) * r * 1.2, 2, 2);
        }
      }
    }
    this.bubbles = this.bubbles.filter((b) => b.life < b.max);

    // Còn gì để vẽ thì vẽ tiếp, không thì dừng (tiết kiệm pin).
    // Chuột đứng yên (hết vệt) và không còn bụi / bong bóng → dừng hẳn.
    const busy = this.sparks.length || this.bubbles.length || this.rings.length || (dark && this.trail.length > 0);
    if (busy) {
      this.raf = requestAnimationFrame(this.frame);
    } else {
      x.clearRect(0, 0, innerWidth, innerHeight);
      this.raf = 0;
    }
  };
}

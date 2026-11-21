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
/** Hiệu ứng "công nghệ" khi bấm (giao diện tối): khung ngắm, lục giác, mạch điện, chữ số bay. */
interface Tech {
  x: number;
  y: number;
  life: number;
  max: number;
  rot: number;
  /** Đường mạch: góc, độ dài đoạn 1, độ dài đoạn 2, hướng rẽ. */
  lines: { a: number; l1: number; l2: number; turn: number }[];
  digits: { dx: number; dy: number; ch: string; vy: number }[];
}
/** Gợn sóng khi bấm (giao diện sáng). */
interface Ripple {
  x: number;
  y: number;
  life: number;
  color: string;
}
/** Thời gian 1 gợn sóng (giây). */
const RIPPLE_LIFE = 0.75;
/** Khoảng cách tối thiểu giữa 2 lần bấm có hiệu ứng (ms) - spam click không bị lag. */
const CLICK_GAP = 90;
/** Số hiệu ứng bấm tối đa cùng lúc. */
const MAX_TECH = 3;
const MAX_RIPPLE = 5;

const PASTEL = ['#60b5ff', '#ff9ec4', '#ffd23f', '#9be7c4', '#c9a7ff'];

/**
 * Hiệu ứng con trỏ cho trang khách:
 *  - Vệt neon chạy theo chuột (máy tính) - bản tối sáng rực, bản sáng màu đậm hơn để nổi trên nền trắng.
 *  - Giao diện sáng: thêm bụi lấp lánh pastel; bấm / chạm → gợn sóng (ripple) lan ra.
 *  - Giao diện tối: bấm / chạm → hiệu ứng công nghệ (khung ngắm, lục giác, mạch điện, chữ số bay).
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
  private ripples: Ripple[] = [];
  private techs: Tech[] = [];
  private lastClick = 0;
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
    // Vệt neon theo con trỏ (cả sáng lẫn tối).
    this.trail.push({ x: e.clientX, y: e.clientY, t: now });
    if (this.trail.length > 40) this.trail.shift();
    if (!this.dark()) {
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
    // Chống spam: bấm dồn dập thì bỏ bớt, chỉ giữ vài hiệu ứng mới nhất.
    const now = performance.now();
    if (now - this.lastClick < CLICK_GAP) return;
    this.lastClick = now;
    if (this.dark()) {
      this.techBurst(x, y);
      return;
    }
    this.ripples.push({ x, y, life: 0, color: PASTEL[Math.floor(Math.random() * PASTEL.length)] });
    if (this.ripples.length > MAX_RIPPLE) this.ripples.shift();
    this.kick();
  }

  private techBurst(x: number, y: number): void {
    const off = Math.random() * Math.PI;
    const n = perf.lite ? 4 : 6;
    this.techs.push({
      x,
      y,
      life: 0,
      max: 0.95,
      rot: Math.random() * Math.PI,
      lines: Array.from({ length: n }, (_, i) => ({
        a: off + (i / n) * Math.PI * 2,
        l1: 16 + Math.random() * 18,
        l2: 12 + Math.random() * 20,
        turn: Math.random() < 0.5 ? -1 : 1,
      })),
      digits: Array.from({ length: perf.lite ? 3 : 6 }, () => ({
        dx: (Math.random() - 0.5) * 70,
        dy: (Math.random() - 0.5) * 40,
        ch: Math.random() < 0.6 ? (Math.random() < 0.5 ? '0' : '1') : '0123456789ABCDEF'[Math.floor(Math.random() * 16)],
        vy: 30 + Math.random() * 40,
      })),
    });
    if (this.techs.length > MAX_TECH) this.techs.shift();
    this.kick();
  }

  /** Vẽ 1 hiệu ứng công nghệ. */
  private drawTech(x: CanvasRenderingContext2D, t: Tech, glow: boolean): void {
    const k = t.life / t.max;
    const ease = 1 - Math.pow(1 - Math.min(1, k * 1.6), 3);
    const fade = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    const cyan = '#00e5ff';
    const pink = '#ff2d95';
    x.save();
    x.globalCompositeOperation = 'lighter';
    x.translate(t.x, t.y);
    x.lineCap = 'round';
    // shadowBlur rất tốn CPU → chỉ bật khi có ít hiệu ứng trên màn hình.
    x.shadowBlur = glow ? 12 : 0;

    // 1) Lục giác lan ra
    x.globalAlpha = fade * (1 - k * 0.6);
    x.strokeStyle = cyan;
    x.shadowColor = cyan;
    x.lineWidth = 1.6;
    const hr = 10 + ease * 44;
    x.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2 + t.rot;
      x.lineTo(Math.cos(a) * hr, Math.sin(a) * hr);
    }
    x.stroke();

    // 2) Vòng nét đứt xoay
    x.save();
    x.rotate(t.rot + k * 4);
    x.setLineDash([7, 6]);
    x.globalAlpha = fade * 0.9;
    x.strokeStyle = pink;
    x.shadowColor = pink;
    x.lineWidth = 1.4;
    x.beginPath();
    x.arc(0, 0, 20 + ease * 6, 0, Math.PI * 2);
    x.stroke();
    x.restore();

    // 3) Khung ngắm 4 góc thu vào (khoá mục tiêu)
    const br = 40 - ease * 16;
    const bl = 8;
    x.globalAlpha = fade;
    x.strokeStyle = cyan;
    x.shadowColor = cyan;
    x.lineWidth = 2;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      x.beginPath();
      x.moveTo(sx * br, sy * (br - bl));
      x.lineTo(sx * br, sy * br);
      x.lineTo(sx * (br - bl), sy * br);
      x.stroke();
    }

    // 4) Đường mạch điện có nút
    x.strokeStyle = pink;
    x.shadowColor = pink;
    x.fillStyle = pink;
    x.lineWidth = 1.3;
    const grow = Math.min(1, k * 2.2);
    for (const l of t.lines) {
      const c1 = Math.cos(l.a);
      const s1 = Math.sin(l.a);
      const a2 = l.a + l.turn * (Math.PI / 4);
      const r0 = 24;
      const p1x = c1 * (r0 + l.l1);
      const p1y = s1 * (r0 + l.l1);
      const d1 = Math.min(1, grow * 2);
      const d2 = Math.max(0, grow * 2 - 1);
      x.globalAlpha = fade * 0.95;
      x.beginPath();
      x.moveTo(c1 * r0, s1 * r0);
      x.lineTo(c1 * (r0 + l.l1 * d1), s1 * (r0 + l.l1 * d1));
      if (d2 > 0) x.lineTo(p1x + Math.cos(a2) * l.l2 * d2, p1y + Math.sin(a2) * l.l2 * d2);
      x.stroke();
      if (d2 >= 1) {
        const ex = p1x + Math.cos(a2) * l.l2;
        const ey = p1y + Math.sin(a2) * l.l2;
        x.fillRect(ex - 2.5, ey - 2.5, 5, 5);
      }
    }

    // 5) Chữ số nhị phân / hex bay lên
    x.shadowBlur = glow ? 8 : 0;
    x.shadowColor = cyan;
    x.fillStyle = cyan;
    x.font = '700 11px ui-monospace, Consolas, monospace';
    x.textAlign = 'center';
    for (const d of t.digits) {
      x.globalAlpha = fade * 0.85;
      x.fillText(d.ch, d.dx, d.dy - d.vy * t.life);
    }

    // 6) Chớp sáng ở tâm
    if (k < 0.25) {
      x.globalAlpha = 1 - k / 0.25;
      x.fillStyle = '#fff';
      x.shadowColor = cyan;
      x.shadowBlur = glow ? 20 : 0;
      x.beginPath();
      x.arc(0, 0, 4 + k * 20, 0, Math.PI * 2);
      x.fill();
    }
    x.restore();
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

    // ----- Vệt neon theo con trỏ (tối: sáng rực trên nền đen · sáng: màu đậm hơn để nổi trên nền trắng) -----
    {
      const cut = performance.now() - 260;
      this.trail = this.trail.filter((p) => p.t > cut);
      this.hue = (this.hue + dt * 90) % 360;
      if (this.trail.length > 1) {
        x.save();
        x.globalCompositeOperation = dark ? 'lighter' : 'source-over';
        x.lineCap = 'round';
        x.lineJoin = 'round';
        // Quầng sáng: 1 nét rộng mờ cho cả vệt (rẻ hơn nhiều so với shadowBlur từng đoạn).
        x.globalAlpha = dark ? 0.22 : 0.16;
        x.strokeStyle = `hsl(${this.hue}, 100%, ${dark ? 62 : 55}%)`;
        x.lineWidth = 14;
        x.beginPath();
        x.moveTo(this.trail[0].x, this.trail[0].y);
        for (const p of this.trail) x.lineTo(p.x, p.y);
        x.stroke();
        for (let i = 1; i < this.trail.length; i++) {
          const a = this.trail[i - 1];
          const b = this.trail[i];
          const k = i / this.trail.length;
          const col = dark ? `hsl(${(this.hue + k * 120) % 360}, 100%, 62%)` : `hsl(${(this.hue + k * 120) % 360}, 95%, 55%)`;
          x.strokeStyle = col;
          x.globalAlpha = k * (dark ? 0.9 : 0.75);
          x.lineWidth = 1.5 + k * 5;
          x.beginPath();
          x.moveTo(a.x, a.y);
          x.lineTo(b.x, b.y);
          x.stroke();
        }
        x.restore();
      }
      if (this.mouse && this.trail.length) {
        const g = x.createRadialGradient(this.mouse.x, this.mouse.y, 0, this.mouse.x, this.mouse.y, 22);
        g.addColorStop(0, `hsla(${this.hue}, 100%, ${dark ? 75 : 60}%, ${dark ? 0.55 : 0.35})`);
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

    // ----- Hiệu ứng công nghệ khi bấm (tối) -----
    const glow = this.techs.length <= 1 && !perf.lite;
    for (const t of this.techs) {
      t.life += dt;
      if (t.life < t.max) this.drawTech(x, t, glow);
    }
    this.techs = this.techs.filter((t) => t.life < t.max);

    // ----- Gợn sóng (ripple) khi bấm (sáng): đĩa mờ + 2 vòng lan ra lệch nhịp -----
    for (const r of this.ripples) {
      r.life += dt;
      const k = r.life / RIPPLE_LIFE;
      if (k >= 1) continue;
      const out = 1 - Math.pow(1 - k, 3); // chậm dần
      x.save();
      x.fillStyle = r.color;
      x.globalAlpha = 0.18 * (1 - k);
      x.beginPath();
      x.arc(r.x, r.y, 4 + out * 26, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = r.color;
      for (const [delay, size, w] of [[0, 44, 2.5], [0.18, 30, 1.5]]) {
        const kk = (k - delay) / (1 - delay);
        if (kk <= 0) continue;
        const e = 1 - Math.pow(1 - kk, 3);
        x.globalAlpha = 1 - kk;
        x.lineWidth = w * (1 - kk * 0.6);
        x.beginPath();
        x.arc(r.x, r.y, 4 + e * size, 0, Math.PI * 2);
        x.stroke();
      }
      x.restore();
    }
    this.ripples = this.ripples.filter((r) => r.life < RIPPLE_LIFE);

    // Còn gì để vẽ thì vẽ tiếp, không thì dừng (tiết kiệm pin).
    const busy = this.sparks.length || this.ripples.length || this.techs.length || this.trail.length > 0;
    if (busy) {
      this.raf = requestAnimationFrame(this.frame);
    } else {
      x.clearRect(0, 0, innerWidth, innerHeight);
      this.raf = 0;
    }
  };
}

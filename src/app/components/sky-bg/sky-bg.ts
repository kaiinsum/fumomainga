import { Component, DestroyRef, ElementRef, NgZone, afterNextRender, effect, inject, input } from '@angular/core';
import { Theme } from '../../services/theme.service';

interface Bubble {
  x: number;
  y: number;
  r: number;
  speed: number;
  hue: number;
  hue2: number;
  phase: number;
  wobble: number;
  alpha: number;
}

interface Star {
  x: number;
  /** Toạ độ y trong "bầu trời" cao gấp đôi màn hình, cuộn vòng. */
  y: number;
  r: number;
  depth: number;
  phase: number;
  twinkle: number;
}

interface Constellation {
  stars: { x: number; y: number; r: number }[];
  links: [number, number][];
  depth: number;
  phase: number;
}

/** Ảnh trang trí mờ ở nền chế độ sáng (đặt trong public/bg). */
interface Sprite {
  src: string;
  /** Vị trí tâm theo tỉ lệ màn hình (0–1). */
  fx: number;
  fy: number;
  /** Chiều cao theo tỉ lệ chiều cao màn hình. */
  fh: number;
  maxH: number;
  tilt: number;
  phase: number;
  img?: HTMLCanvasElement;
  /** Vị trí/kích thước đã tính cho khung hình hiện tại. */
  box?: { x: number; y: number; w: number; h: number };
}

/** Ngôi sao nhỏ tỏa ra khi cuộn. */
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  vr: number;
  hue: number;
}

const SPRITES: Record<Theme, Omit<Sprite, 'img' | 'box'>[]> = {
  light: [
    { src: 'bg/cirno.webp', fx: 0.1, fy: 0.42, fh: 0.62, maxH: 560, tilt: -0.06, phase: 0 },
    { src: 'bg/fumo-cirno.webp', fx: 0.88, fy: 0.66, fh: 0.42, maxH: 380, tilt: 0.07, phase: 2.1 },
  ],
  dark: [
    { src: 'bg/reimu-1.webp', fx: 0.1, fy: 0.46, fh: 0.72, maxH: 620, tilt: -0.04, phase: 0 },
    { src: 'bg/reimu-2.webp', fx: 0.89, fy: 0.6, fh: 0.66, maxH: 560, tilt: 0.05, phase: 2.1 },
  ],
};
const SPRITE_ALPHA: Record<Theme, number> = { light: 0.2, dark: 0.16 };
/** Màu sao — sáng: vàng, hồng, xanh trời, tím; tối: đỏ neon, hồng, vàng, cam. */
const SPARK_HUES: Record<Theme, number[]> = { light: [45, 50, 330, 200, 270], dark: [350, 355, 340, 45, 15] };
const MAX_SPARKS = 180;

/** Bảng màu pastel cho bong bóng (hue HSL). */
const BUBBLE_HUES = [200, 215, 265, 290, 330, 350, 20, 165, 185];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Nền động cho trang công khai:
 * - Sáng: bong bóng gradient nhiều màu nổi lên + ảnh fumo mờ; cuộn trang thì bóng nổi nhanh hơn
 *   và các ảnh tỏa ra ngôi sao.
 * - Tối: bầu trời sao + chòm sao; lăn chuột lên/xuống thì bầu trời trôi theo.
 * Tự đứng yên nếu người dùng bật "giảm chuyển động" trong hệ điều hành.
 */
@Component({
  selector: 'app-sky-bg',
  template: `<canvas aria-hidden="true"></canvas>`,
  styles: `
    :host { position: fixed; inset: 0; z-index: -1; pointer-events: none; }
    canvas { width: 100%; height: 100%; display: block; }
  `,
})
export class SkyBackgroundComponent {
  readonly theme = input.required<Theme>();

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);

  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private raf = 0;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  private bubbles: Bubble[] = [];
  private stars: Star[] = [];
  private constellations: Constellation[] = [];
  private readonly spriteSets: Record<Theme, Sprite[]> = {
    light: SPRITES.light.map((s) => ({ ...s })),
    dark: SPRITES.dark.map((s) => ({ ...s })),
  };
  private readonly spritesLoaded = new Set<Theme>();
  private get sprites(): Sprite[] {
    return this.spriteSets[this.theme()];
  }
  private sparks: Spark[] = [];
  /** Số sao còn "nợ" phải tỏa ra, tăng theo quãng đường cuộn. */
  private emitBudget = 0;
  /** Màu chủ đạo dạng [r, g, b] (canvas không hiểu biến CSS). */
  private primary: [number, number, number] = [96, 181, 255];

  /** Bong bóng: hệ số tăng tốc do cuộn, giảm dần về 0. */
  private boost = 0;
  /** Bầu trời: vị trí trôi + vận tốc do lăn chuột. */
  private skyOffset = 0;
  private skyVel = 0;
  private lastScrollY = scrollY;
  private lastWheel = 0;
  private time = 0;

  constructor() {
    afterNextRender(() => {
      this.canvas = this.host.querySelector('canvas')!;
      this.ctx = this.canvas.getContext('2d')!;
      this.zone.runOutsideAngular(() => this.start());
    });

    // Đổi chế độ sáng/tối → dựng lại cảnh.
    effect(() => {
      this.theme();
      if (this.ctx) this.build();
    });

    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(this.raf);
      removeEventListener('resize', this.onResize);
      removeEventListener('scroll', this.onScroll);
      removeEventListener('wheel', this.onWheel);
    });
  }

  private start(): void {
    addEventListener('resize', this.onResize, { passive: true });
    addEventListener('scroll', this.onScroll, { passive: true });
    addEventListener('wheel', this.onWheel, { passive: true });
    this.resize();
    this.build();
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(50, now - last) / 16.67; // 1 = một khung hình ở 60fps
      last = now;
      this.time += dt;
      this.step(dt);
      this.draw();
      if (!this.reduced) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // ---------- Sự kiện ----------
  private readonly onResize = () => {
    this.resize();
    this.build();
    if (this.reduced) this.draw();
  };

  private readonly onScroll = () => {
    const dy = scrollY - this.lastScrollY;
    this.lastScrollY = scrollY;
    this.boost = Math.min(14, this.boost + Math.abs(dy) * 0.06);
    this.emitBudget = Math.min(40, this.emitBudget + Math.abs(dy) * 0.1);
    // Cảm ứng / thanh cuộn (không có sự kiện wheel) cũng làm bầu trời trôi.
    if (performance.now() - this.lastWheel > 120) this.skyVel += dy * 0.05;
  };

  private readonly onWheel = (e: WheelEvent) => {
    this.lastWheel = performance.now();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this.skyVel = Math.max(-40, Math.min(40, this.skyVel + dy * 0.06));
    // Trang ngắn không cuộn được vẫn cho bong bóng tăng tốc khi lăn chuột.
    if (document.documentElement.scrollHeight <= innerHeight + 2) {
      this.boost = Math.min(14, this.boost + Math.abs(dy) * 0.03);
      this.emitBudget = Math.min(40, this.emitBudget + Math.abs(dy) * 0.04);
    }
  };

  private resize(): void {
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.w = innerWidth;
    this.h = innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  // ---------- Dựng cảnh ----------
  private build(): void {
    this.primary = this.readPrimary();
    // Lớp .dark của layout có thể chưa gắn xong ở khung hình này → đọc lại màu chủ đạo ở khung sau.
    requestAnimationFrame(() => (this.primary = this.readPrimary()));
    this.sparks = [];
    this.loadSprites();
    const area = (this.w * this.h) / (1280 * 800);
    if (this.theme() === 'light') {
      const n = Math.round(Math.max(10, Math.min(34, 24 * area)));
      this.bubbles = Array.from({ length: n }, () => this.newBubble(rand(0, this.h + 100)));
    } else {
      const skyH = this.h * 2;
      const n = Math.round(Math.max(80, Math.min(320, 220 * area)));
      this.stars = Array.from({ length: n }, () => ({
        x: rand(0, this.w),
        y: rand(0, skyH),
        r: Math.random() < 0.9 ? rand(0.4, 1.2) : rand(1.3, 2),
        depth: rand(0.2, 1),
        phase: rand(0, Math.PI * 2),
        twinkle: rand(0.02, 0.06),
      }));
      const count = Math.round(Math.max(4, Math.min(9, 7 * area)));
      this.constellations = Array.from({ length: count }, (_, i) => this.newConstellation((skyH / count) * (i + 0.5)));
    }
    this.draw();
  }

  /** Tải ảnh trang trí một lần; làm mờ sẵn vào canvas phụ để vẽ mỗi khung hình cho nhẹ. */
  private loadSprites(): void {
    const theme = this.theme();
    if (this.spritesLoaded.has(theme)) return;
    this.spritesLoaded.add(theme);
    for (const sp of this.spriteSets[theme]) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        const pad = 8;
        const c = document.createElement('canvas');
        c.width = img.naturalWidth + pad * 2;
        c.height = img.naturalHeight + pad * 2;
        const g = c.getContext('2d')!;
        g.filter = 'blur(1.5px) saturate(1.15)';
        g.drawImage(img, pad, pad);
        sp.img = c;
        if (this.reduced) this.draw();
      };
      img.src = sp.src;
    }
  }

  /** Tỏa sao ra từ quanh các ảnh trang trí (hoặc giữa màn hình nếu ảnh chưa tải). */
  private emitSpark(): void {
    const boxes = this.sprites.map((s) => s.box).filter((b): b is NonNullable<Sprite['box']> => !!b);
    const b = boxes.length ? pick(boxes) : { x: this.w * 0.3, y: this.h * 0.3, w: this.w * 0.4, h: this.h * 0.4 };
    const angle = rand(0, Math.PI * 2);
    const speed = rand(1.6, 4.8);
    this.sparks.push({
      x: b.x + b.w / 2 + Math.cos(angle) * b.w * 0.25,
      y: b.y + b.h / 2 + Math.sin(angle) * b.h * 0.25,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      max: rand(45, 85),
      size: rand(5, 12),
      rot: rand(0, Math.PI),
      vr: rand(-0.12, 0.12),
      hue: pick(SPARK_HUES[this.theme()]),
    });
  }

  private newBubble(y: number): Bubble {
    const hue = pick(BUBBLE_HUES);
    const r = Math.random() < 0.75 ? rand(14, 48) : rand(55, 110);
    return {
      x: rand(-20, this.w + 20),
      y,
      r,
      // Bóng nhỏ nổi nhanh hơn bóng lớn một chút.
      speed: rand(0.25, 0.6) * (1.3 - r / 160),
      hue,
      hue2: hue + rand(30, 70),
      phase: rand(0, Math.PI * 2),
      wobble: rand(0.4, 1.4),
      alpha: rand(0.35, 0.65),
    };
  }

  /** Một chòm sao: 4–7 ngôi sao nối nhau, thỉnh thoảng có nhánh rẽ. */
  private newConstellation(cy: number): Constellation {
    const n = Math.floor(rand(4, 8));
    const size = Math.min(this.w, this.h) * rand(0.12, 0.22);
    let x = rand(size, Math.max(size + 1, this.w - size));
    let y = cy + rand(-this.h * 0.2, this.h * 0.2);
    let angle = rand(0, Math.PI * 2);
    const stars = [{ x, y, r: rand(1.4, 2.4) }];
    const links: [number, number][] = [];
    for (let i = 1; i < n; i++) {
      angle += rand(-1.1, 1.1);
      const step = size * rand(0.35, 0.6);
      const from = i > 2 && Math.random() < 0.25 ? Math.floor(rand(0, i - 1)) : i - 1;
      x = stars[from].x + Math.cos(angle) * step;
      y = stars[from].y + Math.sin(angle) * step;
      stars.push({ x, y, r: rand(1.2, 2.4) });
      links.push([from, i]);
    }
    return { stars, links, depth: rand(0.45, 0.85), phase: rand(0, Math.PI * 2) };
  }

  // ---------- Chuyển động ----------
  private step(dt: number): void {
    if (this.theme() === 'light') {
      const mult = 1 + this.boost;
      for (const b of this.bubbles) {
        b.y -= b.speed * mult * dt;
        b.phase += 0.012 * dt;
        if (b.y < -b.r * 2) Object.assign(b, this.newBubble(this.h + b.r + rand(0, 80)));
      }
    } else {
      // Trôi rất chậm khi đứng yên, trôi theo hướng lăn chuột.
      this.skyOffset += (0.08 + this.skyVel) * dt;
      this.skyVel *= Math.pow(0.93, dt);
    }
    // Cả hai chế độ: ảnh tỏa sao khi cuộn, sao bay chậm dần rồi mờ đi.
    this.boost *= Math.pow(0.94, dt);
    while (this.emitBudget >= 1 && this.sparks.length < MAX_SPARKS) {
      this.emitSpark();
      this.emitBudget -= 1;
    }
    this.emitBudget = Math.min(this.emitBudget, 40);
    for (const s of this.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= Math.pow(0.97, dt);
      s.vy = s.vy * Math.pow(0.97, dt) - 0.015 * dt;
      s.rot += s.vr * dt;
      s.life += dt;
    }
    this.sparks = this.sparks.filter((s) => s.life < s.max);
  }

  // ---------- Vẽ ----------
  private draw(): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.w, this.h);
    if (this.theme() === 'light') {
      this.drawSprites();
      this.drawBubbles();
      this.drawSparks();
    } else {
      this.drawSky();
      this.drawSprites();
      this.drawSparks();
    }
  }

  private drawSprites(): void {
    const { ctx } = this;
    const small = this.w < 700;
    for (const sp of this.sprites) {
      if (!sp.img) continue;
      const h = Math.min(sp.maxH * (small ? 0.6 : 1), this.h * sp.fh * (small ? 0.7 : 1));
      const w = (h * sp.img.width) / sp.img.height;
      // Nhún nhẹ lên xuống; khi cuộn thì phồng to một chút.
      const bob = Math.sin(this.time * 0.02 + sp.phase) * 10;
      const scale = 1 + Math.min(this.boost, 14) * 0.006;
      const cx = this.w * sp.fx;
      const cy = this.h * sp.fy + bob;
      sp.box = { x: cx - w / 2, y: cy - h / 2, w, h };
      ctx.save();
      ctx.globalAlpha = SPRITE_ALPHA[this.theme()] * (small ? 0.75 : 1);
      ctx.translate(cx, cy);
      ctx.rotate(sp.tilt + Math.sin(this.time * 0.013 + sp.phase) * 0.025);
      ctx.scale(scale, scale);
      ctx.drawImage(sp.img, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }

  private drawSparks(): void {
    const { ctx } = this;
    for (const s of this.sparks) {
      const t = s.life / s.max;
      const alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.globalAlpha = Math.max(0, alpha) * 0.85;
      ctx.shadowColor = `hsla(${s.hue}, 95%, 70%, 0.9)`;
      ctx.shadowBlur = 10;
      ctx.fillStyle = `hsl(${s.hue}, 95%, ${s.hue < 60 ? 62 : 74}%)`;
      this.starPath(s.size * (1 - t * 0.4));
      ctx.fill();
      ctx.restore();
    }
  }

  /** Ngôi sao 5 cánh tâm (0,0). */
  private starPath(r: number): void {
    const { ctx } = this;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 ? r * 0.45 : r;
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      if (i) ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      else ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
  }

  private drawBubbles(): void {
    const { ctx } = this;
    for (const b of this.bubbles) {
      const x = b.x + Math.sin(b.phase) * 18 * b.wobble;
      const y = b.y;
      // Thân bóng: gradient 2 màu, mờ dần ra mép.
      const body = ctx.createRadialGradient(x - b.r * 0.35, y - b.r * 0.35, b.r * 0.1, x, y, b.r);
      body.addColorStop(0, `hsla(${b.hue}, 95%, 88%, ${b.alpha})`);
      body.addColorStop(0.6, `hsla(${b.hue2}, 90%, 78%, ${b.alpha * 0.55})`);
      body.addColorStop(1, `hsla(${b.hue2}, 85%, 72%, 0)`);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(x, y, b.r, 0, Math.PI * 2);
      ctx.fill();
      // Viền óng ánh mảnh.
      ctx.strokeStyle = `hsla(${b.hue2 + 40}, 90%, 75%, ${b.alpha * 0.35})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, b.r * 0.92, 0, Math.PI * 2);
      ctx.stroke();
      // Đốm sáng phản chiếu.
      const shine = ctx.createRadialGradient(x - b.r * 0.4, y - b.r * 0.45, 0, x - b.r * 0.4, y - b.r * 0.45, b.r * 0.32);
      shine.addColorStop(0, `rgba(255,255,255,${b.alpha * 0.9})`);
      shine.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = shine;
      ctx.beginPath();
      ctx.arc(x - b.r * 0.4, y - b.r * 0.45, b.r * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawSky(): void {
    const { ctx } = this;
    const skyH = this.h * 2;
    const wrap = (y: number) => ((y % skyH) + skyH) % skyH - this.h * 0.5;

    for (const s of this.stars) {
      const y = wrap(s.y - this.skyOffset * s.depth);
      if (y < -4 || y > this.h + 4) continue;
      const a = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(s.phase + this.time * s.twinkle));
      ctx.fillStyle = `rgba(220, 235, 255, ${a * (0.5 + s.depth * 0.5)})`;
      ctx.beginPath();
      ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const c of this.constellations) {
      const dy = wrap(c.stars[0].y - this.skyOffset * c.depth) - c.stars[0].y;
      const pulse = 0.75 + 0.25 * Math.sin(c.phase + this.time * 0.02);
      // Đường nối.
      ctx.strokeStyle = this.withAlpha(this.primary, 0.35 * pulse);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const [a, b] of c.links) {
        ctx.moveTo(c.stars[a].x, c.stars[a].y + dy);
        ctx.lineTo(c.stars[b].x, c.stars[b].y + dy);
      }
      ctx.stroke();
      // Sao của chòm: có quầng sáng.
      for (const s of c.stars) {
        const y = s.y + dy;
        if (y < -20 || y > this.h + 20) continue;
        const glow = ctx.createRadialGradient(s.x, y, 0, s.x, y, s.r * 6);
        glow.addColorStop(0, this.withAlpha(this.primary, 0.45 * pulse));
        glow.addColorStop(1, this.withAlpha(this.primary, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(s.x, y, s.r * 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(240, 248, 255, ${0.85 * pulse + 0.15})`;
        ctx.beginPath();
        ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private withAlpha([r, g, b]: [number, number, number], alpha: number): string {
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /** Đọc --primary đã được trình duyệt quy về rgb(). */
  private readPrimary(): [number, number, number] {
    const probe = document.createElement('i');
    probe.style.color = 'var(--primary)';
    this.host.appendChild(probe);
    const m = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g);
    probe.remove();
    return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : this.primary;
  }
}

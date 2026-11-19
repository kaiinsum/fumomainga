import { Component, DestroyRef, ElementRef, effect, inject, untracked, viewChild } from '@angular/core';
import { SEASON_ART, SeasonDef } from '../../models/seasons';
import { SeasonService } from '../../services/season.service';
import { perf } from '../../core/perf';

interface Flake {
  g: number;
  x: number;
  y: number;
  s: number;
  v: number;
  sway: number;
  ph: number;
  rot: number;
  vr: number;
  a: number;
}

/**
 * Hiệu ứng nền theo chủ đề dịp lễ (hoa đào rơi, tim bay, lồng đèn, tuyết...) + dải màu mảnh dưới thanh menu.
 * Nằm dưới mọi nội dung, không bắt chuột. Điện thoại / máy yếu: ít hạt hơn, 30 khung hình/giây.
 */
@Component({
  selector: 'app-season-fx',
  template: `
    @if (svc.active(); as s) {
      <canvas #cv aria-hidden="true"></canvas>
      <span class="strip" [style.background]="'linear-gradient(90deg, ' + s.colors[0] + ', ' + s.colors[1] + ', ' + s.colors[0] + ')'" aria-hidden="true"></span>
    }
  `,
  styles: `
    :host { display: contents; }
    canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: -1; pointer-events: none; }
    .strip { position: fixed; left: 0; right: 0; top: var(--header-h); height: 3px; z-index: 49; pointer-events: none; opacity: .9;
      background-size: 200% 100% !important; animation: strip 6s linear infinite; }
    @keyframes strip { to { background-position: 200% 0; } }
    :host-context(html.lite) .strip { animation: none; }
    @media (prefers-reduced-motion: reduce) { canvas { display: none; } .strip { animation: none; } }
  `,
})
export class SeasonFxComponent {
  readonly svc = inject(SeasonService);
  private readonly cv = viewChild<ElementRef<HTMLCanvasElement>>('cv');
  private raf = 0;
  private sprites: HTMLCanvasElement[] = [];
  private flakes: Flake[] = [];
  private season?: SeasonDef;
  private last = 0;

  constructor() {
    effect(() => {
      const s = this.svc.active();
      const el = this.cv()?.nativeElement;
      untracked(() => this.setup(s, el));
    });
    const onResize = () => this.season && this.resize();
    addEventListener('resize', onResize);
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(this.raf);
      removeEventListener('resize', onResize);
    });
  }

  private setup(s: SeasonDef | undefined, el: HTMLCanvasElement | undefined): void {
    cancelAnimationFrame(this.raf);
    this.season = s;
    if (!s || !el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.sprites = [];
    s.fx.glyphs.forEach((g, i) => this.makeSprite(g, i));
    this.resize();
    const n = Math.round(s.fx.count * (perf.lite ? 0.5 : 1) * Math.min(1, innerWidth / 900 + 0.35));
    this.flakes = Array.from({ length: n }, () => this.spawn(true));
    this.last = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Vẽ sẵn mỗi hạt ra canvas nhỏ (emoji hoặc hình SVG) để mỗi khung hình chỉ cần drawImage. */
  private makeSprite(g: string, i: number): void {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d')!;
    this.sprites[i] = c;
    if (g.startsWith('img:')) {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(size / img.naturalWidth, size / img.naturalHeight) * 0.92;
        const w = img.naturalWidth * k;
        const h = img.naturalHeight * k;
        x.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      };
      img.src = SEASON_ART[g.slice(4)];
    } else {
      x.font = `${size * 0.78}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(g, size / 2, size / 2 + 3);
    }
  }

  private resize(): void {
    const el = this.cv()?.nativeElement;
    if (!el) return;
    const dpr = Math.min(perf.lite ? 1 : 1.5, devicePixelRatio || 1);
    el.width = Math.round(innerWidth * dpr);
    el.height = Math.round(innerHeight * dpr);
    el.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private spawn(anywhere = false): Flake {
    const fx = this.season!.fx;
    const s = fx.size[0] + Math.random() * (fx.size[1] - fx.size[0]);
    const W = innerWidth;
    const H = innerHeight;
    const y = anywhere ? Math.random() * H : fx.dir === 'rise' ? H + s : fx.dir === 'fall' ? -s : Math.random() * H;
    return {
      g: Math.floor(Math.random() * fx.glyphs.length),
      x: Math.random() * W,
      y,
      s,
      v: (fx.dir === 'float' ? 8 : 24) + Math.random() * 30,
      sway: 10 + Math.random() * 26,
      ph: Math.random() * Math.PI * 2,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * (fx.dir === 'float' ? 0.6 : 1.4),
      a: 0.55 + Math.random() * 0.4,
    };
  }

  private readonly frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    if (document.hidden) return;
    // Chế độ nhẹ: 30 khung hình/giây.
    if (perf.lite && now - this.last < 33) return;
    const dt = Math.min(0.06, (now - (this.last || now)) / 1000);
    this.last = now;
    const el = this.cv()?.nativeElement;
    const s = this.season;
    if (!el || !s) return;
    const x = el.getContext('2d')!;
    const W = innerWidth;
    const H = innerHeight;
    x.clearRect(0, 0, W, H);
    const dir = s.fx.dir;
    for (let i = 0; i < this.flakes.length; i++) {
      const f = this.flakes[i];
      f.ph += dt;
      f.rot += f.vr * dt;
      if (dir === 'fall') f.y += f.v * dt;
      else if (dir === 'rise') f.y -= f.v * dt;
      else {
        f.y += Math.sin(f.ph * 0.7) * 10 * dt;
        f.x += f.v * 0.6 * dt;
      }
      const px = f.x + Math.sin(f.ph * 1.3) * f.sway;
      if (f.y > H + 40 || f.y < -40 || px > W + 40) {
        this.flakes[i] = this.spawn();
        if (dir === 'float') this.flakes[i].x = -30;
        continue;
      }
      const sp = this.sprites[f.g];
      if (!sp) continue;
      x.save();
      x.globalAlpha = f.a;
      x.translate(px, f.y);
      x.rotate(dir === 'float' ? Math.sin(f.rot) * 0.4 : f.rot);
      x.drawImage(sp, -f.s / 2, -f.s / 2, f.s, f.s);
      x.restore();
    }
  };
}

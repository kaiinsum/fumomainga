import { AfterViewInit, Component, ElementRef, OnDestroy, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { JSAnimation, animate, stagger } from 'animejs';
import { AnimateInDirective } from '../../shared/animate-in.directive';
import { SettingsService } from '../../services/settings.service';
import { ThemeService } from '../../services/theme.service';
import { IconComponent } from '../../shared/icon';

/** Ảnh nhân vật hai bên phần Hành trình - cùng bộ ảnh nền của từng giao diện. */
const FIGURES = {
  light: ['bg/cirno.webp', 'bg/fumo-cirno.webp'],
  dark: ['bg/reimu-1.webp', 'bg/reimu-2.webp'],
} as const;

@Component({
  selector: 'app-about',
  imports: [RouterLink, AnimateInDirective, IconComponent],
  host: { '[class.dark]': "theme() === 'dark'", '[class.played]': 'played()' },
  template: `
    <section class="hero">
      <div class="container">
        <div class="dots" aria-hidden="true">
          @for (d of dots; track $index) { <span></span> }
        </div>
        <h1 class="neon-title"><span class="nt-main" [attr.data-text]="s().aboutTitle">{{ s().aboutTitle }}</span> <span class="nt-shop">{{ s().shopName }}</span></h1>
        <p class="lead">{{ s().aboutIntro }}</p>
      </div>
    </section>

    <section class="section">
      <div class="container values">
        @for (v of s().aboutValues; track $index; let i = $index) {
          <div class="value card-surface" appAnimateIn [animDelay]="i * 120">
            <span class="icon"><app-icon [icon]="v.icon" /></span>
            <h3>{{ v.title }}</h3>
            <p>{{ v.text }}</p>
          </div>
        }
      </div>
    </section>

    <section class="journey">
      <!-- Ánh đèn sân khấu (light) / neon (dark) -->
      <div class="beams" aria-hidden="true"><span class="beam b1"></span><span class="beam b2"></span><span class="beam b3"></span></div>

      <!-- Ảnh nhân vật nổi lên phía trước, trượt từ trên xuống -->
      @for (src of figures(); track src; let i = $index) {
        <figure class="figure" [class.left]="i === 0" [class.right]="i === 1" aria-hidden="true">
          <span class="halo"></span>
          <img [src]="src" alt="" loading="lazy" />
          <span class="spark s1"></span><span class="spark s2"></span><span class="spark s3"></span>
        </figure>
      }

      <div class="container inner">
        @if (timelineTitle().length) {
          <h2 class="section-title j-title">
            @for (p of timelineTitle(); track $index) {
              @if (p.hl) { <span>{{ p.text }}</span> } @else { {{ p.text }} }
            }
          </h2>
        }
        <ol class="timeline">
          <span class="rail" aria-hidden="true"><span class="rail-fill"></span></span>
          @for (m of s().aboutMilestones; track $index; let i = $index) {
            <li class="milestone">
              <span class="dot" aria-hidden="true"></span>
              <div class="card">
                <strong class="year">{{ m.year }}</strong>
                <p>{{ m.text }}</p>
              </div>
            </li>
          }
        </ol>
        <div class="center j-cta">
          <a routerLink="/san-pham" class="btn primary">Khám phá sản phẩm</a>
        </div>
      </div>
    </section>
  `,
  styles: `
    .hero { position: relative; text-align: center; padding: 72px 0 48px; overflow: hidden; }
    .hero h1 { font-size: clamp(2.2rem, 5vw, 3.4rem); }
    /* --- Tiêu đề "Về chúng tôi": chữ neon phát sáng chuyển động --- */
    .neon-title { position: relative; z-index: 1; }
    .nt-main { color: var(--text); animation: neon-breathe 3.2s ease-in-out infinite; }
    .nt-shop {
      margin-left: .28em;
      background: linear-gradient(90deg, var(--primary-dark), var(--primary), #b06bff, #ff6fa8, var(--primary-dark));
      background-size: 300% 100%; -webkit-background-clip: text; background-clip: text; color: transparent;
      animation: neon-flow 5s linear infinite;
      filter: drop-shadow(0 0 3px color-mix(in srgb, var(--primary) 45%, transparent)) drop-shadow(0 0 12px color-mix(in srgb, var(--primary) 30%, transparent));
    }
    @keyframes neon-breathe {
      0%, 100% { text-shadow: 0 0 4px color-mix(in srgb, var(--primary) 35%, transparent), 0 0 14px color-mix(in srgb, var(--primary) 25%, transparent); }
      50% { text-shadow: 0 0 6px color-mix(in srgb, var(--primary) 70%, transparent), 0 0 22px color-mix(in srgb, var(--primary) 55%, transparent), 0 0 44px color-mix(in srgb, var(--primary) 35%, transparent); }
    }
    @keyframes neon-flow { to { background-position: 300% 0; } }
    /* Dark: ống neon thật - lõi trắng, quầng đỏ, chập chờn như đèn */
    :host(.dark) .nt-main { color: #fff; animation: neon-flicker 4.5s linear infinite; }
    :host(.dark) .nt-shop { background-image: linear-gradient(90deg, #ff2d55, #ff8fab, #fff, #ff2d55); filter: drop-shadow(0 0 4px #ff2d55) drop-shadow(0 0 14px #ff2d55) drop-shadow(0 0 30px rgba(255, 45, 85, .7)); }
    @keyframes neon-flicker {
      0%, 17%, 21%, 23%, 53%, 57%, 100% {
        text-shadow: 0 0 3px #fff, 0 0 8px #ff2d55, 0 0 18px #ff2d55, 0 0 36px rgba(255, 45, 85, .85), 0 0 64px rgba(255, 45, 85, .5);
        opacity: 1;
      }
      19%, 22%, 55% { text-shadow: none; opacity: .55; }
    }
    @media (prefers-reduced-motion: reduce) { .nt-main, .nt-shop { animation: none; } }
    .lead { max-width: 640px; margin: 0 auto; color: var(--muted); font-size: 1.1rem; }
    .dots { position: absolute; inset: 0; pointer-events: none; }
    .dots span { position: absolute; width: 14px; height: 14px; border-radius: 50%; background: var(--primary); opacity: .25; }
    .values { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
    .value { padding: 28px; text-align: center; }
    .value .icon { font-size: 2.6rem; }
    .value p { color: var(--muted); margin: 0; }
    .center { text-align: center; }

    /* ================= HÀNH TRÌNH ================= */
    .journey {
      --glow: #ffd27a;           /* màu ánh đèn (light) */
      --glow-soft: rgba(255, 210, 122, .45);
      position: relative; overflow: hidden; isolation: isolate;
      padding: 88px 0 96px;
      background:
        radial-gradient(ellipse 60% 50% at 50% 0%, color-mix(in srgb, var(--primary) 22%, transparent), transparent 70%),
        linear-gradient(180deg, var(--primary-100), color-mix(in srgb, var(--primary-100) 55%, var(--surface)));
    }
    .inner { position: relative; z-index: 3; }
    .j-title { font-size: clamp(2rem, 4.4vw, 3rem); }

    /* --- Ánh đèn sân khấu từ trên chiếu xuống --- */
    .beams { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
    .beam {
      position: absolute; top: -10%; width: 34%; height: 120%;
      background: linear-gradient(180deg, var(--glow-soft), transparent 75%);
      clip-path: polygon(44% 0, 56% 0, 100% 100%, 0 100%);
      filter: blur(6px); mix-blend-mode: screen; opacity: .0;
      transform-origin: 50% 0;
      animation: beam-in 1.2s ease-out forwards, sway 7s ease-in-out infinite alternate;
    }
    .b1 { left: -2%; --r: 14deg; animation-delay: .1s, 1.3s; }
    .b2 { left: 33%; --r: 0deg; width: 34%; animation-delay: .35s, 1.6s; }
    .b3 { right: -2%; --r: -14deg; animation-delay: .6s, 1.9s; }
    @keyframes beam-in { from { opacity: 0; transform: rotate(var(--r)) scaleY(.2); } to { opacity: .85; transform: rotate(var(--r)) scaleY(1); } }
    @keyframes sway { from { transform: rotate(calc(var(--r) - 4deg)); } to { transform: rotate(calc(var(--r) + 4deg)); } }

    /* --- Ảnh nhân vật hai bên (nổi lên trước nền) --- */
    .figure {
      position: absolute; z-index: 2; margin: 0; top: 120px; width: clamp(180px, 20vw, 300px);
      opacity: 0; pointer-events: none;
    }
    .figure.left { left: max(8px, calc(50% - 640px)); }
    .figure.right { right: max(8px, calc(50% - 640px)); top: 360px; }
    .figure img {
      position: relative; z-index: 1; display: block; width: 100%; height: auto;
      filter: drop-shadow(0 18px 24px rgba(0,0,0,.18)) drop-shadow(0 0 18px var(--glow-soft));
      animation: bob 5s ease-in-out infinite;
    }
    .figure.right img { animation-delay: -2.5s; }
    .halo {
      position: absolute; inset: 8% 4% 4%; z-index: 0; border-radius: 50%;
      background: radial-gradient(circle, var(--glow-soft), transparent 68%);
      animation: pulse 3.2s ease-in-out infinite;
    }
    .spark { position: absolute; z-index: 2; width: 10px; height: 10px; background: var(--glow);
      clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
      animation: twinkle 2.4s ease-in-out infinite; }
    .s1 { top: 6%; left: 10%; }
    .s2 { top: 30%; right: 4%; width: 14px; height: 14px; animation-delay: .8s; }
    .s3 { bottom: 12%; left: 22%; animation-delay: 1.6s; }
    /* Đổi sáng/tối sau khi đã chạy hiệu ứng: ảnh mới tự trượt xuống và hiện ra. */
    :host(.played) .figure { opacity: 1; }
    :host(.played) .figure:not(.seen) { animation: drop-in 1.1s cubic-bezier(.2, 1.5, .4, 1) both; }
    :host(.played) .figure.right:not(.seen) { animation-delay: .2s; }
    @keyframes drop-in { from { opacity: 0; transform: translateY(-160px) scale(.85); } }
    @keyframes bob { 0%, 100% { transform: translateY(0) rotate(-1.5deg); } 50% { transform: translateY(-14px) rotate(1.5deg); } }
    @keyframes pulse { 0%, 100% { opacity: .55; transform: scale(.94); } 50% { opacity: 1; transform: scale(1.06); } }
    @keyframes twinkle { 0%, 100% { opacity: 0; transform: scale(.4) rotate(0); } 50% { opacity: 1; transform: scale(1) rotate(90deg); } }

    /* --- Dòng thời gian --- */
    .timeline { list-style: none; padding: 0; margin: 40px auto 36px; max-width: 760px; position: relative; }
    .rail { position: absolute; left: 50%; top: 0; bottom: 0; width: 4px; translate: -50% 0; border-radius: 4px;
      background: color-mix(in srgb, var(--primary) 18%, transparent); }
    .rail-fill { position: absolute; inset: 0; border-radius: inherit; transform-origin: 50% 0; transform: scaleY(0);
      background: linear-gradient(180deg, var(--primary), color-mix(in srgb, var(--primary) 40%, var(--glow)));
      box-shadow: 0 0 12px var(--primary); }
    .milestone { position: relative; width: 50%; padding: 14px 40px; opacity: 0; }
    .milestone:nth-child(even) { text-align: right; }          /* phần tử 1 là .rail nên đảo chẵn/lẻ */
    .milestone:nth-child(odd) { margin-left: 50%; }
    .dot { position: absolute; top: 34px; width: 20px; height: 20px; border-radius: 50%; background: var(--primary);
      border: 4px solid var(--surface); box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary) 30%, transparent), 0 0 18px var(--primary); }
    .milestone:nth-child(even) .dot { right: -10px; }
    .milestone:nth-child(odd) .dot { left: -10px; }
    .card {
      padding: 18px 22px; border-radius: 18px;
      background: color-mix(in srgb, var(--surface) 78%, transparent); backdrop-filter: blur(8px);
      border: 1px solid color-mix(in srgb, var(--primary) 22%, transparent);
      box-shadow: 0 14px 34px -14px color-mix(in srgb, var(--primary) 45%, transparent);
      transition: transform .35s ease, box-shadow .35s ease;
    }
    /* Hover thẻ năm: nổi lên, phóng to, viền sáng; các thẻ khác mờ đi để thẻ đang xem nổi bật */
    .timeline:hover .milestone .card { opacity: .55; filter: saturate(.7); }
    .timeline .milestone:hover .card {
      opacity: 1; filter: none; transform: translateY(-8px) scale(1.07);
      border-color: var(--primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 30%, transparent), 0 26px 50px -14px color-mix(in srgb, var(--primary) 70%, transparent), 0 0 34px color-mix(in srgb, var(--primary) 35%, transparent);
    }
    .card { position: relative; overflow: hidden; transition: transform .35s cubic-bezier(.2, 1.4, .4, 1), box-shadow .35s ease, opacity .3s ease, filter .3s ease, border-color .3s ease; }
    .card::after { content: ''; position: absolute; inset: 0; pointer-events: none; transform: translateX(-120%);
      background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,.55) 50%, transparent 65%); }
    .milestone:hover .card::after { transition: transform .8s ease; transform: translateX(120%); }
    .milestone:hover .year { animation: year-pop .6s cubic-bezier(.2, 1.6, .4, 1); letter-spacing: .01em; }
    .milestone:hover .dot { transform: scale(1.5); box-shadow: 0 0 0 6px color-mix(in srgb, var(--primary) 30%, transparent), 0 0 26px var(--primary); }
    .dot { transition: transform .3s ease, box-shadow .3s ease; }
    @keyframes year-pop { 0% { transform: scale(1); } 40% { transform: scale(1.18) rotate(-3deg); } 100% { transform: scale(1); } }
    .year {
      display: block; font-size: clamp(2.4rem, 5vw, 3.6rem); font-weight: 900; line-height: 1; letter-spacing: -.02em;
      background: linear-gradient(120deg, var(--primary), color-mix(in srgb, var(--primary) 45%, #ff9ad5) 60%, var(--glow));
      -webkit-background-clip: text; background-clip: text; color: transparent;
      filter: drop-shadow(0 4px 10px color-mix(in srgb, var(--primary) 30%, transparent));
    }
    .card p { margin: 10px 0 0; font-size: 1.02rem; line-height: 1.6; color: var(--text); opacity: .85; }
    .j-cta { opacity: 0; }

    /* ================= DARK: NEON ĐỎ ================= */
    :host(.dark) .journey {
      --glow: #ff2d55; --glow-soft: rgba(255, 45, 85, .42);
      background:
        radial-gradient(ellipse 60% 45% at 50% 0%, rgba(255, 45, 85, .22), transparent 70%),
        linear-gradient(180deg, #07090d, #0d0710);
    }
    :host(.dark) .beam { mix-blend-mode: plus-lighter; }
    :host(.dark) .figure img {
      filter: drop-shadow(0 0 2px #ff2d55) drop-shadow(0 0 10px #ff2d55) drop-shadow(0 0 26px rgba(255, 45, 85, .7));
      animation: bob 5s ease-in-out infinite, flicker 6s linear infinite;
    }
    @keyframes flicker { 0%, 18%, 22%, 62%, 66%, 100% { opacity: 1; } 20%, 64% { opacity: .55; } }
    :host(.dark) .card { background: rgba(10, 12, 18, .72); border-color: rgba(255, 45, 85, .55);
      box-shadow: 0 0 0 1px rgba(255, 45, 85, .25), 0 0 22px -4px rgba(255, 45, 85, .55), inset 0 0 18px rgba(255, 45, 85, .08); }
    :host(.dark) .year { background: none; color: #fff; -webkit-text-fill-color: #fff; filter: none;
      text-shadow: 0 0 4px #fff, 0 0 10px #ff2d55, 0 0 22px #ff2d55, 0 0 42px rgba(255, 45, 85, .8); }
    :host(.dark) .card p { color: #e8e8ee; }
    :host(.dark) .milestone:hover .card { border-color: #ff2d55; box-shadow: 0 0 0 1px #ff2d55, 0 0 30px rgba(255, 45, 85, .75), 0 0 70px rgba(255, 45, 85, .35), inset 0 0 22px rgba(255, 45, 85, .18); }
    :host(.dark) .milestone:hover .year { text-shadow: 0 0 6px #fff, 0 0 14px #ff2d55, 0 0 30px #ff2d55, 0 0 60px rgba(255, 45, 85, 1); }
    :host(.dark) .card::after { background: linear-gradient(105deg, transparent 35%, rgba(255, 45, 85, .35) 50%, transparent 65%); }
    :host(.dark) .dot { border-color: #07090d; }

    @media (max-width: 1100px) {
      .figure, :host(.played) .figure { width: 150px; opacity: .35; }
      .figure { opacity: 0; }
      .figure.left { top: 40px; left: 4px; }
      .figure.right { top: auto; bottom: 40px; right: 4px; }
    }
    @media (max-width: 760px) {
      .values { grid-template-columns: 1fr; }
      .rail { left: 12px; }
      .milestone, .milestone:nth-child(odd) { width: 100%; margin-left: 0; text-align: left; padding: 10px 0 10px 40px; }
      .milestone:nth-child(even) .dot, .milestone:nth-child(odd) .dot { left: 2px; right: auto; }
      .figure { width: 110px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .beam, .figure img, .halo, .spark { animation: none; opacity: .8; }
    }
  `,
})
export class AboutPage implements AfterViewInit, OnDestroy {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private loop?: JSAnimation;
  private observer?: IntersectionObserver;

  readonly dots = Array.from({ length: 14 });

  readonly s = inject(SettingsService).settings;
  readonly theme = inject(ThemeService).theme;
  readonly figures = computed(() => FIGURES[this.theme()]);
  /** Đã chạy hiệu ứng vào phần Hành trình. */
  readonly played = signal(false);

  /** "Hành trình *của chúng tôi*" → phần thường + phần tô màu. */
  readonly timelineTitle = computed(() =>
    (this.s().aboutTimelineTitle ?? '')
      .trim()
      .split(/\*([^*]+)\*/)
      .map((text, i) => ({ text, hl: i % 2 === 1 }))
      .filter((p) => p.text),
  );

  ngAfterViewInit(): void {
    const dots = this.host.querySelectorAll<HTMLElement>('.dots span');
    dots.forEach((d) => {
      d.style.left = `${Math.random() * 100}%`;
      d.style.top = `${Math.random() * 100}%`;
    });
    this.loop = animate(dots, {
      translateY: () => [0, -20 - Math.random() * 40],
      scale: () => [0.6, 1 + Math.random()],
      opacity: [0.1, 0.4],
      delay: stagger(150),
      duration: 2400,
      loop: true,
      alternate: true,
      ease: 'inOutSine',
    });

    // Hành trình: khi cuộn tới → mọi thứ trượt từ trên xuống, đường kẻ "vẽ" dần từ trên xuống dưới.
    const journey = this.host.querySelector('.journey');
    if (!journey) return;
    this.observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        this.observer?.disconnect();
        this.playJourney();
      },
      { threshold: 0.12 },
    );
    this.observer.observe(journey);
  }

  private playJourney(): void {
    const q = (s: string) => this.host.querySelectorAll<HTMLElement>(s);
    const items = q('.milestone');
    const narrow = matchMedia('(max-width: 1100px)').matches;
    animate(q('.j-title'), { opacity: [0, 1], translateY: [-50, 0], duration: 900, ease: 'outExpo' });
    // Sau khi thả xong, giao lại cho CSS (để ảnh của giao diện mới cũng hiện khi đổi sáng/tối).
    setTimeout(() => {
      q('.figure').forEach((f) => {
        f.classList.add('seen');
        f.style.removeProperty('transform');
        f.style.removeProperty('opacity');
      });
      this.played.set(true);
    }, 2400);
    animate(q('.figure'), {
      opacity: [0, narrow ? 0.35 : 1],
      translateY: [-160, 0],
      scale: [0.85, 1],
      delay: stagger(260, { start: 200 }),
      duration: 1400,
      ease: 'outElastic(1, .7)',
    });
    animate(q('.rail-fill'), { scaleY: [0, 1], duration: 400 + items.length * 320, delay: 250, ease: 'inOutSine' });
    animate(items, { opacity: [0, 1], translateY: [-70, 0], delay: stagger(320, { start: 300 }), duration: 900, ease: 'outBack(1.4)' });
    animate(q('.milestone .year'), { scale: [0.4, 1], delay: stagger(320, { start: 420 }), duration: 900, ease: 'outElastic(1, .6)' });
    animate(q('.j-cta'), { opacity: [0, 1], translateY: [-30, 0], delay: 400 + items.length * 320, duration: 700, ease: 'outExpo' });
  }

  ngOnDestroy(): void {
    this.loop?.pause();
    this.observer?.disconnect();
  }
}

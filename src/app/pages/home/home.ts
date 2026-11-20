import { AfterViewInit, Component, ElementRef, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { ThemeService } from '../../services/theme.service';
import { RouterLink } from '@angular/router';
import { JSAnimation, animate, createTimeline, stagger } from 'animejs';
import { perf } from '../../core/perf';
import { CategoryService } from '../../services/category.service';
import { ProductService } from '../../services/product.service';
import { newsPath } from '../../models/news';
import { NewsService } from '../../services/news.service';
import { SettingsService } from '../../services/settings.service';
import { DatePipe } from '@angular/common';
import { ProductCardComponent } from '../../components/product-card/product-card';
import { AnimateInDirective } from '../../shared/animate-in.directive';
import { playBaka, sfx } from '../../shared/sfx';
import { GuideService } from '../../components/guide/guide.service';

/** Các bé fumo luân phiên làm mascot ở phần đầu trang chủ (chế độ sáng). */
const MASCOTS = [
  { src: 'img/mascot-1.webp', w: 304, h: 455 },
  { src: 'img/mascot-2.webp', w: 443, h: 480 },
  { src: 'img/mascot-3.webp', w: 425, h: 625 },
  { src: 'img/mascot-4.webp', w: 356, h: 476 },
];
/** Mỗi bé ở lại bao lâu trước khi đổi (ms). */
const MASCOT_INTERVAL = 5000;

@Component({
  selector: 'app-home',
  imports: [RouterLink, DatePipe, ProductCardComponent, AnimateInDirective],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomePage implements AfterViewInit, OnDestroy {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly service = inject(ProductService);
  private readonly loops: JSAnimation[] = [];
  private statsObserver?: IntersectionObserver;

  readonly settings = inject(SettingsService).settings;
  private readonly news = inject(NewsService);
  readonly path = newsPath;
  private readonly theme = inject(ThemeService);
  readonly latestNews = computed(() => this.news.published().slice(0, 3));

  /** "Thế giới *Fumo* dễ thương" -> các từ, từ nằm trong *...* được tô màu. */
  readonly titleWords = computed(() =>
    this.settings()
      .heroTitle.split(/\s+/)
      .filter(Boolean)
      .map((w) => ({ text: w.replace(/^\*|\*$/g, ''), hl: /^\*.*\*$/.test(w) })),
  );
  readonly featured = computed(() => this.service.featured().slice(0, 4));
  private readonly categorySvc = inject(CategoryService);
  readonly categories = computed(() => {
    const shop = this.service.shop();
    return this.categorySvc.categories().map((c) => ({
      ...c,
      count: this.categorySvc.counts().get(c.name) ?? 0,
      // 3 sản phẩm tiêu biểu: nổi bật → còn hàng → mới nhất.
      picks: shop
        .filter((p) => p.category === c.name && p.images[0])
        .sort((a, b) => +b.featured - +a.featured || +b.inStock - +a.inStock || b.createdAt - a.createdAt)
        .slice(0, 3),
    }));
  });

  // ---------- Rê chuột vào danh mục: xem nhanh sản phẩm ----------
  readonly peekCat = signal<string | null>(null);
  readonly peekIdx = signal(0);
  private peekTimer?: ReturnType<typeof setInterval>;

  startPeek(name: string): void {
    if (this.peekCat() === name) return;
    clearInterval(this.peekTimer);
    this.peekCat.set(name);
    this.peekIdx.set(0);
    this.peekTimer = setInterval(() => this.peekIdx.update((i) => i + 1), 1600);
  }

  /** Vị trí thẻ j trong tay bài: 0 = giữa, 1 = bên phải, còn lại = bên trái. */
  fanPos(j: number, n: number): number {
    return (((j - this.peekIdx()) % n) + n) % n;
  }

  stopPeek(): void {
    clearInterval(this.peekTimer);
    this.peekCat.set(null);
  }

  readonly isDark = computed(() => this.theme.theme() === 'dark');
  private mascotLoop?: JSAnimation;
  private readonly mascotIndex = signal(0);
  readonly mascot = computed(() => MASCOTS[this.mascotIndex()]);
  readonly mascotNo = computed(() => this.mascotIndex() + 1);
  readonly mascotCount = MASCOTS.length;
  private mascotTimer?: ReturnType<typeof setInterval>;
  private swapping = false;
  private readonly guide = inject(GuideService);
  /** Lướt qua lại trên mascot: đếm số lần đổi chiều (mỗi nhát đủ dài) trong ~2.5 giây. */
  private swipe = { x: 0, dir: 0, dist: 0, flips: [] as number[] };
  private slicedAt = 0;


  constructor() {
    // Đổi sáng/tối thì mascot được render lại → chạy lại hiệu ứng lơ lửng.
    effect(() => {
      this.isDark();
      requestAnimationFrame(() => this.startMascotFloat());
    });
    // Tải trước cả 4 ảnh để lúc đổi không bị nháy trống.
    for (const m of MASCOTS) new Image().src = m.src;
    this.mascotTimer = setInterval(() => this.swapMascot(), MASCOT_INTERVAL);
  }

  swipeStart(e: PointerEvent): void {
    this.swipe = { x: e.clientX, dir: 0, dist: 0, flips: this.swipe.flips };
  }

  /** Lướt chuột / vuốt qua lại nhanh nhiều lần trên mascot → chém đôi bé fumo. */
  swipeMove(e: PointerEvent): void {
    const s = this.swipe;
    const dx = e.clientX - s.x;
    s.x = e.clientX;
    if (Math.abs(dx) < 1) return;
    const d = Math.sign(dx);
    if (d === s.dir || s.dir === 0) {
      s.dir = d;
      s.dist += Math.abs(dx);
      return;
    }
    // Đổi chiều: tính là 1 nhát nếu nhát vừa rồi đủ dài.
    const now = performance.now();
    if (s.dist >= 45) s.flips = [...s.flips.filter((t) => now - t < 2500), now];
    s.dir = d;
    s.dist = Math.abs(dx);
    if (s.flips.length >= 6) {
      s.flips = [];
      this.sliceMascot();
    }
  }

  /** Bé fumo bị chém làm đôi (2 nửa văng ra), lát sau lành lại; người hướng dẫn hiện ra mời chơi Fumo Ninja. */
  private sliceMascot(): void {
    const now = Date.now();
    if (now - this.slicedAt < 8000 || this.swapping) return;
    const pop = this.host.querySelector<HTMLElement>('.mascot-pop');
    const img = pop?.querySelector<HTMLImageElement>('img');
    if (!pop || !img) return;
    this.slicedAt = now;
    this.swapping = true;
    clearInterval(this.mascotTimer);
    sfx.play('slice');
    const r = img.getBoundingClientRect();
    const layer = document.createElement('div');
    layer.setAttribute('aria-hidden', 'true');
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:980;overflow:hidden';
    document.body.appendChild(layer);
    // Đường chém chéo hơi lệch ngẫu nhiên.
    const a = 35 + Math.random() * 30;
    const b = 35 + Math.random() * 30;
    const half = (clip: string) => {
      const h = document.createElement('img');
      h.src = img.currentSrc || img.src;
      h.alt = '';
      h.style.cssText = `position:absolute;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;clip-path:${clip};will-change:transform;filter:drop-shadow(0 8px 14px rgba(0,0,0,.25))`;
      layer.appendChild(h);
      return h;
    };
    const top = half(`polygon(0 0, 100% 0, 100% ${b}%, 0 ${a}%)`);
    const bottom = half(`polygon(0 ${a}%, 100% ${b}%, 100% 100%, 0 100%)`);
    pop.style.visibility = 'hidden';
    // Vệt chém sáng
    const slash = document.createElement('div');
    const cy = r.top + (r.height * (a + b)) / 200;
    const ang = (Math.atan2(((b - a) / 100) * r.height, r.width) * 180) / Math.PI;
    slash.style.cssText = `position:absolute;left:${r.left - r.width * 0.25}px;top:${cy - 3}px;width:${r.width * 1.5}px;height:6px;border-radius:6px;
      background:linear-gradient(90deg,transparent,#fff 30%,#bfe9ff 70%,transparent);box-shadow:0 0 18px #9be7ff,0 0 6px #fff;transform-origin:50% 50%;transform:rotate(${ang}deg) scaleX(0)`;
    layer.appendChild(slash);
    slash.animate(
      [
        { transform: `rotate(${ang}deg) scaleX(0)`, opacity: 1 },
        { transform: `rotate(${ang}deg) scaleX(1)`, opacity: 1, offset: 0.4 },
        { transform: `rotate(${ang}deg) scaleX(1.1)`, opacity: 0 },
      ],
      { duration: 380, easing: 'ease-out', fill: 'forwards' },
    );
    const ease = 'cubic-bezier(.2,.7,.3,1)';
    top.animate(
      [
        { transform: 'none' },
        { transform: 'translate(6px,-4px) rotate(-2deg)', offset: 0.18 },
        { transform: `translate(${r.width * 0.28}px, ${-r.height * 0.22}px) rotate(-16deg)`, opacity: 1, offset: 0.75 },
        { transform: `translate(${r.width * 0.34}px, ${-r.height * 0.18}px) rotate(-20deg)`, opacity: 0 },
      ],
      { duration: 1300, delay: 120, easing: ease, fill: 'forwards' },
    );
    bottom.animate(
      [
        { transform: 'none' },
        { transform: 'translate(-6px,4px) rotate(2deg)', offset: 0.18 },
        { transform: `translate(${-r.width * 0.2}px, ${r.height * 0.3}px) rotate(12deg)`, opacity: 1, offset: 0.75 },
        { transform: `translate(${-r.width * 0.24}px, ${r.height * 0.42}px) rotate(16deg)`, opacity: 0 },
      ],
      { duration: 1300, delay: 120, easing: ease, fill: 'forwards' },
    );
    // Người hướng dẫn hiện ra mời chơi Fumo Ninja.
    setTimeout(() => this.guide.offerNinja(), 650);
    // Lành lại: bé fumo bật ra như mới.
    setTimeout(() => {
      layer.remove();
      pop.style.visibility = '';
      animate(pop, {
        scale: [0, 1],
        rotate: [-20, 0],
        opacity: [0, 1],
        duration: 650,
        ease: 'outElastic(1, .6)',
        onComplete: () => {
          this.swapping = false;
          this.mascotTimer = setInterval(() => this.swapMascot(), MASCOT_INTERVAL);
        },
      });
    }, 2200);
  }

  /** Rê chuột vào mascot: Cirno (bé 1) nhún kèm tiếng "Baka!". */
  mascotHover(): void {
    if (this.mascotIndex() === 0) playBaka();
  }

  /** Bấm vào mascot → đổi ngay sang bé khác (và tính lại giờ tự đổi). */
  pokeMascot(): void {
    clearInterval(this.mascotTimer);
    this.swapMascot();
    this.mascotTimer = setInterval(() => this.swapMascot(), MASCOT_INTERVAL);
  }

  /** "Pop" bé hiện tại biến mất rồi bật ra một bé khác (ngẫu nhiên, không trùng bé đang hiện). */
  private swapMascot(): void {
    const el = this.host.querySelector<HTMLElement>('.mascot-pop');
    if (!el || this.swapping || document.hidden) return;
    const next = (this.mascotIndex() + 1 + Math.floor(Math.random() * (MASCOTS.length - 1))) % MASCOTS.length;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.mascotIndex.set(next);
      return;
    }
    this.swapping = true;
    if (this.isDark()) return this.glitchSwap(el, next);
    animate(el, {
      scale: [1, 0],
      rotate: [0, -25],
      opacity: [1, 0],
      duration: 280,
      ease: 'inBack',
      onComplete: () => {
        this.mascotIndex.set(next);
        requestAnimationFrame(() =>
          animate(el, {
            scale: [0, 1],
            rotate: [25, 0],
            opacity: [0, 1],
            duration: 650,
            ease: 'outElastic(1, .6)',
            onComplete: () => (this.swapping = false),
          }),
        );
      },
    });
  }

  /** Kiểu "tin học" cho chế độ tối: giật nhiễu (glitch) rồi tắt, đổi bé, bật lại kèm rung nhẹ. */
  private glitchSwap(el: HTMLElement, next: number): void {
    animate(el, {
      translateX: [0, -10, 8, -5, 0],
      skewX: [0, 14, -10, 0],
      scale: [1, 1.04, 0.2],
      opacity: [1, 0.6, 1, 0],
      duration: 360,
      ease: 'linear',
      onComplete: () => {
        this.mascotIndex.set(next);
        requestAnimationFrame(() =>
          animate(el, {
            scale: [0.2, 1.08, 1],
            translateX: [12, -6, 3, 0],
            skewX: [-12, 6, 0],
            opacity: [0, 1],
            duration: 520,
            ease: 'outExpo',
            onComplete: () => (this.swapping = false),
          }),
        );
      },
    });
  }

  /** Dải số liệu cuối trang chủ (số khách vui vẻ + năm kinh nghiệm chỉnh trong Cài đặt). */
  readonly stats = [
    { icon: '🧸', label: 'Sản phẩm', plus: false, target: () => this.service.shop().length, value: signal(0), show: () => true },
    { icon: '🗂️', label: 'Danh mục', plus: false, target: () => this.categorySvc.categories().length, value: signal(0), show: () => true },
    { icon: '💖', label: 'Khách hàng vui vẻ', plus: true, target: () => Math.max(0, this.settings().happyCustomers ?? 1200), value: signal(0), show: () => true },
    { icon: '🏅', label: 'Năm kinh nghiệm', plus: true, target: () => Math.max(0, this.settings().yearsExperience ?? 3), value: signal(0), show: () => (this.settings().yearsExperience ?? 3) > 0 },
  ];

  ngAfterViewInit(): void {
    const q = (s: string) => this.host.querySelectorAll(s);

    createTimeline({ defaults: { ease: 'outExpo' } })
      .add(q('.hero .word'), {
        translateY: [80, 0],
        rotate: [8, 0],
        opacity: [0, 1],
        duration: 1000,
        delay: stagger(90),
      })
      .add(q('.hero .lead, .hero .actions'), {
        translateY: [30, 0],
        opacity: [0, 1],
        duration: 800,
        delay: stagger(120),
      }, '-=600')
      .add(q('.hero .mascot'), {
        scale: [0.4, 1],
        rotate: [-20, 0],
        opacity: [0, 1],
        duration: 1200,
        ease: 'outElastic(1, .6)',
      }, '-=900');

    // Bong bóng trôi lơ lửng (lặp vô hạn) — chế độ nhẹ thì để đứng yên.
    if (!perf.lite) q('.bubble').forEach((el, i) => {
      this.loops.push(
        animate(el, {
          translateY: [0, -30 - i * 6],
          translateX: [0, i % 2 ? 14 : -14],
          duration: 2600 + i * 400,
          loop: true,
          alternate: true,
          ease: 'inOutSine',
        }),
      );
    });
    this.observeStats();
  }

  /** Mascot lơ lửng — chạy lại mỗi khi quay về giao diện sáng (mascot được render lại). */
  private startMascotFloat(): void {
    this.mascotLoop?.pause();
    if (perf.lite) return;
    const emoji = this.host.querySelector('.mascot-emoji');
    if (!emoji) return;
    this.mascotLoop = animate(emoji, {
      translateY: [0, -14],
      rotate: [-4, 4],
      duration: 1800,
      loop: true,
      alternate: true,
      ease: 'inOutSine',
    });
  }

  /** Đếm số khi khu vực thống kê lọt vào màn hình. */
  private observeStats(): void {
    const el = this.host.querySelector('.stats');
    if (!el) return;
    this.statsObserver = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      this.statsObserver?.disconnect();
      for (const s of this.stats) {
        const counter = { n: 0 };
        animate(counter, {
          n: s.target(),
          duration: 1800,
          ease: 'outExpo',
          modifier: Math.round,
          onUpdate: () => s.value.set(counter.n),
        });
      }
    }, { threshold: 0.4 });
    this.statsObserver.observe(el);
  }

  bounce(event: MouseEvent): void {
    animate(event.currentTarget as HTMLElement, {
      scale: [1, 1.12, 1],
      rotate: [0, -6, 6, 0],
      duration: 600,
      ease: 'outElastic(1, .5)',
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.peekTimer);
    this.loops.forEach((a) => a.pause());
    this.mascotLoop?.pause();
    clearInterval(this.mascotTimer);
    this.statsObserver?.disconnect();
  }
}

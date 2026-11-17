import { AfterViewInit, Component, ElementRef, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { ThemeService } from '../../services/theme.service';
import { TerminalComponent, TerminalLine } from '../../components/terminal/terminal';
import { RouterLink } from '@angular/router';
import { JSAnimation, animate, createTimeline, stagger } from 'animejs';
import { CategoryService } from '../../services/category.service';
import { ProductService } from '../../services/product.service';
import { newsPath } from '../../models/news';
import { NewsService } from '../../services/news.service';
import { SettingsService } from '../../services/settings.service';
import { DatePipe } from '@angular/common';
import { ProductCardComponent } from '../../components/product-card/product-card';
import { AnimateInDirective } from '../../shared/animate-in.directive';

@Component({
  selector: 'app-home',
  imports: [RouterLink, DatePipe, ProductCardComponent, AnimateInDirective, TerminalComponent],
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
  readonly categories = computed(() =>
    this.categorySvc.categories().map((c) => ({ ...c, count: this.categorySvc.counts().get(c.name) ?? 0 })),
  );

  readonly isDark = computed(() => this.theme.theme() === 'dark');
  private mascotLoop?: JSAnimation;

  /** Nội dung terminal ở chế độ tối — lấy từ dữ liệu thật của shop. */
  readonly terminalLines = computed<TerminalLine[]>(() => {
    const s = this.settings();
    const products = this.service.products();
    const featured = this.service.featured().slice(0, 3).map((p) => p.name);
    return [
      { kind: 'cmd', text: 'whoami\n' },
      { kind: 'out', text: `${s.shopName}\n` },
      { kind: 'cmd', text: 'fumo --stats\n' },
      { kind: 'out', text: `products: ${products.length}  categories: ${this.categorySvc.categories().length}  in_stock: ${products.filter((p) => p.inStock).length}\n` },
      { kind: 'cmd', text: 'cat slogan.txt\n' },
      { kind: 'out', text: `"${s.tagline}"\n` },
      ...(featured.length
        ? [
            { kind: 'cmd' as const, text: 'ls ./featured\n' },
            { kind: 'out' as const, text: featured.map((n) => `▸ ${n}`).join('\n') + '\n' },
          ]
        : []),
      { kind: 'cmd', text: '' },
    ];
  });

  constructor() {
    effect(() => {
      if (!this.isDark()) requestAnimationFrame(() => this.startMascotFloat());
      else this.mascotLoop?.pause();
    });
  }

  readonly stats = [
    { label: 'Sản phẩm', target: () => this.service.products().length, value: signal(0) },
    { label: 'Danh mục', target: () => this.categorySvc.categories().length, value: signal(0) },
    { label: 'Khách hàng vui vẻ', target: () => 1200, value: signal(0) },
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

    // Bong bóng trôi lơ lửng (lặp vô hạn).
    q('.bubble').forEach((el, i) => {
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
    this.loops.forEach((a) => a.pause());
    this.mascotLoop?.pause();
    this.statsObserver?.disconnect();
  }
}

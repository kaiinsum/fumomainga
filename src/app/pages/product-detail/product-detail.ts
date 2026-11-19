import { Component, ElementRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { setPageTitle } from '../../core/shop-title.strategy';
import { SettingsService } from '../../services/settings.service';
import { animate, createTimeline, stagger } from 'animejs';
import { CatalogSyncService } from '../../services/catalog-sync.service';
import { ProductService } from '../../services/product.service';
import { ProductVariant, variantsOf } from '../../models/product';
import { CartService } from '../../services/cart.service';
import { flyToCart } from '../../shared/fly-to-cart';
import { ProductCardComponent } from '../../components/product-card/product-card';
import { PriceTagComponent } from '../../shared/price-tag';
import { AnimateInDirective } from '../../shared/animate-in.directive';

@Component({
  selector: 'app-product-detail',
  imports: [DatePipe, RouterLink, ProductCardComponent, AnimateInDirective, PriceTagComponent],
  templateUrl: './product-detail.html',
  styleUrl: './product-detail.scss',
})
export class ProductDetailPage {
  /** Lấy từ route param :id (withComponentInputBinding). */
  readonly id = input.required<string>();

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly service = inject(ProductService);
  readonly catalogLoaded = inject(CatalogSyncService).loaded;
  private readonly title = inject(Title);
  private readonly settings = inject(SettingsService).settings;
  private readonly cart = inject(CartService);
  private readonly router = inject(Router);
  readonly qty = signal(1);
  /** Biến thể đang chọn (null nếu sản phẩm không có biến thể). */
  readonly variantId = signal<string | null>(null);
  readonly variants = computed(() => { const p = this.product(); return p ? variantsOf(p) : []; });
  readonly variant = computed<ProductVariant | undefined>(() => this.variants().find((v) => v.id === this.variantId()) ?? this.variants()[0]);
  readonly added = signal(false);

  addToCart(buyNow = false): void {
    const p = this.product();
    if (!p) return;
    const qty = this.qty();
    if (buyNow) {
      this.cart.add(p.id, qty, this.variant()?.id);
      this.router.navigate(['/gio-hang']);
      return;
    }
    // Ảnh sản phẩm bay vào giỏ trên thanh menu; cộng vào giỏ khi ảnh chạm giỏ.
    this.added.set(true);
    flyToCart(this.host.querySelector('.main-img img'), this.activeImage() || p.images[0], qty, () => this.cart.add(p.id, qty, this.variant()?.id));
    setTimeout(() => this.added.set(false), 1800);
  }

  /** Sản phẩm admin đã ẩn → coi như không tồn tại. */
  readonly product = computed(() => {
    const p = this.service.find(this.id());
    return p && !p.hidden ? p : undefined;
  });
  readonly activeIndex = signal(0);
  readonly activeImage = computed(() => this.product()?.images[this.activeIndex()] ?? '');
  readonly related = computed(() => {
    const p = this.product();
    if (!p) return [];
    return this.service
      .shop()
      .filter((x) => x.id !== p.id && (x.category === p.category || x.tags.some((t) => p.tags.includes(t))))
      .slice(0, 4);
  });

  constructor() {
    // Khi đổi sản phẩm (ví dụ bấm vào sản phẩm liên quan) -> reset ảnh & chạy hiệu ứng vào trang.
    effect(() => {
      this.id();
      untracked(() => {
        const p = this.product();
        if (p) setPageTitle(this.title, p.name, this.settings().shopName);
        // Mở bằng id hoặc slug cũ → đổi URL sang link chuẩn (không thêm lịch sử).
        if (p?.slug && this.id() !== p.slug) this.router.navigate(['/san-pham', p.slug], { replaceUrl: true });
        this.activeIndex.set(0);
        this.variantId.set(this.variants()[0]?.id ?? null);
        requestAnimationFrame(() => this.intro());
      });
    });
  }

  private intro(): void {
    const q = (s: string) => this.host.querySelectorAll(s);
    if (!q('.detail').length) return;
    createTimeline({ defaults: { ease: 'outExpo' } })
      .add(q('.main-img'), { opacity: [0, 1], scale: [0.92, 1], duration: 900 })
      .add(q('.thumbs button'), { opacity: [0, 1], translateY: [20, 0], delay: stagger(70), duration: 500 }, '-=700')
      .add(q('.info > *'), { opacity: [0, 1], translateX: [40, 0], delay: stagger(60), duration: 700 }, '-=800');
  }

  select(i: number): void {
    if (i === this.activeIndex()) return;
    const img = this.host.querySelector('.main-img img');
    if (!img) {
      this.activeIndex.set(i);
      return;
    }
    animate(img, {
      opacity: [1, 0],
      scale: [1, 0.95],
      duration: 180,
      ease: 'inQuad',
      onComplete: () => {
        this.activeIndex.set(i);
        animate(img, { opacity: [0, 1], scale: [1.05, 1], duration: 420, ease: 'outCubic' });
      },
    });
  }

  step(dir: 1 | -1): void {
    const n = this.product()?.images.length ?? 0;
    if (n > 1) this.select((this.activeIndex() + dir + n) % n);
  }

}

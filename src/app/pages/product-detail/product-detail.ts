import { Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { setPageTitle } from '../../core/shop-title.strategy';
import { SeoMetaService } from '../../core/seo-meta.service';
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
import { IconComponent } from '../../shared/icon';
import { CategoryService } from '../../services/category.service';

/** Từ khoá trong 1 đoạn chữ (bỏ dấu, bỏ từ quá ngắn / quá chung). */
const STOP = new Set(['fumo', 'plush', 'cho', 'cua', 'the', 'and', 'voi', 'mot', 'cac', 'nhung', 'size', 'cm', 'ban']);
function keywords(text: string): Set<string> {
  const norm = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  return new Set(norm.split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)));
}

@Component({
  selector: 'app-product-detail',
  imports: [DatePipe, RouterLink, ProductCardComponent, AnimateInDirective, PriceTagComponent, IconComponent],
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
  private readonly seoMeta = inject(SeoMetaService);
  private readonly catSvc = inject(CategoryService);
  catIcon(name: string): string {
    return this.catSvc.find(name)?.icon ?? '';
  }
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
  /** Bộ ảnh: ảnh sản phẩm (ảnh đại diện đứng đầu) + ảnh riêng của các biến thể (không trùng). */
  readonly gallery = computed(() => {
    const p = this.product();
    if (!p) return [] as string[];
    const extra = this.variants().map((v) => v.image).filter((x): x is string => !!x && !p.images.includes(x));
    return [...p.images, ...new Set(extra)];
  });
  readonly activeImage = computed(() => this.gallery()[this.activeIndex()] ?? this.product()?.images[0] ?? '');

  /** Chọn biến thể → nếu biến thể có ảnh riêng thì hiện ảnh đó. */
  pickVariant(v: ProductVariant): void {
    this.variantId.set(v.id);
    if (v.image) {
      const i = this.gallery().indexOf(v.image);
      if (i >= 0) this.select(i);
    }
  }

  /** Bấm ảnh nhỏ: ảnh thuộc biến thể nào thì chọn luôn biến thể đó. */
  pickThumb(i: number): void {
    this.select(i);
    const img = this.gallery()[i];
    const v = this.variants().find((x) => x.image === img);
    if (v) this.variantId.set(v.id);
  }
  /**
   * Gợi ý tối đa 5 sản phẩm liên quan — chấm điểm, không bó buộc cùng danh mục:
   * trùng thẻ (tag) +3 mỗi thẻ · cùng danh mục +2 · trùng từ khoá trong tên/mô tả +1 mỗi từ · còn hàng / nổi bật cộng nhẹ.
   */
  readonly related = computed(() => {
    const p = this.product();
    if (!p) return [];
    const words = keywords(p.name + ' ' + p.tags.join(' '));
    const tags = new Set(p.tags.map((t) => t.toLowerCase()));
    const scored = this.service
      .shop()
      .filter((x) => x.id !== p.id)
      .map((x) => {
        let score = 0;
        for (const t of x.tags) if (tags.has(t.toLowerCase())) score += 3;
        if (x.category === p.category) score += 2;
        const xw = keywords(x.name + ' ' + x.tags.join(' ') + ' ' + x.description.slice(0, 200));
        for (const w of words) if (xw.has(w)) score += 1;
        if (score > 0) score += (x.inStock ? 0.5 : 0) + (x.featured ? 0.3 : 0);
        return { x, score };
      })
      .sort((a, b) => b.score - a.score || b.x.createdAt - a.x.createdAt);
    const picks = scored.filter((s) => s.score > 0).slice(0, 5).map((s) => s.x);
    // Ít quá → thêm vài bé nổi bật / còn hàng cho đủ 5.
    if (picks.length < 5) {
      for (const s of scored) {
        if (picks.length >= 5) break;
        if (!picks.includes(s.x) && s.x.inStock) picks.push(s.x);
      }
    }
    return picks;
  });

  constructor() {
    // Khai báo SEO (meta, Open Graph, canonical, JSON-LD Product / bài viết) theo sản phẩm đang xem.
    inject(DestroyRef).onDestroy(() => this.seoMeta.clear());
    effect(() => {
      const p = this.product();
      const shop = this.settings().shopName;
      untracked(() => (p ? this.seoMeta.applyProduct(p, shop) : this.seoMeta.clear()));
    });
    // Khi đổi sản phẩm (ví dụ bấm vào sản phẩm liên quan) -> reset ảnh & chạy hiệu ứng vào trang.
    effect(() => {
      this.id();
      untracked(() => {
        const p = this.product();
        if (p) setPageTitle(this.title, p.seo?.title || p.name, this.settings().shopName);
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
    const n = this.gallery().length;
    if (n > 1) this.pickThumb((this.activeIndex() + dir + n) % n);
  }

}

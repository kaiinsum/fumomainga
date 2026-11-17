import { Component, ElementRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { setPageTitle } from '../../core/shop-title.strategy';
import { SettingsService } from '../../services/settings.service';
import { animate, createTimeline, stagger } from 'animejs';
import { ProductService } from '../../services/product.service';
import { ProductCardComponent } from '../../components/product-card/product-card';
import { VndPipe } from '../../shared/vnd.pipe';
import { AnimateInDirective } from '../../shared/animate-in.directive';

@Component({
  selector: 'app-product-detail',
  imports: [DatePipe, RouterLink, ProductCardComponent, VndPipe, AnimateInDirective],
  templateUrl: './product-detail.html',
  styleUrl: './product-detail.scss',
})
export class ProductDetailPage {
  /** Lấy từ route param :id (withComponentInputBinding). */
  readonly id = input.required<string>();

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly service = inject(ProductService);
  private readonly title = inject(Title);
  private readonly settings = inject(SettingsService).settings;

  readonly product = computed(() => this.service.getById(this.id()));
  readonly activeIndex = signal(0);
  readonly activeImage = computed(() => this.product()?.images[this.activeIndex()] ?? '');
  readonly related = computed(() => {
    const p = this.product();
    if (!p) return [];
    return this.service
      .products()
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
        this.activeIndex.set(0);
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

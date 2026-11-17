import { AfterViewInit, Component, ElementRef, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { animate, stagger } from 'animejs';
import { NewsService } from '../../services/news.service';
import { ProductService } from '../../services/product.service';
import { SettingsService } from '../../services/settings.service';
import { PriceTagComponent } from '../../shared/price-tag';

@Component({
  selector: 'app-admin-dashboard',
  imports: [RouterLink, DatePipe, PriceTagComponent],
  template: `
    <div class="adm-head">
      <h1>Bảng tin</h1>
    </div>
    <p class="welcome">Chào mừng quay lại <b>{{ settings().shopName }}</b>! Đây là tổng quan cửa hàng của bạn.</p>

    <div class="stats">
      @for (s of stats(); track s.label) {
        <a class="stat adm-box" [routerLink]="s.link">
          <span class="ic">{{ s.icon }}</span>
          <div>
            <strong>{{ s.shown() }}</strong>
            <span>{{ s.label }}</span>
          </div>
        </a>
      }
    </div>

    <div class="cols">
      <section class="adm-box">
        <h2>Thao tác nhanh</h2>
        <div class="box-body quick">
          <a class="btn primary" routerLink="/admin/san-pham/moi">+ Thêm sản phẩm</a>
          <a class="btn ghost" routerLink="/admin/tin-tuc/moi">✍️ Viết bài mới</a>
          <a class="btn ghost" routerLink="/admin/cai-dat">⚙️ Tuỳ chỉnh shop</a>
        </div>
      </section>

      <section class="adm-box">
        <h2>Sản phẩm mới đăng</h2>
        <ul class="list">
          @for (p of recentProducts(); track p.id) {
            <li>
              <img [src]="p.images[0]" [alt]="p.name" />
              <a [routerLink]="['/admin/san-pham', p.id]">{{ p.name }}</a>
              <small><app-price-tag [product]="p" [badge]="false" /></small>
            </li>
          } @empty {
            <li class="empty">Chưa có sản phẩm.</li>
          }
        </ul>
      </section>

      <section class="adm-box">
        <h2>Bài viết gần đây</h2>
        <ul class="list">
          @for (n of recentNews(); track n.id) {
            <li>
              <a [routerLink]="['/admin/tin-tuc', n.id]">{{ n.title }}</a>
              <small>
                @if (n.status === 'draft') { <span class="status draft">Nháp</span> }
                {{ n.updatedAt | date: 'dd/MM/yyyy' }}
              </small>
            </li>
          } @empty {
            <li class="empty">Chưa có bài viết.</li>
          }
        </ul>
      </section>
    </div>
  `,
  styles: `
    .welcome { margin: -8px 0 20px; color: #50575e; }
    .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; margin-bottom: 20px; }
    .stat { display: flex; align-items: center; gap: 14px; padding: 16px; transition: transform .2s, box-shadow .2s; }
    .stat:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(0,0,0,.08); }
    .stat .ic { font-size: 1.8rem; width: 48px; height: 48px; display: grid; place-items: center; border-radius: 12px;
      background: color-mix(in srgb, var(--primary) 14%, #fff); }
    .stat strong { display: block; font-size: 1.6rem; line-height: 1.1; }
    .stat div span { color: #646970; font-size: .85rem; font-weight: 700; }
    .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; align-items: start; }
    .quick { flex-direction: row !important; flex-wrap: wrap; }
    .list { list-style: none; margin: 0; padding: 8px 16px 12px; }
    .list li { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f0f0f1; }
    .list li:last-child { border-bottom: none; }
    .list img { width: 36px; height: 36px; border-radius: 8px; object-fit: cover; }
    .list a { flex: 1; font-weight: 700; color: var(--primary-dark); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .list small { color: #8c8f94; white-space: nowrap; }
    .list .empty { color: #8c8f94; justify-content: center; }
  `,
})
export class AdminDashboard implements AfterViewInit {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly productsSvc = inject(ProductService);
  private readonly newsSvc = inject(NewsService);
  readonly settings = inject(SettingsService).settings;

  readonly recentProducts = computed(() =>
    [...this.productsSvc.products()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5),
  );
  readonly recentNews = computed(() => this.newsSvc.posts().slice(0, 5));

  readonly stats = computed(() => {
    const products = this.productsSvc.products();
    const news = this.newsSvc.posts();
    return [
      { icon: '🧸', label: 'Sản phẩm', value: products.length, link: '/admin/san-pham' },
      { icon: '✅', label: 'Còn hàng', value: products.filter((p) => p.inStock).length, link: '/admin/san-pham' },
      { icon: '⭐', label: 'Nổi bật', value: products.filter((p) => p.featured).length, link: '/admin/san-pham' },
      { icon: '📰', label: 'Bài đã đăng', value: news.filter((n) => n.status === 'published').length, link: '/admin/tin-tuc' },
      { icon: '📝', label: 'Bản nháp', value: news.filter((n) => n.status === 'draft').length, link: '/admin/tin-tuc' },
    ].map((s) => ({ ...s, shown: signal(0) }));
  });

  ngAfterViewInit(): void {
    animate(this.host.querySelectorAll('.stat, .cols > section'), {
      opacity: [0, 1],
      translateY: [20, 0],
      delay: stagger(60),
      duration: 600,
      ease: 'outExpo',
    });
    for (const s of this.stats()) {
      const counter = { n: 0 };
      animate(counter, {
        n: s.value,
        duration: 1200,
        ease: 'outExpo',
        modifier: Math.round,
        onUpdate: () => s.shown.set(counter.n),
      });
    }
  }
}

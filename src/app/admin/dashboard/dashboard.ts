import { AfterViewInit, Component, ElementRef, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { animate, stagger } from 'animejs';
import { NewsService } from '../../services/news.service';
import { ProductService } from '../../services/product.service';
import { SettingsService } from '../../services/settings.service';
import { AdminInboxService } from '../inbox.service';
import { PriceTagComponent } from '../../shared/price-tag';
import { OrderApiService } from '../../services/order-api.service';
import { GAMES } from '../../models/minigames';
import { fmtDuration } from '../insights/insights';
import { OrderHeatmapComponent } from './order-heatmap';

@Component({
  selector: 'app-admin-dashboard',
  imports: [RouterLink, DatePipe, PriceTagComponent, OrderHeatmapComponent],
  template: `
    <div class="adm-head">
      <h1>Bảng tin</h1>
    </div>
    <p class="welcome">Chào mừng quay lại <b>{{ settings().shopName }}</b>! Đây là tổng quan cửa hàng của bạn.</p>

    @if (inbox.newMessages() || inbox.pendingOrders()) {
      <section class="adm-box inbox">
        <h2>📬 Cần xử lý</h2>
        <div class="box-body">
          <div class="inbox-links">
            @if (inbox.newMessages()) { <a class="btn primary small" routerLink="/admin/lien-he">✉️ {{ inbox.newMessages() }} lời nhắn mới</a> }
            @if (inbox.pendingOrders()) { <a class="btn ghost small" routerLink="/admin/don-hang">🧾 {{ inbox.pendingOrders() }} đơn chờ duyệt</a> }
          </div>
          @for (m of inbox.latest(); track m.id) {
            <a class="msg" routerLink="/admin/lien-he"><b>{{ m.name }}</b> <small>{{ m.createdAt | date: 'HH:mm dd/MM' }}</small><span>{{ m.message }}</span></a>
          }
        </div>
      </section>
    }

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

    <!-- Phân tích nhanh 7 ngày: minigame + sản phẩm đặt nhiều -->
    <section class="adm-box quick-insights">
      <h2>📊 7 ngày qua <span class="lnks"><a routerLink="/admin/doanh-thu">Doanh thu →</a> <a routerLink="/admin/phan-tich">Hiệu suất →</a></span></h2>
      <div class="box-body qi">
        <div class="qi-tile"><span>🎮 Người chơi minigame</span><b>{{ qi().players ?? '—' }}</b></div>
        <div class="qi-tile"><span>⏱ Thời gian chơi</span><b>{{ qi().seconds === null ? '—' : dur(qi().seconds!) }}</b></div>
        <div class="qi-tile"><span>🔥 Game hot nhất</span><b>{{ qi().topGame || '—' }}</b></div>
        <div class="qi-tile"><span>🏆 Đặt nhiều nhất</span><b>{{ qi().topProduct || '—' }}</b></div>
      </div>
    </section>

    <app-order-heatmap />

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
    .quick-insights h2 { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .quick-insights h2 a { font-size: .8rem; font-weight: 700; }
    .qi { display: grid !important; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .qi-tile { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1px solid #dcdcde; border-radius: 10px; min-width: 0; }
    .qi-tile span { font-size: .75rem; color: #646970; font-weight: 700; }
    .qi-tile b { font-size: 1.05rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    @media (max-width: 800px) { .qi { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .welcome { margin: -8px 0 20px; color: #50575e; }
    .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; margin-bottom: 20px; }
    .inbox { margin-bottom: 18px; border-left: 4px solid #d63638; }
    .inbox-links { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
    .msg { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; padding: 8px 10px; border-radius: 8px; color: inherit; text-decoration: none; }
    .msg:hover { background: #f6f7f7; }
    .msg small { color: #646970; align-self: center; }
    .msg span { grid-column: 1 / -1; color: #50575e; font-size: .9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .stat { display: flex; align-items: center; gap: 14px; padding: 16px; transition: transform .2s, box-shadow .2s; }
    .stat:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(0,0,0,.08); }
    .stat .ic { font-size: 1.8rem; width: 48px; height: 48px; display: grid; place-items: center; border-radius: 12px;
      background: color-mix(in srgb, var(--primary) 14%, #fff); }
    .stat strong { display: block; font-size: 1.6rem; line-height: 1.1; }
    @media (max-width: 600px) {
      .stats { grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
      .stat { gap: 10px; padding: 12px; }
      .stat .ic { width: 38px; height: 38px; font-size: 1.35rem; border-radius: 10px; }
      .stat strong { font-size: 1.3rem; }
    }
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
  readonly inbox = inject(AdminInboxService);

  private readonly api = inject(OrderApiService);
  readonly dur = fmtDuration;
  readonly qi = signal<{ players: number | null; seconds: number | null; topGame: string; topProduct: string }>({ players: null, seconds: null, topGame: '', topProduct: '' });

  constructor() {
    void this.loadInsights();
  }

  /** Số liệu nhanh 7 ngày (lỗi / chưa có máy chủ thì để "—"). */
  private async loadInsights(): Promise<void> {
    const [g, o] = await Promise.all([
      this.api.call<{ games: { game: string; players: number; seconds: number }[] }>('GET', '/api/analytics?insights=1&days=7', undefined, true).catch(() => null),
      this.api.list().catch(() => null),
    ]);
    const games = g?.games ?? [];
    const top = [...games].sort((a, b) => b.seconds - a.seconds)[0];
    const from = Date.now() - 7 * 86_400_000;
    const qty = new Map<string, number>();
    for (const ord of o?.orders ?? []) {
      if (ord.status === 'cancelled' || ord.createdAt < from) continue;
      for (const it of ord.items) qty.set(it.id, (qty.get(it.id) ?? 0) + it.qty);
    }
    const best = [...qty.entries()].sort((a, b) => b[1] - a[1])[0];
    this.qi.set({
      players: g ? games.reduce((s, x) => s + x.players, 0) : null,
      seconds: g ? games.reduce((s, x) => s + x.seconds, 0) : null,
      topGame: top ? (GAMES.find((d) => d.path === '/mini-game/' + top.game)?.title ?? top.game) : '',
      topProduct: best ? `${this.productsSvc.getById(best[0])?.name ?? 'Sản phẩm đã xoá'} (${best[1]})` : '',
    });
  }

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

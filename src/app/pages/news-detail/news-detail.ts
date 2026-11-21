import { Component, DestroyRef, ElementRef, computed, effect, inject, input, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { createTimeline, stagger } from 'animejs';
import { SeoMetaService } from '../../core/seo-meta.service';
import { setPageTitle } from '../../core/shop-title.strategy';
import { CatalogSyncService } from '../../services/catalog-sync.service';
import { NewsService } from '../../services/news.service';
import { SettingsService } from '../../services/settings.service';
import { ArticleHtmlPipe } from '../../shared/article-html';
import { IconComponent } from '../../shared/icon';
import { NewsCategory, NewsPost, newsCategoriesOf, newsPath } from '../../models/news';
import { NewsViewsService } from '../../services/news-views.service';

@Component({
  selector: 'app-news-detail',
  imports: [RouterLink, DatePipe, ArticleHtmlPipe, IconComponent],
  template: `
    <div class="container wrap">
      <nav class="crumbs"><a routerLink="/">Trang chủ</a> / <a routerLink="/tin-tuc">Tin tức</a></nav>
      @if (post(); as p) {
        <article>
          <header>
            <div class="meta">
              @if (catOf(p); as c) { <a class="chip" routerLink="/tin-tuc" [queryParams]="{ danhMuc: c.id }"><app-icon [icon]="c.icon" /> {{ c.name }}</a> }
              <small><time [attr.datetime]="iso(p.createdAt)">{{ p.createdAt | date: 'dd/MM/yyyy' }}</time></small>
              @if (views.loaded()) { <small>👁 {{ views.of(p) }} lượt xem</small> }
            </div>
            <h1>{{ p.title }}</h1>
          </header>
          @if (p.cover) {
            @if (p.coverLink && (p.coverLink.startsWith('/') || p.coverLink.startsWith('http'))) {
              <a class="cover-link" [href]="p.coverLink" [attr.target]="p.coverLink.startsWith('/') ? null : '_blank'" rel="noopener"><img class="cover" [src]="p.cover" [alt]="p.coverAlt || p.title" /></a>
            } @else {
              <img class="cover" [src]="p.cover" [alt]="p.coverAlt || p.title" />
            }
          }
          <div class="prose" [innerHTML]="p.content | articleHtml: p.format"></div>
        </article>

        @if (others().length) {
          <aside class="others">
            <h3>Bài viết khác</h3>
            @for (o of others(); track o.id) {
              <a [routerLink]="path(o)">→ {{ o.title }}</a>
            }
          </aside>
        }
      } @else if (!catalogLoaded()) {
        <div class="missing card-surface"><p>⏳ Đang tải bài viết…</p></div>
      } @else {
        <div class="missing card-surface">
          <h2>Không tìm thấy bài viết</h2>
          <a class="btn primary" routerLink="/tin-tuc">Xem tin tức khác</a>
        </div>
      }
    </div>
  `,
  styles: `
    .meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .meta small { color: var(--muted); }
    .chip { display: inline-flex; align-items: center; gap: 4px; font-size: .78rem; font-weight: 800; padding: 2px 10px; border-radius: 999px;
      background: color-mix(in srgb, var(--primary) 14%, var(--surface)); color: var(--primary-dark); text-decoration: none; }
    .chip:hover { background: color-mix(in srgb, var(--primary) 24%, var(--surface)); }
    .wrap { max-width: 780px; padding-bottom: 48px; }
    .crumbs { padding: 24px 0; color: var(--muted); font-size: .9rem; }
    .crumbs a:hover { color: var(--primary); }
    header small { color: var(--muted); font-weight: 700; }
    h1 { font-size: clamp(1.8rem, 4vw, 2.6rem); margin: 6px 0 20px; }
    .cover { width: 100%; border-radius: var(--radius); aspect-ratio: 16 / 9; object-fit: cover; margin-bottom: 24px; }
    .others { margin-top: 40px; padding-top: 20px; border-top: 2px dashed var(--border); display: flex; flex-direction: column; gap: 6px; }
    .others a { font-weight: 700; color: var(--primary-dark); }
    .missing { text-align: center; padding: 48px 16px; }
  `,
})
export class NewsDetailPage {
  readonly id = input.required<string>();

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly news = inject(NewsService);
  readonly catalogLoaded = inject(CatalogSyncService).loaded;
  private readonly title = inject(Title);
  private readonly settings = inject(SettingsService).settings;
  private readonly seo = inject(SeoMetaService);

  readonly path = newsPath;
  readonly iso = (t: number) => new Date(t).toISOString();
  readonly views = inject(NewsViewsService);

  catOf(p: NewsPost): NewsCategory | undefined {
    return p.category ? newsCategoriesOf(this.settings()).find((c) => c.id === p.category) : undefined;
  }

  /** Chỉ hiển thị bài đã xuất bản - bản nháp không xem được từ trang công khai. Tìm theo slug hoặc id. */
  readonly post = computed(() => {
    const p = this.news.findByPath(this.id());
    return p?.status === 'published' ? p : undefined;
  });
  readonly others = computed(() => this.news.published().filter((p) => p.id !== this.post()?.id).slice(0, 4));

  constructor() {
    void this.views.load();
    inject(DestroyRef).onDestroy(() => this.seo.clear());
    // Khai báo SEO (meta, Open Graph, canonical, JSON-LD) mỗi khi bài/cài đặt thay đổi.
    effect(() => {
      const p = this.post();
      const shop = this.settings().shopName;
      untracked(() => {
        if (!p) return this.seo.clear();
        setPageTitle(this.title, p.seo?.title || p.title, shop);
        this.seo.applyArticle(p, shop);
      });
    });
    effect(() => {
      this.id();
      untracked(() => {
        requestAnimationFrame(() => {
          const q = (s: string) => this.host.querySelectorAll(s);
          if (!q('article').length) return;
          createTimeline({ defaults: { ease: 'outExpo' } })
            .add(q('article header'), { opacity: [0, 1], translateY: [30, 0], duration: 700 })
            .add(q('.cover'), { opacity: [0, 1], scale: [0.95, 1], duration: 800 }, '-=500')
            .add(q('.prose > *'), { opacity: [0, 1], translateY: [16, 0], delay: stagger(50), duration: 500 }, '-=600');
        });
      });
    });
  }
}

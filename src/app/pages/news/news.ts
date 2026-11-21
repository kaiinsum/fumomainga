import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NewsCategory, NewsPost, newsCategoriesOf, newsPath } from '../../models/news';
import { NewsService } from '../../services/news.service';
import { NewsViewsService } from '../../services/news-views.service';
import { SettingsService } from '../../services/settings.service';
import { contentAsMarkdown } from '../../shared/article-html';
import { AnimateInDirective } from '../../shared/animate-in.directive';
import { IconComponent } from '../../shared/icon';
import { markdownToText } from '../../shared/seo';

type Sort = 'new' | 'views' | 'old';

/** Bỏ dấu, chữ thường - để tìm "meo" ra "Mẹo". */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

@Component({
  selector: 'app-news',
  imports: [RouterLink, DatePipe, AnimateInDirective, IconComponent],
  template: `
    <section class="page-head">
      <div class="container">
        <h1 appAnimateIn>Tin <span>tức</span></h1>
        <p appAnimateIn [animDelay]="100">Sản phẩm mới, sự kiện và những mẹo hay dành cho bạn.</p>
      </div>
    </section>

    <div class="container wrap">
      <div class="tools card-surface">
        <label class="search">
          <span aria-hidden="true">🔎</span>
          <input type="search" [value]="q()" (input)="setQ($any($event.target).value)" placeholder="Tìm bài viết…" aria-label="Tìm bài viết" />
          @if (q()) { <button type="button" class="clear" (click)="setQ('')" aria-label="Xoá tìm kiếm">✕</button> }
        </label>
        <select [value]="sort()" (change)="setSort($any($event.target).value)" aria-label="Sắp xếp">
          <option value="new">Mới nhất</option>
          <option value="views">Xem nhiều nhất</option>
          <option value="old">Cũ nhất</option>
        </select>
      </div>

      <div class="cats" role="radiogroup" aria-label="Danh mục bài viết">
        <button type="button" role="radio" [attr.aria-checked]="!cat()" [class.on]="!cat()" (click)="setCat('')">Tất cả <small>{{ all().length }}</small></button>
        @for (c of catsWithCount(); track c.id) {
          <button type="button" role="radio" [attr.aria-checked]="cat() === c.id" [class.on]="cat() === c.id" (click)="setCat(c.id)">
            <app-icon [icon]="c.icon" /> {{ c.name }} <small>{{ c.count }}</small>
          </button>
        }
      </div>

      @if (q() || cat()) {
        <p class="result">{{ shown().length }} bài{{ cat() ? ' trong "' + catName(cat()) + '"' : '' }}{{ q() ? ' khớp "' + q() + '"' : '' }}
          <button type="button" class="lnk" (click)="reset()">Xoá bộ lọc</button></p>
      }

      <div class="list">
        @for (n of shown(); track n.id; let i = $index) {
          <a class="item card-surface" [routerLink]="path(n)" [appAnimateIn]="i % 2 ? 'right' : 'left'">
            @if (n.cover) { <img [src]="n.cover" [alt]="n.coverAlt || n.title" loading="lazy" /> }
            <div class="body">
              <div class="meta">
                @if (catOf(n); as c) { <span class="chip"><app-icon [icon]="c.icon" /> {{ c.name }}</span> }
                <small>{{ n.createdAt | date: 'dd/MM/yyyy' }}</small>
                <small class="views" [title]="views.of(n) + ' lượt xem'">👁 {{ fmt(views.of(n)) }}</small>
              </div>
              <h2>{{ n.title }}</h2>
              <p>{{ n.excerpt }}</p>
              <span class="more">Đọc tiếp →</span>
            </div>
          </a>
        } @empty {
          <div class="empty card-surface">
            <img src="img/cirno-sad-head.webp" width="224" height="245" alt="" />
            <p>{{ all().length ? 'Không tìm thấy bài viết phù hợp.' : 'Chưa có bài viết nào.' }}</p>
            @if (q() || cat()) { <button type="button" class="btn ghost" (click)="reset()">Xoá bộ lọc</button> }
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .page-head { padding: 48px 0 20px; text-align: center; }
    .page-head h1 { font-size: clamp(2rem, 4vw, 2.8rem); }
    .page-head h1 span { color: var(--primary); }
    .page-head p { color: var(--muted); margin: 0; }
    .wrap { max-width: 900px; padding-bottom: 48px; display: flex; flex-direction: column; gap: 14px; }
    .tools { display: flex; gap: 10px; padding: 10px; align-items: center; }
    .search { flex: 1; display: flex; align-items: center; gap: 8px; padding: 0 12px; border-radius: 12px; border: 2px solid var(--border); background: var(--surface); }
    .search:focus-within { border-color: var(--primary); }
    .search input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; font: inherit; padding: 10px 0; color: var(--text); }
    .clear { border: 0; background: none; color: var(--muted); cursor: pointer; }
    select { font: inherit; padding: 10px 12px; border-radius: 12px; border: 2px solid var(--border); background: var(--surface); color: var(--text); }
    .cats { display: flex; gap: 8px; flex-wrap: wrap; }
    .cats button { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-weight: 700; font-size: .9rem; padding: 7px 14px; border-radius: 999px;
      border: 2px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; transition: border-color .2s, background .2s; }
    .cats button:hover { border-color: var(--primary); }
    .cats button.on { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
    .cats small { opacity: .7; font-weight: 600; }
    .result { margin: 0; color: var(--muted); font-size: .9rem; }
    .lnk { border: 0; background: none; color: var(--primary-dark); font: inherit; font-weight: 700; cursor: pointer; text-decoration: underline; }
    .list { display: flex; flex-direction: column; gap: 22px; }
    .item { display: grid; grid-template-columns: 280px 1fr; overflow: hidden; transition: transform .25s; }
    .item:hover { transform: translateY(-4px); }
    .item img { width: 100%; height: 100%; object-fit: cover; aspect-ratio: 16 / 10; }
    .body { padding: 20px 24px; display: flex; flex-direction: column; }
    .meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .chip { display: inline-flex; align-items: center; gap: 4px; font-size: .75rem; font-weight: 800; padding: 2px 10px; border-radius: 999px;
      background: color-mix(in srgb, var(--primary) 14%, var(--surface)); color: var(--primary-dark); }
    .body small, .body p { color: var(--muted); }
    .views { font-variant-numeric: tabular-nums; }
    .body h2 { font-size: 1.3rem; margin: 6px 0 8px; }
    .body p { margin: 0 0 12px; }
    .more { margin-top: auto; color: var(--primary); font-weight: 800; }
    .empty { text-align: center; padding: 32px 16px; color: var(--muted); display: grid; justify-items: center; gap: 6px; }
    .empty img { width: 110px; height: auto; }
    .empty p { margin: 0; }
    @media (max-width: 680px) {
      .item { grid-template-columns: 1fr; }
      .tools { flex-direction: column; align-items: stretch; }
      .cats { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
      .cats button { flex: none; }
      .body { padding: 14px 16px; }
      .body h2 { font-size: 1.12rem; }
    }
  `,
})
export class NewsPage {
  private readonly router = inject(Router);
  private readonly settings = inject(SettingsService).settings;
  readonly views = inject(NewsViewsService);
  readonly all = inject(NewsService).published;
  readonly path = newsPath;

  private readonly qp = inject(ActivatedRoute).snapshot.queryParamMap;
  readonly q = signal(this.qp.get('q') ?? '');
  readonly cat = signal(this.qp.get('danhMuc') ?? '');
  readonly sort = signal<Sort>((['new', 'views', 'old'].includes(this.qp.get('sapXep') ?? '') ? this.qp.get('sapXep') : 'new') as Sort);

  readonly cats = computed<NewsCategory[]>(() => newsCategoriesOf(this.settings()));
  /** Danh mục có ít nhất 1 bài đã đăng (kèm số bài). */
  readonly catsWithCount = computed(() =>
    this.cats()
      .map((c) => ({ ...c, count: this.all().filter((n) => n.category === c.id).length }))
      .filter((c) => c.count > 0 || c.id === this.cat()),
  );

  /** Chữ của từng bài (tiêu đề + tóm tắt + nội dung, đã bỏ dấu) để tìm nhanh. */
  private readonly haystack = computed(() => {
    const m = new Map<string, string>();
    for (const n of this.all()) m.set(n.id, norm(`${n.title} ${n.excerpt} ${markdownToText(contentAsMarkdown(n))} ${n.seo?.focusKeyword ?? ''}`));
    return m;
  });

  readonly shown = computed(() => {
    const words = norm(this.q().trim()).split(/\s+/).filter(Boolean);
    const cat = this.cat();
    const list = this.all().filter((n) => (!cat || n.category === cat) && words.every((w) => this.haystack().get(n.id)?.includes(w)));
    const s = this.sort();
    const v = (n: NewsPost) => this.views.of(n);
    return [...list].sort((a, b) => (s === 'views' ? v(b) - v(a) || b.createdAt - a.createdAt : s === 'old' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt));
  });

  constructor() {
    void this.views.load();
  }

  catOf(n: NewsPost): NewsCategory | undefined {
    return n.category ? this.cats().find((c) => c.id === n.category) : undefined;
  }
  catName(id: string): string {
    return this.cats().find((c) => c.id === id)?.name ?? id;
  }
  fmt(n: number): string {
    return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '') + 'k' : String(n);
  }

  setQ(v: string): void {
    this.q.set(v);
    this.syncUrl();
  }
  setCat(id: string): void {
    this.cat.set(id);
    this.syncUrl();
  }
  setSort(s: Sort): void {
    this.sort.set(s);
    this.syncUrl();
  }
  reset(): void {
    this.q.set('');
    this.cat.set('');
    this.syncUrl();
  }

  /** Giữ bộ lọc trên link (chia sẻ / quay lại vẫn giữ). */
  private syncUrl(): void {
    void this.router.navigate([], {
      queryParams: { q: this.q().trim() || null, danhMuc: this.cat() || null, sapXep: this.sort() === 'new' ? null : this.sort() },
      replaceUrl: true,
    });
  }
}

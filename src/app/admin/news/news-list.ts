import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { animate } from 'animejs';
import { EMPTY_SEO, NewsCategory, NewsPost, NewsStatus, newsCategoriesOf, newsPath } from '../../models/news';
import { NewsViewsService } from '../../services/news-views.service';
import { SettingsService } from '../../services/settings.service';
import { IconComponent, IconPickerComponent } from '../../shared/icon';
import { NewsService } from '../../services/news.service';
import { analyzeSeo, scoreLevel, slugify } from '../../shared/seo';
import { AdminToastService } from '../toast.service';

@Component({
  selector: 'app-admin-news-list',
  imports: [FormsModule, RouterLink, DatePipe, IconComponent, IconPickerComponent],
  template: `
    <div class="adm-head">
      <h1>Tin tức</h1>
      <a class="btn primary small" routerLink="/admin/tin-tuc/moi">+ Viết bài mới</a>
      <button class="btn ghost small" type="button" (click)="catOpen.set(!catOpen())" [attr.aria-expanded]="catOpen()">🗂 Danh mục bài viết</button>
      <button class="btn ghost small" type="button" (click)="sitemapHelp.set(!sitemapHelp())">🗺 Sitemap</button>
    </div>

    @if (catOpen()) {
      <section class="adm-box cat-box">
        <h2>🗂 Danh mục bài viết</h2>
        <div class="box-body">
          <p class="hint">Khách lọc bài theo danh mục ở trang <b>Tin tức</b>. Danh mục chưa có bài nào sẽ tự ẩn với khách.</p>
          <div class="cat-rows">
            @for (c of catDraft(); track c.id; let i = $index) {
              <div class="cat-row">
                <app-icon-picker [ngModel]="c.icon" (ngModelChange)="setCat(i, 'icon', $event)" />
                <input [ngModel]="c.name" (ngModelChange)="setCat(i, 'name', $event)" maxlength="40" placeholder="Tên danh mục" aria-label="Tên danh mục" />
                <span class="cnt">{{ catCount(c.id) }} bài</span>
                <button type="button" class="mini" title="Lên" [disabled]="i === 0" (click)="moveCat(i, -1)">↑</button>
                <button type="button" class="mini" title="Xuống" [disabled]="i === catDraft().length - 1" (click)="moveCat(i, 1)">↓</button>
                <button type="button" class="mini del" title="Xoá" (click)="removeCat(i)">✕</button>
              </div>
            }
          </div>
          <form class="cat-add" (submit)="$event.preventDefault(); addCat()">
            <app-icon-picker [ngModel]="newIcon()" (ngModelChange)="newIcon.set($event)" [ngModelOptions]="{ standalone: true }" />
            <input [ngModel]="newName()" (ngModelChange)="newName.set($event)" [ngModelOptions]="{ standalone: true }" maxlength="40" placeholder="Tên danh mục mới, vd: Review fumo" />
            <button class="btn ghost small" type="submit" [disabled]="!newName().trim()">+ Thêm</button>
          </form>
          <div class="cat-actions">
            <button class="btn ghost small" type="button" [disabled]="!catDirty()" (click)="resetCats()">Huỷ thay đổi</button>
            <button data-save class="btn primary small" type="button" [disabled]="!catDirty() || catSaving()" (click)="saveCats()">{{ catSaving() ? 'Đang lưu…' : 'Lưu danh mục' }}</button>
          </div>
        </div>
      </section>
    }

    @if (sitemapHelp()) {
      <div class="adm-notice sitemap">
        <p>
          <b>sitemap.xml</b> và <b>robots.txt</b> được <b>tạo tự động</b>: luôn có đủ sản phẩm, danh mục và bài đã đăng
          (bỏ sản phẩm ẩn, bài nháp và mọi trang đặt noindex). Thêm / sửa sản phẩm hay bài viết là sitemap tự cập nhật (chậm nhất ~10 phút).
        </p>
        <ol>
          <li>Vào Google Search Console → <b>Sitemaps</b> → nhập <code>sitemap.xml</code> → Gửi (chỉ cần làm 1 lần).</li>
          <li>Không cần tải file hay chép vào thư mục <code>public/</code> nữa (chép vào sẽ đè mất bản tự động).</li>
        </ol>
        <div class="row">
          <a class="btn primary small" [href]="origin + '/sitemap.xml'" target="_blank" rel="noopener">Xem sitemap.xml ↗</a>
          <a class="btn ghost small" [href]="origin + '/robots.txt'" target="_blank" rel="noopener">Xem robots.txt ↗</a>
        </div>
      </div>
    }

    <nav class="adm-tabs">
      @for (t of tabs(); track t.key) {
        <button type="button" [class.on]="tab() === t.key" (click)="tab.set(t.key)">
          {{ t.label }} <span class="count">({{ t.count }})</span>
        </button>
      }
    </nav>

    <div class="adm-toolbar">
      <select [ngModel]="catFilter()" (ngModelChange)="catFilter.set($event)" aria-label="Lọc theo danh mục">
        <option value="">Tất cả danh mục</option>
        @for (c of cats(); track c.id) { <option [value]="c.id">{{ c.name }} ({{ catCount(c.id) }})</option> }
        <option value="__none">Chưa phân loại ({{ catCount('') }})</option>
      </select>
      <select [ngModel]="sortBy()" (ngModelChange)="sortBy.set($event)" aria-label="Sắp xếp">
        <option value="updated">Mới cập nhật</option>
        <option value="views">Xem nhiều nhất</option>
      </select>
      <span class="spacer"></span>
      <input type="search" placeholder="Tìm bài viết..." [ngModel]="search()" (ngModelChange)="search.set($event)" />
    </div>

    <div class="adm-table-wrap">
      <table class="adm-table">
        <thead>
          <tr>
            <th style="width: 64px">Ảnh</th>
            <th>Tiêu đề</th>
            <th>Danh mục</th>
            <th style="width: 90px" class="num">👁 Lượt xem</th>
            <th style="width: 90px">SEO</th>
            <th>Trạng thái</th>
            <th>Cập nhật</th>
          </tr>
        </thead>
        <tbody>
          @for (n of rows(); track n.id) {
            <tr [attr.data-row]="n.id">
              <td>
                @if (n.cover) { <img class="thumb" [src]="n.cover" [alt]="n.title" /> }
              </td>
              <td class="title-cell">
                <a [routerLink]="['/admin/tin-tuc', n.id]">{{ n.title }}</a>
                <div class="row-actions">
                  <a [routerLink]="['/admin/tin-tuc', n.id]">Sửa</a>
                  @if (n.status === 'published') {
                    <a [href]="path(n)" target="_blank" rel="noopener">Xem</a>
                    <button type="button" (click)="setStatus(n, 'draft')">Chuyển thành nháp</button>
                  } @else {
                    <button type="button" (click)="setStatus(n, 'published')">Xuất bản</button>
                  }
                  <button type="button" class="del" (click)="remove(n)">Xoá</button>
                </div>
              </td>
              <td>
                @if (catOf(n); as c) { <span class="cat-chip"><app-icon [icon]="c.icon" /> {{ c.name }}</span> } @else { <span class="muted">-</span> }
              </td>
              <td class="num">{{ views.of(n) }}</td>
              <td>
                @let sc = seoScore(n);
                <span class="seo-score" [class]="'seo-score ' + scoreLevel(sc)" [title]="n.seo?.focusKeyword ? 'Từ khoá: ' + n.seo?.focusKeyword : 'Chưa đặt từ khoá'">{{ sc }}</span>
              </td>
              <td>
                <span class="status" [class.draft]="n.status === 'draft'">
                  {{ n.status === 'published' ? 'Đã đăng' : 'Nháp' }}
                </span>
              </td>
              <td>{{ n.updatedAt | date: 'dd/MM/yyyy HH:mm' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="7" class="empty">Không có bài viết nào.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    .sitemap p { margin: 0 0 6px; }
    .cat-box { margin-bottom: 14px; }
    .cat-box .box-body { display: grid; gap: 10px; }
    .cat-rows { display: grid; gap: 6px; }
    .cat-row, .cat-add { display: flex; gap: 8px; align-items: center; }
    .cat-row input, .cat-add input { flex: 1; min-width: 0; }
    .cnt { color: #646970; font-size: .8rem; white-space: nowrap; min-width: 48px; text-align: right; }
    .mini { border: 1px solid #c3c4c7; background: #fff; border-radius: 6px; width: 28px; height: 28px; cursor: pointer; }
    .mini:disabled { opacity: .4; cursor: default; }
    .mini.del { color: #b32d2e; }
    .cat-actions { display: flex; gap: 8px; justify-content: flex-end; }
    .hint { margin: 0; color: #646970; font-size: .85rem; }
    .cat-chip { display: inline-flex; align-items: center; gap: 4px; font-size: .78rem; font-weight: 700; padding: 1px 8px; border-radius: 999px; background: #e7f1fa; color: #2271b1; white-space: nowrap; }
    .muted { color: #8c8f94; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    .sitemap ol { margin: 0 0 6px; padding-left: 20px; }
    .sitemap .muted { color: #646970; font-size: .85rem; }
    .sitemap .row { display: flex; gap: 8px; flex-wrap: wrap; }
    .seo-score { display: inline-block; min-width: 38px; text-align: center; font-size: 0.8rem; font-weight: 800; padding: 2px 8px; border-radius: 999px; border: 1.5px solid currentColor; }
    .seo-score.ok { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
    .seo-score.warn { color: #8a6d00; }
    .seo-score.bad { color: var(--error, #b32d2e); }
  `,
})
export class AdminNewsList {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly service = inject(NewsService);
  private readonly toast = inject(AdminToastService);

  readonly path = newsPath;
  readonly origin = location.origin;
  readonly sitemapHelp = signal(false);
  readonly indexable = computed(() => this.service.posts().filter((p) => p.status === 'published' && !p.seo?.noindex).length);
  readonly scoreLevel = scoreLevel;
  readonly seoScore = (n: NewsPost) =>
    analyzeSeo({ ...n, seo: { ...EMPTY_SEO, ...n.seo } }, n.seo?.slug || slugify(n.title)).score;
  readonly tab = signal<'all' | NewsStatus>('all');
  readonly search = signal('');
  readonly views = inject(NewsViewsService);
  private readonly settingsSvc = inject(SettingsService);
  readonly cats = computed(() => newsCategoriesOf(this.settingsSvc.settings()));
  readonly catFilter = signal('');
  readonly sortBy = signal<'updated' | 'views'>('updated');

  // ---------- Quản lý danh mục bài viết ----------
  readonly catOpen = signal(!!inject(ActivatedRoute).snapshot.queryParamMap.get('danhMuc'));
  readonly catDraft = signal<NewsCategory[]>(this.cats().map((c) => ({ ...c })));
  readonly catDirty = computed(() => JSON.stringify(this.catDraft()) !== JSON.stringify(this.cats()));
  readonly catSaving = signal(false);
  readonly newName = signal('');
  readonly newIcon = signal('📝');

  constructor() {
    void this.views.load();
  }

  catOf(n: NewsPost): NewsCategory | undefined {
    return n.category ? this.cats().find((c) => c.id === n.category) : undefined;
  }
  catCount(id: string): number {
    const known = new Set(this.cats().map((c) => c.id));
    return this.service.posts().filter((n) => (id ? n.category === id : !n.category || !known.has(n.category))).length;
  }
  setCat(i: number, key: 'name' | 'icon', v: string): void {
    this.catDraft.update((l) => l.map((c, k) => (k === i ? { ...c, [key]: v } : c)));
  }
  moveCat(i: number, d: number): void {
    this.catDraft.update((l) => {
      const n = [...l];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });
  }
  removeCat(i: number): void {
    const c = this.catDraft()[i];
    const used = this.catCount(c.id);
    if (used && !confirm(`Xoá danh mục "${c.name}"? ${used} bài đang thuộc danh mục này sẽ thành "Chưa phân loại".`)) return;
    this.catDraft.update((l) => l.filter((_, k) => k !== i));
  }
  addCat(): void {
    const name = this.newName().trim();
    if (!name) return;
    const base = slugify(name) || 'danh-muc';
    const taken = new Set(this.catDraft().map((c) => c.id));
    let id = base;
    for (let k = 2; taken.has(id); k++) id = `${base}-${k}`;
    this.catDraft.update((l) => [...l, { id, name, icon: this.newIcon().trim() || '📝' }]);
    this.newName.set('');
  }
  resetCats(): void {
    this.catDraft.set(this.cats().map((c) => ({ ...c })));
  }
  async saveCats(): Promise<void> {
    const list = this.catDraft()
      .map((c) => ({ ...c, name: c.name.trim(), icon: c.icon.trim() || '📝' }))
      .filter((c) => c.name);
    const next = { ...this.settingsSvc.settings(), newsCategories: list };
    if (!this.toast.run(() => this.settingsSvc.save(next), 'Đã lưu danh mục bài viết')) return;
    this.catDraft.set(list.map((c) => ({ ...c })));
    this.catSaving.set(true);
    const err = await this.settingsSvc.publish(this.settingsSvc.settings());
    this.catSaving.set(false);
    if (err) this.toast.err('Đã lưu trên máy này nhưng chưa gửi được lên web: ' + err);
  }

  readonly tabs = computed(() => {
    const all = this.service.posts();
    return [
      { key: 'all' as const, label: 'Tất cả', count: all.length },
      { key: 'published' as const, label: 'Đã đăng', count: all.filter((n) => n.status === 'published').length },
      { key: 'draft' as const, label: 'Nháp', count: all.filter((n) => n.status === 'draft').length },
    ];
  });

  readonly rows = computed(() => {
    const term = this.search().trim().toLowerCase();
    const tab = this.tab();
    const cat = this.catFilter();
    const known = new Set(this.cats().map((c) => c.id));
    const list = this.service
      .posts()
      .filter((n) => (tab === 'all' || n.status === tab) && (!term || n.title.toLowerCase().includes(term)))
      .filter((n) => !cat || (cat === '__none' ? !n.category || !known.has(n.category) : n.category === cat));
    return this.sortBy() === 'views' ? [...list].sort((a, b) => this.views.of(b) - this.views.of(a)) : list;
  });



  setStatus(n: NewsPost, status: NewsStatus): void {
    this.toast.run(
      () => this.service.update(n.id, { status }),
      status === 'published' ? 'Đã xuất bản bài viết' : 'Đã chuyển thành nháp',
    );
  }

  remove(n: NewsPost): void {
    if (!confirm(`Xoá bài viết "${n.title}"?`)) return;
    const row = this.host.querySelector(`[data-row="${n.id}"]`);
    const done = () => void this.toast.run(() => this.service.remove(n.id), 'Đã xoá bài viết');
    if (!row) return done();
    animate(row, { opacity: [1, 0], translateX: [0, 40], duration: 300, ease: 'inQuad', onComplete: done });
  }
}

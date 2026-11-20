import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { animate } from 'animejs';
import { EMPTY_SEO, NewsPost, NewsStatus, newsPath } from '../../models/news';
import { NewsService } from '../../services/news.service';
import { analyzeSeo, scoreLevel, slugify } from '../../shared/seo';
import { AdminToastService } from '../toast.service';

@Component({
  selector: 'app-admin-news-list',
  imports: [FormsModule, RouterLink, DatePipe],
  template: `
    <div class="adm-head">
      <h1>Tin tức</h1>
      <a class="btn primary small" routerLink="/admin/tin-tuc/moi">+ Viết bài mới</a>
      <button class="btn ghost small" type="button" (click)="sitemapHelp.set(!sitemapHelp())">🗺 Sitemap</button>
    </div>

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
      <span class="spacer"></span>
      <input type="search" placeholder="Tìm bài viết..." [ngModel]="search()" (ngModelChange)="search.set($event)" />
    </div>

    <div class="adm-table-wrap">
      <table class="adm-table">
        <thead>
          <tr>
            <th style="width: 64px">Ảnh</th>
            <th>Tiêu đề</th>
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
            <tr><td colspan="5" class="empty">Không có bài viết nào.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    .sitemap p { margin: 0 0 6px; }
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
    return this.service
      .posts()
      .filter((n) => (tab === 'all' || n.status === tab) && (!term || n.title.toLowerCase().includes(term)));
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

import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { buildPageSchema } from '../../core/page-seo.service';
import { EMPTY_SEO } from '../../models/news';
import { productPath, productSeoOf } from '../../models/product';
import { DEFAULT_SITE_SEO, OrgType, PageSchemaType, PageSeo, SEO_PAGES, SiteSeo, pageSeoOf, siteSeoOf } from '../../models/site-seo';
import { NewsService } from '../../services/news.service';
import { OrderApiService } from '../../services/order-api.service';
import { ProductService } from '../../services/product.service';
import { SettingsService } from '../../services/settings.service';
import { IconComponent, IconPickerComponent } from '../../shared/icon';
import { fileToResizedDataUrl } from '../../shared/image-utils';
import { SEO_LIMITS, analyzePageSeo, analyzeProductSeo, analyzeSeo, scoreLevel, slugify } from '../../shared/seo';
import { AdminToastService } from '../toast.service';
import { autoNewsSeo, autoPageSeo, autoProductSeo } from '../../shared/seo-auto';

type Tab = 'overview' | 'pages' | 'products' | 'news' | 'general';

/**
 * Admin → Khai báo: giao diện kiểu Rank Math để khai báo web lên Google.
 *  - Trang (menu khách): từ khoá, tiêu đề / mô tả, robots, canonical, ảnh chia sẻ, loại schema + điểm SEO.
 *  - Sản phẩm / Bài viết: bảng điểm SEO, bấm để sang khai báo chi tiết của từng mục.
 *  - Khai báo chung: favicon, ảnh chia sẻ mặc định, tổ chức (Organization / Store), ô tìm kiếm, sitemap.
 */
@Component({
  selector: 'app-admin-seo-hub',
  imports: [FormsModule, RouterLink, IconComponent, IconPickerComponent],
  template: `
    <div class="adm-head">
      <h1>🔍 Khai báo SEO</h1>
      <div class="head-actions">
        <button class="btn ghost small auto-btn" type="button" (click)="autoOpen.set(!autoOpen())" [attr.aria-expanded]="autoOpen()">⚡ Tự động khai báo</button>
        <a class="btn ghost small" [href]="origin + '/sitemap.xml'" target="_blank" rel="noopener">sitemap.xml ↗</a>
        <button class="btn ghost small" type="button" [disabled]="!dirty()" (click)="revert()">Huỷ thay đổi</button>
        <button class="btn primary small" type="button" [disabled]="!dirty() || saving()" (click)="save()">{{ saving() ? 'Đang lưu…' : 'Lưu khai báo' }}</button>
      </div>
    </div>

    @if (autoOpen()) {
      @let pv = autoPreview();
      <section class="adm-box auto-box">
        <h2>⚡ Tự động khai báo SEO & schema</h2>
        <div class="box-body">
          <p class="hint">Tự điền <b>từ khoá chính, tiêu đề SEO, mô tả meta</b> và bật <b>schema</b> (Product cho sản phẩm, NewsArticle cho bài viết,
            WebPage / CollectionPage / AboutPage / ContactPage cho từng trang) dựa trên tên, mô tả, nội dung có sẵn.
            Mặc định <b>chỉ điền ô đang trống</b> — không đụng tới nội dung bạn đã viết.</p>
          <div class="auto-opts">
            <label class="check"><input type="checkbox" [ngModel]="autoPages()" (ngModelChange)="autoPages.set($event)" /> 🧭 Trang menu <small>({{ pv.pages }} trang sẽ được điền)</small></label>
            <label class="check"><input type="checkbox" [ngModel]="autoProducts()" (ngModelChange)="autoProducts.set($event)" /> 🧸 Sản phẩm <small>({{ pv.products }} sản phẩm)</small></label>
            <label class="check"><input type="checkbox" [ngModel]="autoNews()" (ngModelChange)="autoNews.set($event)" /> 📰 Bài viết <small>({{ pv.news }} bài)</small></label>
            <label class="check warn"><input type="checkbox" [ngModel]="autoOverwrite()" (ngModelChange)="autoOverwrite.set($event)" /> Ghi đè cả ô đã có nội dung</label>
          </div>
          <div class="row">
            <button class="btn primary small" type="button" [disabled]="autoBusy() || !(pv.pages + pv.products + pv.news)" (click)="runAuto()">
              {{ autoBusy() ? 'Đang khai báo…' : '⚡ Khai báo ' + (pv.pages + pv.products + pv.news) + ' mục' }}
            </button>
            <button class="btn ghost small" type="button" (click)="autoOpen.set(false)">Đóng</button>
          </div>
        </div>
      </section>
    }

    <nav class="adm-tabs">
      @for (t of tabs; track t.id) {
        <button type="button" [class.on]="tab() === t.id" (click)="go(t.id)">{{ t.label }}</button>
      }
    </nav>

    @switch (tab()) {
      <!-- ============ TỔNG QUAN ============ -->
      @case ('overview') {
        <div class="cards">
          <button type="button" class="stat" (click)="go('pages')">
            <span class="big" [class]="'big ' + lvl(pagesAvg())">{{ pagesAvg() }}</span><b>Trang trên menu</b><small>{{ pageRows().length }} trang · {{ pagesDone() }} đã khai báo</small>
          </button>
          <button type="button" class="stat" (click)="go('products')">
            <span class="big" [class]="'big ' + lvl(productsAvg())">{{ productsAvg() }}</span><b>Sản phẩm</b><small>{{ productRows().length }} sản phẩm · {{ productsNoKw() }} chưa có từ khoá</small>
          </button>
          <button type="button" class="stat" (click)="go('news')">
            <span class="big" [class]="'big ' + lvl(newsAvg())">{{ newsAvg() }}</span><b>Bài viết</b><small>{{ newsRows().length }} bài đã đăng · {{ newsNoKw() }} chưa có từ khoá</small>
          </button>
          <button type="button" class="stat" (click)="go('general')">
            <span class="big ico"><app-icon [icon]="d().favicon || '🧸'" /></span><b>Khai báo chung</b><small>Favicon, tổ chức, ảnh chia sẻ</small>
          </button>
        </div>

        <section class="adm-box">
          <h2>📋 Việc nên làm</h2>
          <div class="box-body">
            @if (todo().length) {
              <ul class="todo">
                @for (t of todo(); track t.text) {
                  <li [class]="t.level"><span class="dot">{{ t.level === 'warn' ? '!' : '✕' }}</span>
                    <span>{{ t.text }}</span>
                    @if (t.link) { <a [routerLink]="t.link" [queryParams]="t.query ?? null">Sửa →</a> } @else if (t.tab) { <button type="button" class="lnk" (click)="go(t.tab, t.page)">Sửa →</button> }
                  </li>
                }
              </ul>
            } @else {
              <p class="good">🎉 Mọi thứ đã khai báo khá tốt!</p>
            }
          </div>
        </section>

        <section class="adm-box">
          <h2>🌐 Đưa web lên Google</h2>
          <div class="box-body steps">
            <ol>
              <li>Xác minh web ở <a href="https://search.google.com/search-console" target="_blank" rel="noopener">Google Search Console ↗</a> (đã có file xác minh trong web).</li>
              <li>Vào <b>Sitemaps</b> → nhập <code>sitemap.xml</code> → Gửi. Sitemap <b>tự cập nhật</b> theo sản phẩm, bài viết và khai báo noindex ở đây.</li>
              <li>Trang mới / vừa sửa: dán link vào ô <b>Kiểm tra URL</b> trên Search Console → <b>Yêu cầu lập chỉ mục</b> để Google ghé sớm.</li>
            </ol>
            <div class="row">
              <a class="btn ghost small" [href]="origin + '/sitemap.xml'" target="_blank" rel="noopener">Xem sitemap.xml ↗</a>
              <a class="btn ghost small" [href]="origin + '/robots.txt'" target="_blank" rel="noopener">Xem robots.txt ↗</a>
              <a class="btn ghost small" [href]="'https://search.google.com/test/rich-results?url=' + enc(origin + '/')" target="_blank" rel="noopener">Kiểm tra dữ liệu có cấu trúc ↗</a>
            </div>
          </div>
        </section>

        <section class="adm-box">
          <h2>✅ Kiểm tra SEO kỹ thuật</h2>
          <div class="box-body">
            <ul class="tech">
              @for (t of techChecks; track t.name) {
                <li><span class="tk">✓</span><b>{{ t.name }}</b><span>{{ t.text }}</span></li>
              }
              <li class="warn-li"><span class="tk w">!</span><b>Wayback</b>
                <span>Lưu bản chụp web lên Internet Archive (lịch sử tên miền).
                  <a [href]="'https://web.archive.org/save/' + origin + '/'" target="_blank" rel="noopener">📸 Lưu bản chụp ngay ↗</a> ·
                  <a [href]="'https://web.archive.org/web/*/' + host + '*'" target="_blank" rel="noopener">Xem lịch sử ↗</a></span></li>
              <li class="warn-li"><span class="tk w">!</span><b>Core Web Vitals</b>
                <span>Đo tốc độ thật trên điện thoại:
                  <a [href]="'https://pagespeed.web.dev/analysis?url=' + enc(origin + '/')" target="_blank" rel="noopener">PageSpeed Insights ↗</a></span></li>
            </ul>
          </div>
        </section>
      }

      <!-- ============ TRANG (MENU) ============ -->
      @case ('pages') {
        <div class="split">
          <aside class="page-list adm-box">
            <h2>Trang trên menu khách</h2>
            <ul>
              @for (r of pageRows(); track r.def.path) {
                <li><button type="button" [class.on]="r.def.path === pagePath()" (click)="pagePath.set(r.def.path)">
                  <span class="pi">{{ r.def.icon }}</span>
                  <span class="pn"><b>{{ r.def.label }}</b><small>{{ r.def.path }}</small></span>
                  @if (r.seo.noindex) { <span class="ni" title="noindex">🚫</span> }
                  <span [class]="'score sm ' + lvl(r.report.score)">{{ r.report.score }}</span>
                </button></li>
              }
            </ul>
          </aside>

          @let cur = curPage();
          @let r = cur.report;
          <section class="adm-box seo">
            <div class="box-title seo-head">
              <span>{{ cur.def.icon }} {{ cur.def.label }} <a class="view" [href]="origin + cur.def.path" target="_blank" rel="noopener">Xem trang ↗</a></span>
              <span [class]="'score ' + lvl(r.score)">{{ r.score }}/100</span>
            </div>
            <div class="box-body">
              <div class="serp" aria-label="Xem trước trên Google">
                <small class="serp-url">{{ origin }}{{ cur.def.path === '/' ? '' : ' › ' + cur.def.path.slice(1) }}</small>
                <div class="serp-title">{{ cur.title }}</div>
                <div class="serp-desc">{{ cur.description || 'Chưa có mô tả — Google sẽ tự lấy một đoạn trên trang.' }}</div>
              </div>

              <div class="field">
                <label for="pg-kw">Từ khoá chính</label>
                <input id="pg-kw" maxlength="80" [ngModel]="cur.seo.focusKeyword" (ngModelChange)="setPage('focusKeyword', $event)" placeholder="VD: fumo chính hãng" />
              </div>
              <div class="field">
                <label for="pg-title">Tiêu đề SEO <span class="counter" [class.over]="cur.title.length > limits.title">{{ cur.title.length }}/{{ limits.title }}</span></label>
                <input id="pg-title" maxlength="120" [ngModel]="cur.seo.title" (ngModelChange)="setPage('title', $event)" [placeholder]="cur.autoTitle" />
                <div class="meter"><i [style.width.%]="(cur.title.length / limits.title) * 100" [class.over]="cur.title.length > limits.title"></i></div>
              </div>
              <div class="field">
                <label for="pg-desc">Mô tả meta <span class="counter" [class.over]="cur.description.length > limits.description">{{ cur.description.length }}/{{ limits.description }}</span></label>
                <textarea id="pg-desc" rows="3" maxlength="300" [ngModel]="cur.seo.description" (ngModelChange)="setPage('description', $event)" [placeholder]="cur.def.hint"></textarea>
                <div class="meter"><i [style.width.%]="(cur.description.length / limits.description) * 100"></i></div>
              </div>
              <ul class="checks">
                @for (c of r.checks; track c.text) {
                  <li [class]="c.level"><span class="dot">{{ c.level === 'ok' ? '✓' : c.level === 'warn' ? '!' : '✕' }}</span>{{ c.text }}</li>
                }
              </ul>

              <details class="adv" open>
                <summary>Nâng cao · Chia sẻ · Schema</summary>
                <div class="field">
                  <span class="label">Robots meta</span>
                  <label class="check"><input type="checkbox" [ngModel]="cur.seo.noindex" (ngModelChange)="setPage('noindex', $event)" /> <b>noindex</b> — không cho Google hiển thị trang này</label>
                  <label class="check"><input type="checkbox" [ngModel]="cur.seo.nofollow" (ngModelChange)="setPage('nofollow', $event)" /> <b>nofollow</b> — không theo các liên kết trên trang</label>
                </div>
                <div class="field">
                  <label for="pg-can">URL chuẩn (canonical)</label>
                  <input id="pg-can" type="url" [ngModel]="cur.seo.canonical" (ngModelChange)="setPage('canonical', $event)" [placeholder]="origin + cur.def.path" />
                </div>
                <div class="field">
                  <span class="label">Ảnh chia sẻ (Facebook, Zalo, Messenger) — 1200×630</span>
                  <div class="img-row">
                    @if (cur.seo.ogImage || d().defaultOgImage) { <img class="og-thumb" [src]="cur.seo.ogImage || d().defaultOgImage" alt="" /> }
                    <label class="btn ghost small">{{ uploading() === 'page' ? 'Đang tải…' : '⬆ Tải ảnh' }}
                      <input type="file" accept="image/*" hidden (change)="uploadOg($event, 'page')" /></label>
                    <input class="grow" type="url" [ngModel]="cur.seo.ogImage" (ngModelChange)="setPage('ogImage', $event)" placeholder="hoặc dán link ảnh https://… (trống = ảnh mặc định)" />
                  </div>
                </div>
                <div class="field">
                  <label for="pg-schema">Loại schema</label>
                  <select id="pg-schema" [ngModel]="cur.seo.schemaType" (ngModelChange)="setPage('schemaType', $event)">
                    @for (t of schemaTypes; track t.value) { <option [value]="t.value">{{ t.label }}</option> }
                  </select>
                  @if (cur.def.path === '/') { <small class="hint">Trang chủ khai báo thêm <b>Tổ chức</b> và <b>WebSite</b> (ô tìm kiếm) — chỉnh ở tab Khai báo chung.</small> }
                </div>
                <pre class="jsonld">{{ cur.schema }}</pre>
              </details>
            </div>
          </section>
        </div>
      }

      <!-- ============ SẢN PHẨM ============ -->
      @case ('products') {
        <div class="filters">
          <input class="search" [ngModel]="q()" (ngModelChange)="q.set($event)" placeholder="Tìm sản phẩm…" />
          <label class="check"><input type="checkbox" [ngModel]="onlyIssues()" (ngModelChange)="onlyIssues.set($event)" /> Chỉ hiện mục dưới 80 điểm</label>
          <a class="btn ghost small" routerLink="/admin/san-pham">Quản lý sản phẩm →</a>
        </div>
        <table class="adm-table">
          <thead><tr><th>Điểm</th><th>Sản phẩm</th><th>Từ khoá chính</th><th>Khai báo</th><th></th></tr></thead>
          <tbody>
            @for (r of shownProducts(); track r.id) {
              <tr>
                <td><span [class]="'score sm ' + lvl(r.score)">{{ r.score }}</span></td>
                <td class="name">@if (r.img) { <img [src]="r.img" alt="" /> }<span><b>{{ r.name }}</b><small>{{ r.path }}</small></span></td>
                <td>{{ r.kw || '—' }}</td>
                <td class="flags">
                  @if (r.noindex) { <span class="flag bad">noindex</span> }
                  @if (r.productSchema) { <span class="flag">Product</span> }
                  @if (r.article) { <span class="flag">{{ r.article }}</span> }
                  @if (r.hidden) { <span class="flag muted">đang ẩn</span> }
                </td>
                <td><a class="btn ghost small" [routerLink]="['/admin/san-pham', r.id]" [queryParams]="{ seo: 1 }">Khai báo →</a></td>
              </tr>
            } @empty { <tr><td colspan="5" class="empty">Không có sản phẩm phù hợp.</td></tr> }
          </tbody>
        </table>
      }

      <!-- ============ BÀI VIẾT ============ -->
      @case ('news') {
        <div class="filters">
          <input class="search" [ngModel]="q()" (ngModelChange)="q.set($event)" placeholder="Tìm bài viết…" />
          <label class="check"><input type="checkbox" [ngModel]="onlyIssues()" (ngModelChange)="onlyIssues.set($event)" /> Chỉ hiện mục dưới 80 điểm</label>
          <a class="btn ghost small" routerLink="/admin/tin-tuc/moi">✍️ Viết bài mới</a>
        </div>
        <table class="adm-table">
          <thead><tr><th>Điểm</th><th>Bài viết</th><th>Từ khoá chính</th><th>Khai báo</th><th></th></tr></thead>
          <tbody>
            @for (r of shownNews(); track r.id) {
              <tr>
                <td><span [class]="'score sm ' + lvl(r.score)">{{ r.score }}</span></td>
                <td class="name">@if (r.img) { <img [src]="r.img" alt="" /> }<span><b>{{ r.name }}</b><small>{{ r.path }}</small></span></td>
                <td>{{ r.kw || '—' }}</td>
                <td class="flags">
                  <span class="flag">{{ r.schema }}</span>
                  @if (r.noindex) { <span class="flag bad">noindex</span> }
                  @if (r.draft) { <span class="flag muted">nháp</span> }
                  @if (r.html) { <span class="flag">HTML</span> }
                </td>
                <td><a class="btn ghost small" [routerLink]="['/admin/tin-tuc', r.id]" [queryParams]="{ seo: 1 }">Khai báo →</a></td>
              </tr>
            } @empty { <tr><td colspan="5" class="empty">Không có bài viết phù hợp.</td></tr> }
          </tbody>
        </table>
      }

      <!-- ============ KHAI BÁO CHUNG ============ -->
      @case ('general') {
        <div class="grid2">
          <section class="adm-box">
            <h2>🖼 Favicon & ảnh chia sẻ</h2>
            <div class="box-body">
              <div class="field">
                <span class="label">Favicon (biểu tượng trên tab trình duyệt / kết quả Google)</span>
                <div class="img-row">
                  <app-icon-picker label="Favicon" [ngModel]="d().favicon" (ngModelChange)="set('favicon', $event)" />
                  <span class="fav-prev"><span class="tab"><app-icon [icon]="d().favicon || '🧸'" /> {{ shopName }}</span></span>
                </div>
                <small class="hint">Tải ảnh PNG vuông (tự cắt vuông, 128×128) hoặc chọn emoji. Trống = favicon mặc định của web.
                  Google cần vài ngày để cập nhật favicon trên kết quả tìm kiếm.</small>
              </div>
              <div class="field">
                <span class="label">Ảnh chia sẻ mặc định (1200×630)</span>
                <div class="img-row">
                  <img class="og-thumb" [src]="d().defaultOgImage || 'og/og-default.jpg'" alt="" />
                  <label class="btn ghost small">{{ uploading() === 'default' ? 'Đang tải…' : '⬆ Tải ảnh' }}
                    <input type="file" accept="image/*" hidden (change)="uploadOg($event, 'default')" /></label>
                  <input class="grow" type="url" [ngModel]="d().defaultOgImage" (ngModelChange)="set('defaultOgImage', $event)" placeholder="trống = og/og-default.jpg" />
                </div>
              </div>
              <div class="field">
                <label for="g-desc">Mô tả mặc định (trang chưa khai báo)</label>
                <textarea id="g-desc" rows="2" maxlength="300" [ngModel]="d().defaultDescription" (ngModelChange)="set('defaultDescription', $event)"
                  placeholder="VD: Fumo Mai Nga — thú bông fumo chính hãng, móc khoá, figure..."></textarea>
              </div>
              <div class="field">
                <label for="g-sep">Ký tự ngăn tiêu đề</label>
                <select id="g-sep" [ngModel]="d().titleSep" (ngModelChange)="set('titleSep', $event)">
                  @for (s of seps; track s) { <option [value]="s">Sản phẩm {{ s }} {{ shopName }}</option> }
                </select>
              </div>
            </div>
          </section>

          <section class="adm-box">
            <h2>🏪 Tổ chức / Cửa hàng (Knowledge Graph)</h2>
            <div class="box-body">
              <div class="field">
                <label for="g-type">Loại</label>
                <select id="g-type" [ngModel]="d().orgType" (ngModelChange)="set('orgType', $event)">
                  @for (t of orgTypes; track t.value) { <option [value]="t.value">{{ t.label }}</option> }
                </select>
              </div>
              <div class="field">
                <label for="g-name">Tên hiển thị trên Google</label>
                <input id="g-name" maxlength="80" [ngModel]="d().orgName" (ngModelChange)="set('orgName', $event)" [placeholder]="shopName" />
              </div>
              <div class="field">
                <span class="label">Logo (ảnh vuông ≥ 112px)</span>
                <app-icon-picker label="Logo" [ngModel]="d().orgLogo" (ngModelChange)="set('orgLogo', $event)" />
              </div>
              <div class="field">
                <label for="g-odesc">Giới thiệu ngắn</label>
                <textarea id="g-odesc" rows="2" maxlength="300" [ngModel]="d().orgDescription" (ngModelChange)="set('orgDescription', $event)"></textarea>
              </div>
              @if (d().orgType !== 'Organization') {
                <div class="field">
                  <label for="g-price">Khoảng giá</label>
                  <input id="g-price" maxlength="60" [ngModel]="d().priceRange" (ngModelChange)="set('priceRange', $event)" placeholder="VD: 100.000₫ – 2.000.000₫" />
                </div>
              }
              <div class="field">
                <label for="g-same">Mạng xã hội khác (mỗi dòng 1 link)</label>
                <textarea id="g-same" rows="3" [ngModel]="d().sameAs" (ngModelChange)="set('sameAs', $event)" placeholder="https://www.instagram.com/...&#10;https://www.youtube.com/@..."></textarea>
                <small class="hint">Facebook / TikTok / Shopee, số điện thoại, email, địa chỉ lấy sẵn từ <a routerLink="/admin/cai-dat">Cài đặt</a>.</small>
              </div>
              <label class="check"><input type="checkbox" [ngModel]="d().searchBox" (ngModelChange)="set('searchBox', $event)" />
                Khai báo ô tìm kiếm sản phẩm (Sitelinks search box)</label>
              <label class="check"><input type="checkbox" [ngModel]="d().autoFill" (ngModelChange)="set('autoFill', $event)" />
                ⚡ Tự động khai báo SEO & schema khi đăng / lưu sản phẩm, bài viết (chỉ điền ô trống)</label>
            </div>
          </section>
        </div>
      }
    }
  `,
  styles: `
    .head-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .auto-btn { border-color: #dba617; color: #8a5a00; font-weight: 800; }
    .auto-box { border-color: #dba617; margin-bottom: 14px; }
    .auto-box .box-body { display: grid; gap: 10px; }
    .auto-opts { display: grid; gap: 6px; }
    .auto-opts small { color: #646970; }
    .check.warn { color: #b32d2e; }
    .adm-tabs { margin-bottom: 14px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-bottom: 14px; }
    .stat { display: grid; gap: 2px; text-align: left; padding: 14px; border-radius: 12px; border: 1px solid #dcdcde; background: #fff; cursor: pointer; font: inherit; }
    .stat:hover { border-color: #2271b1; }
    .stat small { color: #646970; }
    .big { font-size: 1.8rem; font-weight: 900; line-height: 1.1; }
    .big.ok { color: #00a32a; } .big.warn { color: #b26200; } .big.bad { color: #d63638; } .big.ico { font-size: 1.6rem; }
    .todo { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; font-size: .9rem; }
    .todo li { display: flex; gap: 8px; align-items: center; }
    .todo li > span:nth-child(2) { flex: 1; }
    .lnk { border: 0; background: none; color: #2271b1; cursor: pointer; font: inherit; padding: 0; }
    .good { margin: 0; font-weight: 700; color: #00a32a; }
    .tech { list-style: none; margin: 0; padding: 0; display: grid; gap: 7px; font-size: .88rem; }
    .tech li { display: grid; grid-template-columns: 20px 130px 1fr; gap: 8px; align-items: start; }
    .tk { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; font-size: .7rem; font-weight: 900; color: #fff; background: #00a32a; }
    .tk.w { background: #dba617; }
    @media (max-width: 600px) { .tech li { grid-template-columns: 20px 1fr; } .tech li > span:last-child { grid-column: 2; } }
    .steps ol { margin: 0 0 10px; padding-left: 20px; display: grid; gap: 6px; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; }
    .split { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 14px; align-items: start; }
    .page-list ul { list-style: none; margin: 0; padding: 6px; display: grid; gap: 2px; }
    .page-list button { width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px; border: 0; border-radius: 8px; background: none; cursor: pointer; text-align: left; font: inherit; }
    .page-list button:hover { background: #f0f0f1; }
    .page-list button.on { background: #e7f1fa; box-shadow: inset 3px 0 0 #2271b1; }
    .pi { font-size: 1.1rem; }
    .pn { flex: 1; display: grid; min-width: 0; }
    .pn small { color: #646970; font-size: .72rem; }
    .ni { font-size: .8rem; }
    .view { font-size: .8rem; font-weight: 600; margin-left: 8px; }
    .seo-head { display: flex; justify-content: space-between; align-items: center; font-weight: 800; }
    .score { font-size: .85rem; padding: 3px 12px; border-radius: 999px; border: 1.5px solid currentColor; font-weight: 800; white-space: nowrap; }
    .score.sm { font-size: .75rem; padding: 1px 8px; min-width: 34px; text-align: center; display: inline-block; }
    .score.ok { background: #00a32a; border-color: #00a32a; color: #fff; } .score.warn { color: #b26200; } .score.bad { color: #d63638; }
    .seo .box-body { display: flex; flex-direction: column; gap: 12px; }
    .serp { font-family: Arial, sans-serif; border: 1px solid #dcdcde; border-radius: 10px; padding: 12px 14px; background: #fff; }
    .serp-url { color: #4d5156; font-size: .8rem; word-break: break-all; }
    .serp-title { color: #1a0dab; font-size: 1.15rem; line-height: 1.3; margin: 4px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .serp-desc { color: #4d5156; font-size: .875rem; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .field { display: grid; gap: 4px; }
    .field label:not(.check), .label { display: flex; justify-content: space-between; gap: 8px; font-weight: 700; font-size: .9rem; }
    .counter { font-weight: 600; color: #646970; font-size: .8rem; } .counter.over { color: #d63638; }
    .meter { height: 4px; border-radius: 4px; background: #f0f0f1; overflow: hidden; }
    .meter i { display: block; height: 100%; max-width: 100%; background: #2271b1; transition: width .2s; } .meter i.over { background: #d63638; }
    .checks { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; font-size: .875rem; }
    .checks li, .todo li { align-items: flex-start; }
    .checks li { display: flex; gap: 8px; }
    .dot { flex: none; width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; font-size: .7rem; font-weight: 900; color: #fff; }
    .ok .dot { background: #00a32a; } .warn .dot { background: #dba617; } .bad .dot { background: #d63638; }
    .adv { border-top: 1px solid #f0f0f1; padding-top: 10px; display: grid; gap: 12px; }
    .adv > summary { cursor: pointer; font-weight: 800; margin-bottom: 8px; }
    .adv[open] { display: flex; flex-direction: column; gap: 12px; }
    .check { display: flex; gap: 6px; align-items: center; font-size: .88rem; }
    .img-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .grow { flex: 1 1 200px; min-width: 0; }
    .og-thumb { width: 120px; aspect-ratio: 1.91 / 1; object-fit: cover; border-radius: 6px; border: 1px solid #dcdcde; }
    .jsonld { margin: 0; max-height: 280px; overflow: auto; font: .75rem/1.5 ui-monospace, Consolas, monospace; background: #1d2327; color: #e6e6e6; padding: 10px; border-radius: 8px; }
    .hint { color: #646970; font-size: .8rem; }
    .filters { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
    .search { flex: 1 1 220px; max-width: 320px; }
    .name { display: flex; gap: 8px; align-items: center; }
    .name img { width: 40px; height: 40px; object-fit: cover; border-radius: 6px; flex: none; }
    .name span { display: grid; min-width: 0; } .name small { color: #646970; font-size: .72rem; }
    .flags { display: flex; gap: 4px; flex-wrap: wrap; }
    .flag { font-size: .7rem; font-weight: 700; padding: 1px 7px; border-radius: 999px; background: #e7f1fa; color: #2271b1; }
    .flag.bad { background: #fcf0f1; color: #d63638; } .flag.muted { background: #f0f0f1; color: #646970; }
    .empty { text-align: center; color: #646970; padding: 20px; }
    .grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; align-items: start; }
    .grid2 .box-body { display: grid; gap: 12px; }
    .fav-prev .tab { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px 8px 0 0; background: #f0f0f1; font-size: .82rem; border: 1px solid #dcdcde; border-bottom: 0; }
    @media (max-width: 860px) { .split { grid-template-columns: 1fr; } .page-list ul { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); } }
  `,
})
export class AdminSeoHub {
  private readonly settingsSvc = inject(SettingsService);
  private readonly toast = inject(AdminToastService);
  private readonly router = inject(Router);
  private readonly api = inject(OrderApiService);
  private readonly products = inject(ProductService);
  private readonly news = inject(NewsService);
  readonly origin = location.origin;
  readonly limits = SEO_LIMITS;
  readonly enc = encodeURIComponent;
  readonly lvl = scoreLevel;

  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: '📊 Tổng quan' },
    { id: 'pages', label: '🧭 Trang (menu)' },
    { id: 'products', label: '🧸 Sản phẩm' },
    { id: 'news', label: '📰 Bài viết' },
    { id: 'general', label: '⚙️ Khai báo chung' },
  ];
  readonly schemaTypes: { value: PageSchemaType; label: string }[] = [
    { value: 'WebPage', label: 'WebPage — Trang thường' },
    { value: 'CollectionPage', label: 'CollectionPage — Trang danh sách' },
    { value: 'AboutPage', label: 'AboutPage — Giới thiệu' },
    { value: 'ContactPage', label: 'ContactPage — Liên hệ' },
    { value: 'FAQPage', label: 'FAQPage — Hỏi đáp' },
  ];
  readonly orgTypes: { value: OrgType; label: string }[] = [
    { value: 'OnlineStore', label: 'Cửa hàng online (OnlineStore)' },
    { value: 'Store', label: 'Cửa hàng (Store)' },
    { value: 'LocalBusiness', label: 'Cửa hàng có địa chỉ (LocalBusiness)' },
    { value: 'Organization', label: 'Tổ chức (Organization)' },
  ];
  readonly seps = ['—', '–', '-', '|', '•', '·', '»', '/'];
  readonly host = location.host;
  /** Các mục SEO kỹ thuật web đã làm sẵn (hiển thị ở Tổng quan). */
  readonly techChecks = [
    { name: 'Title & Meta', text: 'Mọi trang có tiêu đề + mô tả riêng (khai báo ở đây, sản phẩm, bài viết).' },
    { name: 'Heading', text: 'Mỗi trang đúng 1 thẻ H1; H1 trong bài viết HTML tự hạ thành H2.' },
    { name: 'Canonical', text: 'Mọi trang có URL chuẩn; trang danh mục giữ ?danhMuc; tên miền vercel.app chuyển về www.fumomainga.io.vn.' },
    { name: 'Robots.txt', text: 'Tự tạo, chặn /admin, /api, giỏ hàng, tra cứu đơn; có đường dẫn sitemap.' },
    { name: 'Sitemap', text: 'Tự cập nhật: trang chính, danh mục, sản phẩm (kèm ảnh), bài viết, minigame; bỏ mục ẩn / nháp / noindex.' },
    { name: 'Schema', text: 'Product / Offer, Article / Review, Breadcrumb, WebPage, Organization / Store, WebSite (ô tìm kiếm).' },
    { name: 'Open Graph', text: 'Thẻ chia sẻ cho Facebook / Zalo / Messenger (máy chủ trả riêng cho bot) + Twitter Card.' },
    { name: 'Ảnh ALT', text: 'Ảnh nội dung có mô tả (tên sản phẩm / tiêu đề); ảnh trang trí để alt rỗng đúng chuẩn.' },
    { name: 'HTTPS', text: 'Tự chuyển http → https (308), chứng chỉ Vercel.' },
    { name: 'Cache / HSTS', text: 'HSTS 2 năm, JS/CSS lưu đệm 1 năm, ảnh 7 ngày; thêm nosniff, Referrer-Policy, X-Frame-Options.' },
  ];

  private readonly qp = inject(ActivatedRoute).snapshot.queryParamMap;
  readonly tab = signal<Tab>((this.tabs.some((t) => t.id === this.qp.get('tab')) ? this.qp.get('tab') : 'overview') as Tab);
  readonly pagePath = signal(SEO_PAGES.some((p) => p.path === this.qp.get('trang')) ? this.qp.get('trang')! : '/');
  readonly q = signal('');
  readonly onlyIssues = signal(false);
  readonly saving = signal(false);
  readonly uploading = signal<'' | 'page' | 'default'>('');

  readonly d = signal<SiteSeo>(siteSeoOf(this.settingsSvc.settings()));
  readonly dirty = computed(() => JSON.stringify(this.d()) !== JSON.stringify(siteSeoOf(this.settingsSvc.settings())));
  get shopName(): string {
    return this.settingsSvc.settings().shopName;
  }

  go(t: Tab, page?: string): void {
    this.tab.set(t);
    if (page) this.pagePath.set(page);
    this.q.set('');
    void this.router.navigate([], { queryParams: { tab: t === 'overview' ? null : t, trang: page ?? null }, replaceUrl: true });
  }

  set<K extends keyof SiteSeo>(k: K, v: SiteSeo[K]): void {
    this.d.update((s) => ({ ...s, [k]: v }));
  }

  setPage<K extends keyof PageSeo>(k: K, v: PageSeo[K]): void {
    const path = this.pagePath();
    this.d.update((s) => ({ ...s, pages: { ...s.pages, [path]: { ...s.pages[path], [k]: v } } }));
  }

  // ---------- Trang ----------
  readonly pageRows = computed(() => {
    const seo = this.d();
    const shop = this.shopName;
    return SEO_PAGES.map((def) => {
      const p = pageSeoOf(seo, def.path);
      const autoTitle = def.path === '/' ? shop : `${def.label} ${seo.titleSep || '—'} ${shop}`;
      const title = p.title.trim() || autoTitle;
      const description = p.description.trim() || seo.defaultDescription.trim();
      const report = analyzePageSeo({ title: p.title.trim() ? title : '', description, focusKeyword: p.focusKeyword, path: def.path, noindex: p.noindex, ogImage: p.ogImage, defaultOgImage: seo.defaultOgImage || 'og/og-default.jpg' });
      return { def, seo: p, title, autoTitle, description, report };
    });
  });
  readonly curPage = computed(() => {
    const row = this.pageRows().find((r) => r.def.path === this.pagePath()) ?? this.pageRows()[0];
    const url = this.origin + (row.def.path === '/' ? '/' : row.def.path);
    const schema = JSON.stringify(
      buildPageSchema({ path: row.def.path, label: row.def.label, title: row.title, description: row.description, url, origin: this.origin, seo: this.d(), settings: this.settingsSvc.settings() }),
      null,
      2,
    );
    return { ...row, schema };
  });
  readonly pagesAvg = computed(() => avg(this.pageRows().map((r) => r.report.score)));
  readonly pagesDone = computed(() => this.pageRows().filter((r) => r.seo.focusKeyword.trim() && r.seo.description.trim()).length);

  // ---------- Sản phẩm ----------
  readonly productRows = computed(() =>
    this.products.products().map((p) => {
      const seo = productSeoOf(p);
      const r = analyzeProductSeo({ name: p.name, description: p.description, images: p.images, tags: p.tags, slug: p.slug || slugify(p.name), seo });
      return {
        id: p.id,
        name: p.name,
        path: productPath(p),
        img: p.images[0] ?? '',
        score: r.score,
        kw: seo.focusKeyword,
        noindex: seo.noindex,
        productSchema: seo.productSchema,
        article: seo.article ? seo.articleType : '',
        hidden: !!p.hidden,
      };
    }),
  );
  readonly shownProducts = computed(() => this.filterRows(this.productRows()));
  readonly productsAvg = computed(() => avg(this.productRows().map((r) => r.score)));
  readonly productsNoKw = computed(() => this.productRows().filter((r) => !r.kw).length);

  // ---------- Bài viết ----------
  readonly newsRows = computed(() =>
    this.news.posts().map((n) => {
      const seo = { ...EMPTY_SEO, ...n.seo };
      const r = analyzeSeo({ ...n, seo }, n.seo?.slug || slugify(n.title));
      return {
        id: n.id,
        name: n.title,
        path: `/tin-tuc/${n.seo?.slug || n.id}`,
        img: n.cover,
        score: r.score,
        kw: seo.focusKeyword,
        noindex: seo.noindex,
        schema: seo.schemaType,
        draft: n.status !== 'published',
        html: n.format === 'html',
      };
    }),
  );
  readonly shownNews = computed(() => this.filterRows(this.newsRows()));
  readonly newsAvg = computed(() => avg(this.newsRows().filter((r) => !r.draft).map((r) => r.score)));
  readonly newsNoKw = computed(() => this.newsRows().filter((r) => !r.draft && !r.kw).length);

  private filterRows<T extends { name: string; score: number; kw: string }>(rows: T[]): T[] {
    const q = this.q().trim().toLowerCase();
    return rows
      .filter((r) => (!q || r.name.toLowerCase().includes(q) || r.kw.toLowerCase().includes(q)) && (!this.onlyIssues() || r.score < 80))
      .sort((a, b) => a.score - b.score);
  }

  /** Danh sách việc nên làm (Tổng quan). */
  readonly todo = computed(() => {
    const out: { level: 'bad' | 'warn'; text: string; tab?: Tab; page?: string; link?: unknown[]; query?: Record<string, unknown> }[] = [];
    const d = this.d();
    if (!d.favicon) out.push({ level: 'warn', text: 'Chưa đặt favicon riêng cho web.', tab: 'general' });
    if (!d.orgLogo) out.push({ level: 'warn', text: 'Chưa có logo tổ chức cho Google (Knowledge Graph).', tab: 'general' });
    for (const r of this.pageRows()) {
      if (r.report.score < 60 && !r.seo.noindex) out.push({ level: r.report.score < 40 ? 'bad' : 'warn', text: `Trang "${r.def.label}" mới đạt ${r.report.score} điểm.`, tab: 'pages', page: r.def.path });
    }
    for (const r of this.productRows().filter((x) => !x.hidden && x.score < 50).slice(0, 5)) {
      out.push({ level: 'bad', text: `Sản phẩm "${r.name}" mới đạt ${r.score} điểm.`, link: ['/admin/san-pham', r.id], query: { seo: 1 } });
    }
    for (const r of this.newsRows().filter((x) => !x.draft && x.score < 50).slice(0, 5)) {
      out.push({ level: 'bad', text: `Bài "${r.name}" mới đạt ${r.score} điểm.`, link: ['/admin/tin-tuc', r.id], query: { seo: 1 } });
    }
    return out;
  });

  // ---------- Tự động khai báo ----------
  readonly autoOpen = signal(false);
  readonly autoPages = signal(true);
  readonly autoProducts = signal(true);
  readonly autoNews = signal(true);
  readonly autoOverwrite = signal(false);
  readonly autoBusy = signal(false);

  /** Kế hoạch tự khai báo: chỉ các mục thực sự thay đổi. */
  private readonly autoPlan = computed(() => {
    const opt = { overwrite: this.autoOverwrite(), shopName: this.shopName };
    const seo = this.d();
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    const pages = this.autoPages()
      ? SEO_PAGES.map((def) => ({ path: def.path, next: autoPageSeo(def, seo, opt) })).filter((x) => !same({ ...pageSeoOf(seo, x.path) }, { ...pageSeoOf({ ...seo, pages: { ...seo.pages, [x.path]: x.next } }, x.path) }))
      : [];
    const products = this.autoProducts()
      ? this.products.products().map((p) => ({ id: p.id, before: productSeoOf(p), next: autoProductSeo(p, opt) })).filter((x) => !same(x.before, x.next))
      : [];
    const news = this.autoNews()
      ? this.news.posts().map((n) => ({ id: n.id, before: { ...EMPTY_SEO, ...n.seo }, next: autoNewsSeo(n, opt) })).filter((x) => !same(x.before, x.next))
      : [];
    return { pages, products, news };
  });
  readonly autoPreview = computed(() => {
    const p = this.autoPlan();
    return { pages: p.pages.length, products: p.products.length, news: p.news.length };
  });

  async runAuto(): Promise<void> {
    const plan = this.autoPlan();
    const total = plan.pages.length + plan.products.length + plan.news.length;
    if (!total) return;
    if (this.autoOverwrite() && !confirm(`Ghi đè khai báo SEO của ${total} mục (kể cả ô bạn đã viết)?`)) return;
    this.autoBusy.set(true);
    try {
      if (plan.products.length) this.products.applyImport(plan.products.map((x) => ({ id: x.id, patch: { seo: x.next } })), []);
      for (const n of plan.news) this.news.update(n.id, { seo: n.next });
      if (plan.pages.length) {
        this.d.update((s) => ({ ...s, pages: { ...s.pages, ...Object.fromEntries(plan.pages.map((x) => [x.path, x.next])) } }));
        await this.save();
      }
      this.toast.ok(`Đã tự động khai báo ${total} mục (sản phẩm & bài viết tự lưu lên máy chủ).`);
      this.autoOpen.set(false);
    } catch (e) {
      this.toast.err('Chưa khai báo được: ' + (e instanceof Error ? e.message : ''));
    } finally {
      this.autoBusy.set(false);
    }
  }

  // ---------- Ảnh ----------
  async uploadOg(e: Event, where: 'page' | 'default'): Promise<void> {
    const el = e.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    this.uploading.set(where);
    try {
      const dataUrl = await fileToResizedDataUrl(file, 1200, 0.85);
      let url = dataUrl;
      try {
        url = (await this.api.call<{ url: string }>('POST', '/api/catalog', { dataUrl }, true, { timeoutMs: 30000 })).url || dataUrl;
      } catch {
        if (dataUrl.length > 200_000) throw new Error('Không tải được ảnh lên máy chủ — hãy dán link ảnh thay thế.');
      }
      if (where === 'page') this.setPage('ogImage', url);
      else this.set('defaultOgImage', url);
    } catch (er) {
      this.toast.err(er instanceof Error ? er.message : 'Không đọc được ảnh.');
    } finally {
      this.uploading.set('');
    }
  }

  // ---------- Lưu ----------
  revert(): void {
    this.d.set(siteSeoOf(this.settingsSvc.settings()));
  }

  async save(): Promise<void> {
    const s = this.d();
    // Bỏ trang chưa khai báo gì, cắt khoảng trắng.
    const pages: SiteSeo['pages'] = {};
    for (const [path, p] of Object.entries(s.pages)) {
      const clean: Partial<PageSeo> = {};
      for (const [k, v] of Object.entries(p ?? {})) {
        const val = typeof v === 'string' ? v.trim() : v;
        if (val !== '' && val !== false && val !== undefined && !(k === 'schemaType' && val === SEO_PAGES.find((x) => x.path === path)?.schema)) {
          (clean as Record<string, unknown>)[k] = val;
        }
      }
      if (Object.keys(clean).length) pages[path] = clean;
    }
    const seo: SiteSeo = { ...DEFAULT_SITE_SEO, ...s, pages };
    for (const k of ['defaultDescription', 'defaultOgImage', 'favicon', 'orgName', 'orgLogo', 'orgDescription', 'priceRange', 'sameAs'] as const) seo[k] = seo[k].trim();
    const next = { ...this.settingsSvc.settings(), seo };
    if (!this.toast.run(() => this.settingsSvc.save(next), 'Đã lưu khai báo')) return;
    this.d.set(siteSeoOf(this.settingsSvc.settings()));
    this.saving.set(true);
    const err = await this.settingsSvc.publish(this.settingsSvc.settings());
    this.saving.set(false);
    if (err) this.toast.err('Đã lưu trên máy này nhưng chưa gửi được lên web cho khách: ' + err);
    else this.toast.ok('Đã cập nhật khai báo cho cả web');
  }
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { newsPath } from '../../models/news';
import { CategoryService } from '../../services/category.service';
import { NewsService } from '../../services/news.service';
import { ApiError, OrderApiService } from '../../services/order-api.service';
import { ProductService } from '../../services/product.service';
import { SettingsService } from '../../services/settings.service';
import { downloadBlob } from '../../shared/download';
import { AdminToastService } from '../toast.service';

interface Knowledge {
  text: string;
  fileName: string;
  updatedAt: number | null;
  source: 'admin' | 'default';
}

interface CatalogInfo {
  syncedAt: number | null;
  products: number;
  inStock: number;
  news: number;
}

const MAX_CHARS = 100_000;

@Component({
  selector: 'app-admin-ai',
  imports: [FormsModule, DatePipe],
  template: `
    <div class="adm-head">
      <h1>Trợ lý AI</h1>
    </div>

    @if (!connected()) {
      @if (loading() && !setup() && !needKey()) {
        <div class="adm-notice">⏳ Đang tải...</div>
      }
      @if (setup()) {
        <section class="adm-box narrow setup">
          <h2>⚙️ Cần cài đặt một lần trên Vercel</h2>
          <div class="box-body">
            <p class="err">{{ setup() }}</p>
            <ol>
              <li><b>Supabase</b> → <b>SQL Editor</b> → <b>New query</b> → dán toàn bộ file <code>supabase/schema.sql</code> trong mã nguồn → <b>Run</b> (tạo bảng khách hàng, đơn hàng, sản phẩm...).</li>
              <li><b>Supabase</b> → <b>Project Settings</b> → <b>API Keys</b> → sao chép khoá <b>service_role</b> (secret). Không dán khoá này vào đâu khác ngoài Vercel.</li>
              <li><b>Vercel</b> → project <b>fumomainga</b> → <b>Settings → Environment Variables</b>, thêm:
                <code>SUPABASE_SERVICE_ROLE_KEY</code> = khoá vừa chép, và <code>ADMIN_API_KEY</code> = <b>mật khẩu đăng nhập admin</b> (đặt giống nhau thì không phải nhập thêm mã).</li>
              <li><b>Deployments</b> → bấm <b>⋯</b> ở bản mới nhất → <b>Redeploy</b>.</li>
            </ol>
            <button class="btn primary small" type="button" [disabled]="loading()" (click)="load()">{{ loading() ? 'Đang kiểm tra...' : '↻ Kiểm tra lại' }}</button>
          </div>
        </section>
      } @else if (needKey()) {
      <section class="adm-box narrow">
        <h2>Kết nối máy chủ</h2>
        <form class="box-body" (ngSubmit)="connect()">
          <p class="hint">
            Kiến thức và dữ liệu của trợ lý AI được lưu trên máy chủ. Nhập <b>mã quản trị</b> (biến môi trường
            <code>ADMIN_API_KEY</code> trên Vercel) — dùng chung với trang Đơn hàng.
          </p>
          <div class="field">
            <label for="ai-key">Mã quản trị</label>
            <input id="ai-key" name="key" type="password" [(ngModel)]="keyInput" autocomplete="off" />
          </div>
          @if (error()) { <p class="err">{{ error() }}</p> }
          <button class="btn primary small" type="submit" [disabled]="loading()">{{ loading() ? 'Đang kết nối...' : 'Kết nối' }}</button>
        </form>
      </section>
      }
    } @else {
      <div class="adm-notice">
        Trợ lý AI chỉ trả lời trong phạm vi website: dựa trên <b>file kiến thức</b> bên dưới và <b>dữ liệu sản phẩm đã đồng bộ</b>
        (giá, còn hàng/hết hàng, rẻ nhất/mắc nhất...). Câu hỏi ngoài phạm vi shop sẽ được từ chối nhẹ nhàng.
      </div>

      <div class="layout">
        <!-- ===== 1. File kiến thức ===== -->
        <section class="adm-box">
          <h2>1. File kiến thức (.md)</h2>
          <div class="box-body">
            <p class="hint">
              Đang dùng:
              @if (knowledge()?.source === 'admin') {
                <b>{{ knowledge()?.fileName }}</b> — tải lên lúc {{ knowledge()?.updatedAt | date: 'HH:mm dd/MM/yyyy' }}
              } @else {
                <b>file mặc định</b> trong mã nguồn (<code>knowledge/kien-thuc.md</code>)
              }
            </p>

            <div class="row-btns">
              <label class="btn primary small">
                ⬆ Tải file .md lên
                <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden (change)="importFile($event)" />
              </label>
              <button class="btn ghost small" type="button" (click)="exportFile()">⬇ Tải về để sửa</button>
              @if (knowledge()?.source === 'admin') {
                <button class="btn ghost small" type="button" (click)="resetDefault()">↺ Dùng lại file mặc định</button>
              }
            </div>

            <div class="field">
              <label for="ai-text">
                Nội dung
                <span class="counter" [class.over]="text.length > max">{{ text.length.toLocaleString('vi-VN') }} / {{ max.toLocaleString('vi-VN') }} ký tự</span>
              </label>
              <textarea id="ai-text" rows="18" [(ngModel)]="text" (ngModelChange)="dirty.set(true)" spellcheck="false"></textarea>
            </div>
            <p class="hint">
              Viết như dặn nhân viên mới: giới thiệu shop, cách đặt hàng, phí ship, đổi trả, câu hỏi thường gặp...
              Giá và tình trạng hàng không cần viết ở đây — AI lấy từ phần đồng bộ sản phẩm bên cạnh.
              Ghi chú dạng <code>&lt;!-- ... --&gt;</code> chỉ dành cho người soạn, AI không đọc.
            </p>
            <div class="row-btns end">
              @if (dirty()) { <span class="unsaved">● Chưa lưu</span> }
              <button class="btn primary small" type="button" [disabled]="saving() || !dirty()" (click)="saveKnowledge()">
                {{ saving() ? 'Đang lưu...' : 'Lưu kiến thức' }}
              </button>
            </div>
          </div>
        </section>

        <!-- ===== 2. Đồng bộ dữ liệu website ===== -->
        <section class="adm-box">
          <h2>2. Dữ liệu website cho AI</h2>
          <div class="box-body">
            <p class="hint">
              Gửi danh sách sản phẩm (tên, danh mục, giá, size, còn hàng, mô tả), danh mục và tin tức đang đăng lên máy chủ
              để AI trả lời các câu như "còn hàng không", "cái nào rẻ nhất", "danh mục X có gì".
            </p>
            <dl class="stats">
              <div><dt>Trên trang admin</dt><dd>{{ local().products }} sản phẩm · {{ local().inStock }} còn hàng · {{ local().news }} tin</dd></div>
              <div>
                <dt>AI đang biết</dt>
                <dd>
                  @if (catalog()?.syncedAt) {
                    {{ catalog()?.products }} sản phẩm · {{ catalog()?.inStock }} còn hàng · {{ catalog()?.news }} tin
                    <small>(đồng bộ {{ catalog()?.syncedAt | date: 'HH:mm dd/MM/yyyy' }})</small>
                  } @else {
                    <span class="warn">Chưa đồng bộ</span>
                  }
                </dd>
              </div>
            </dl>
            @if (outOfDate()) {
              <p class="warn">⚠ Số liệu trên trang admin khác với dữ liệu AI đang biết — hãy đồng bộ lại.</p>
            }
            <button class="btn primary small" type="button" [disabled]="syncing()" (click)="sync()">
              {{ syncing() ? 'Đang đồng bộ...' : '⟳ Đồng bộ dữ liệu cho AI' }}
            </button>
            <p class="hint">Mỗi lần thêm / sửa sản phẩm, đổi giá hoặc tình trạng còn hàng, nhớ bấm đồng bộ lại.</p>
          </div>
        </section>
      </div>
    }
  `,
  styles: `
    .narrow { max-width: 620px; }
    .setup ol { margin: 0; padding-left: 20px; display: grid; gap: 8px; }
    .layout { display: grid; grid-template-columns: 1.5fr 1fr; gap: 20px; align-items: start; }
    .hint { color: #646970; font-size: .85rem; margin: 0; }
    .err, .warn { color: var(--error, #b32d2e); font-weight: 700; margin: 0; }
    .row-btns { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .row-btns.end { justify-content: flex-end; }
    label.btn { cursor: pointer; }
    .field label { display: flex; justify-content: space-between; gap: 8px; }
    .counter { font-weight: 600; color: #646970; font-size: .8rem; }
    .counter.over { color: var(--error, #b32d2e); }
    textarea { font: .85rem/1.6 ui-monospace, Consolas, monospace !important; }
    .unsaved { color: var(--primary-dark); font-weight: 700; font-size: .85rem; }
    .stats { margin: 0; display: grid; gap: 8px; }
    .stats div { padding: 10px 12px; border-radius: 8px; background: #f6f7f7; }
    .stats dt { font-size: .8rem; color: #646970; }
    .stats dd { margin: 2px 0 0; font-weight: 700; }
    .stats small { font-weight: 500; color: #646970; }
    @media (max-width: 1000px) { .layout { grid-template-columns: 1fr; } }
  `,
})
export class AdminAiAssistant {
  private readonly api = inject(OrderApiService);
  private readonly toast = inject(AdminToastService);
  private readonly products = inject(ProductService).products;
  private readonly categories = inject(CategoryService);
  private readonly news = inject(NewsService).published;
  private readonly settings = inject(SettingsService).settings;

  readonly max = MAX_CHARS;
  readonly connected = signal(false);
  /** Thông báo khi máy chủ chưa cấu hình (503). */
  readonly setup = signal('');
  /** Cần nhập mã quản trị (401 hoặc chưa có mã). */
  readonly needKey = signal(false);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly syncing = signal(false);
  readonly error = signal('');
  readonly dirty = signal(false);
  readonly knowledge = signal<Knowledge | null>(null);
  readonly catalog = signal<CatalogInfo | null>(null);
  keyInput = '';
  text = '';
  private fileName = 'kien-thuc.md';

  readonly local = computed(() => ({
    products: this.products().length,
    inStock: this.products().filter((p) => p.inStock).length,
    news: this.news().length,
  }));

  readonly outOfDate = computed(() => {
    const c = this.catalog();
    const l = this.local();
    return !!c?.syncedAt && (c.products !== l.products || c.inStock !== l.inStock || c.news !== l.news);
  });

  constructor() {
    void this.load();
  }

  async connect(): Promise<void> {
    this.api.setAdminKey(this.keyInput);
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [k, c] = await Promise.all([
        this.api.call<Knowledge>('GET', '/api/ai/knowledge', undefined, true),
        this.api.call<CatalogInfo>('GET', '/api/ai/catalog', undefined, true),
      ]);
      this.setKnowledge(k);
      this.catalog.set(c);
      this.connected.set(true);
      this.setup.set('');
      this.needKey.set(false);
    } catch (e) {
      this.connected.set(false);
      const status = e instanceof ApiError ? e.status : 0;
      const msg = e instanceof Error ? e.message : 'Không tải được dữ liệu.';
      this.setup.set(status === 503 || status === 404 ? msg : '');
      this.needKey.set(status === 401);
      this.error.set(status === 401 && this.api.adminKey() ? 'Mã quản trị không đúng — nhập lại giá trị ADMIN_API_KEY đã đặt trên Vercel.' : status === 503 || status === 404 || status === 401 ? '' : msg);
      if (!status) this.needKey.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  async importFile(event: Event): Promise<void> {
    const el = event.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    if (!/\.(md|markdown|txt)$/i.test(file.name)) return this.toast.err('Chỉ nhận file .md (Markdown) hoặc .txt.');
    if (file.size > 400_000) return this.toast.err('File quá lớn (tối đa khoảng 100.000 ký tự).');
    const content = (await file.text()).replace(/^﻿/, '');
    if (content.length > MAX_CHARS) return this.toast.err(`File dài ${content.length.toLocaleString('vi-VN')} ký tự, vượt giới hạn.`);
    this.text = content;
    this.fileName = file.name;
    this.dirty.set(true);
    this.toast.ok(`Đã nạp "${file.name}" — xem lại rồi bấm Lưu kiến thức.`);
  }

  exportFile(): void {
    downloadBlob(new Blob([this.text], { type: 'text/markdown;charset=utf-8' }), this.fileName || 'kien-thuc.md');
  }

  async saveKnowledge(): Promise<void> {
    if (this.text.length > MAX_CHARS) return this.toast.err('Nội dung quá dài.');
    this.saving.set(true);
    try {
      this.setKnowledge(await this.api.call<Knowledge>('PUT', '/api/ai/knowledge', { text: this.text, fileName: this.fileName }, true));
      this.toast.ok('Đã lưu — trợ lý AI dùng kiến thức mới ngay từ câu hỏi tiếp theo.');
    } catch (e) {
      this.toast.err(e instanceof Error ? e.message : 'Không lưu được.');
    } finally {
      this.saving.set(false);
    }
  }

  async resetDefault(): Promise<void> {
    if (!confirm('Bỏ file đã tải lên và dùng lại file kiến thức mặc định trong mã nguồn?')) return;
    try {
      this.setKnowledge(await this.api.call<Knowledge>('DELETE', '/api/ai/knowledge', undefined, true));
      this.toast.ok('Đã chuyển về file kiến thức mặc định.');
    } catch (e) {
      this.toast.err(e instanceof Error ? e.message : 'Không thực hiện được.');
    }
  }

  async sync(): Promise<void> {
    this.syncing.set(true);
    try {
      const fmt = (t: number) => new Date(t).toLocaleDateString('vi-VN');
      const body = {
        shopName: this.settings().shopName,
        products: this.products().map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          price: p.price,
          size: p.size,
          inStock: p.inStock,
          featured: p.featured,
          tags: p.tags,
          description: p.description,
        })),
        categories: this.categories.names(),
        news: this.news().map((n) => ({ title: n.title, excerpt: n.excerpt, path: newsPath(n), date: fmt(n.createdAt) })),
      };
      this.catalog.set(await this.api.call<CatalogInfo>('PUT', '/api/ai/catalog', body, true));
      this.toast.ok('Đã đồng bộ dữ liệu website cho trợ lý AI.');
    } catch (e) {
      this.toast.err(e instanceof Error ? e.message : 'Không đồng bộ được.');
    } finally {
      this.syncing.set(false);
    }
  }

  private setKnowledge(k: Knowledge): void {
    this.knowledge.set(k);
    this.text = k.text;
    this.fileName = k.fileName || 'kien-thuc.md';
    this.dirty.set(false);
  }
}

import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OrderApiService } from '../../services/order-api.service';

interface Manual {
  domain: string;
  domainExpires: string;
  registrar: string;
  renewUrl: string;
  hostingPlan: string;
  hostingExpires: string;
  note: string;
}
interface SystemInfo {
  now: number;
  limits: { db: number; media: number };
  usage: {
    db: { total: number; tables: { name: string; bytes: number; rows: number }[]; kv: { key: string; bytes: number }[] } | null;
    media: { bytes: number; count: number; folders: { name: string; bytes: number; count: number }[] } | null;
    error?: string;
  } | null;
  hosting: {
    provider: string;
    env: string | null;
    region: string | null;
    productionUrl: string | null;
    deploymentUrl: string | null;
    branch: string | null;
    commit: string | null;
    commitMessage: string | null;
    repo: string | null;
    database: string;
    databaseHost: string | null;
  };
  domain: { name: string; expires: string | null; created: string | null; registrar: string | null; source: 'rdap' | 'manual' | null; error?: string } | null;
  manual: Manual;
}
interface Part {
  label: string;
  hint: string;
  bytes: number;
  count?: string;
}

/** Tên dễ hiểu cho bảng dữ liệu / khoá app_kv. */
const TABLE_LABELS: Record<string, [string, string]> = {
  page_views: ['Lượt truy cập', 'Mỗi lần khách mở trang (Thống kê truy cập)'],
  visitors_online: ['Khách đang online', 'Tạm thời, tự dọn'],
  orders: ['Đơn hàng', 'Thông tin đơn'],
  order_items: ['Sản phẩm trong đơn', 'Từng món của mỗi đơn'],
  customers: ['Khách hàng', 'Tên, SĐT, địa chỉ'],
  contacts: ['Lời nhắn', 'Khách gửi từ trang Liên hệ'],
  products: ['Bảng sản phẩm (cho AI / tìm kiếm)', 'Bản sao gọn của sản phẩm'],
  rate_limits: ['Chống spam', 'Đếm lượt gọi theo IP, tự hết hạn'],
  game_stats: ['Thống kê minigame', 'Thời gian chơi mỗi ngày'],
  app_kv: ['Dữ liệu web', 'Sản phẩm, bài viết, cài đặt… (chi tiết bên dưới)'],
};
const KV_LABELS: [RegExp, string, string][] = [
  [/^site:catalog$/, 'Sản phẩm & bài viết', 'Toàn bộ thông tin sản phẩm, tin tức, danh mục'],
  [/^site:settings$/, 'Cài đặt web', 'Giao diện, minigame, SEO, thông báo…'],
  [/^ai:/, 'Trợ lý AI', 'Kiến thức & dữ liệu cho AI'],
  [/^admin:notes$/, 'Ghi chú sản phẩm (admin)', ''],
  [/^admin:costs$/, 'Chi phí / giá nhập', ''],
  [/^admin:/, 'Tài khoản & nhật ký admin', ''],
  [/^security:/, 'Bảo mật', 'Danh sách chặn, sự kiện'],
  [/^minigame:salt:/, 'Mã code minigame', 'Mỗi ngày 1 mục, dọn được'],
  [/^contacts$/, 'Lời nhắn (dạng cũ)', ''],
];
const FOLDER_LABELS: Record<string, string> = { img: 'Ảnh sản phẩm, bài viết, icon', '(gốc)': 'Tệp khác' };

/**
 * Admin → Tổng quan → Lưu trữ & tên miền:
 * dung lượng cơ sở dữ liệu + kho ảnh (bấm để xem từng phần chiếm bao nhiêu MB), hosting, hạn tên miền.
 */
@Component({
  selector: 'app-admin-system',
  imports: [RouterLink],
  template: `
    <div class="adm-head">
      <h1>Lưu trữ & tên miền</h1>
      <button class="btn ghost small" type="button" (click)="load()" [disabled]="loading()">↻ Tải lại</button>
    </div>
    @if (error()) { <div class="adm-notice warn">⚠ {{ error() }}</div> }

    @if (info(); as d) {
      <!-- Dung lượng -->
      <section class="adm-box">
        <h2>💾 Dung lượng lưu trữ</h2>
        <div class="meters">
          @if (d.usage?.db; as db) {
            @let p = pct(db.total, d.limits.db);
            <button type="button" class="meter" [class.on]="open() === 'db'" (click)="toggle('db')" [attr.aria-expanded]="open() === 'db'">
              <span class="m-top"><b>🗄 Cơ sở dữ liệu</b><span>{{ mb(db.total) }} / {{ mb(d.limits.db) }}</span></span>
              <span class="bar" [class]="'bar ' + level(p)"><i [style.width.%]="p > 100 ? 100 : p"></i></span>
              <span class="m-foot">{{ p }}% · Đơn hàng, sản phẩm, thống kê… <u>{{ open() === 'db' ? 'Thu gọn' : 'Xem chi tiết' }}</u></span>
            </button>
          } @else {
            <div class="meter off">
              <span class="m-top"><b>🗄 Cơ sở dữ liệu</b></span>
              <span class="m-foot">{{ d.usage ? 'Chưa đo được chi tiết - chạy lại file supabase/schema.sql trong Supabase → SQL Editor.' : 'Chỉ có khi dùng Supabase.' }}</span>
            </div>
          }
          @if (d.usage?.media; as md) {
            @let p = pct(md.bytes, d.limits.media);
            <button type="button" class="meter" [class.on]="open() === 'media'" (click)="toggle('media')" [attr.aria-expanded]="open() === 'media'">
              <span class="m-top"><b>🖼 Kho ảnh</b><span>{{ mb(md.bytes) }} / {{ mb(d.limits.media) }}</span></span>
              <span class="bar" [class]="'bar ' + level(p)"><i [style.width.%]="p > 100 ? 100 : p"></i></span>
              <span class="m-foot">{{ p }}% · {{ fmt(md.count) }} tệp <u>{{ open() === 'media' ? 'Thu gọn' : 'Xem chi tiết' }}</u></span>
            </button>
          } @else {
            <div class="meter off">
              <span class="m-top"><b>🖼 Kho ảnh</b></span>
              <span class="m-foot">Chưa đọc được kho ảnh.</span>
            </div>
          }
        </div>

        @if (open() === 'db' && dbParts().length) {
          <div class="parts">
            <h3>Cơ sở dữ liệu đang chứa gì</h3>
            <ul>
              @for (x of dbParts(); track x.label) {
                <li>
                  <span class="p-name"><b>{{ x.label }}</b>@if (x.hint) { <small>{{ x.hint }}</small> }</span>
                  <span class="p-bar"><i [style.width.%]="(x.bytes / dbParts()[0].bytes) * 100"></i></span>
                  <span class="p-size">{{ mb(x.bytes) }}@if (x.count) { <small>{{ x.count }}</small> }</span>
                </li>
              }
            </ul>
            @if (kvParts().length) {
              <h3>Trong "Dữ liệu web"</h3>
              <ul>
                @for (x of kvParts(); track x.label) {
                  <li>
                    <span class="p-name"><b>{{ x.label }}</b>@if (x.hint) { <small>{{ x.hint }}</small> }</span>
                    <span class="p-bar"><i [style.width.%]="(x.bytes / kvParts()[0].bytes) * 100"></i></span>
                    <span class="p-size">{{ mb(x.bytes) }}@if (x.count) { <small>{{ x.count }}</small> }</span>
                  </li>
                }
              </ul>
            }
            <p class="hint">"Hệ thống Supabase" là phần nền tảng tự dùng (tài khoản, kho ảnh, chỉ mục…), không xoá được. Số dòng là ước tính.</p>
          </div>
        }
        @if (open() === 'media' && d.usage?.media; as md) {
          <div class="parts">
            <h3>Kho ảnh đang chứa gì</h3>
            <ul>
              @for (f of md.folders; track f.name) {
                <li>
                  <span class="p-name"><b>{{ folderLabel(f.name) }}</b><small>thư mục {{ f.name }}</small></span>
                  <span class="p-bar"><i [style.width.%]="md.bytes ? (f.bytes / md.bytes) * 100 : 0"></i></span>
                  <span class="p-size">{{ mb(f.bytes) }}<small>{{ fmt(f.count) }} tệp · TB {{ kb(f.count ? f.bytes / f.count : 0) }}</small></span>
                </li>
              } @empty {
                <li class="empty">Chưa có ảnh nào.</li>
              }
            </ul>
            <p class="hint">Mỗi ảnh sản phẩm được nén còn khoảng 150–250KB. Ảnh không còn dùng có thể dọn ở nút bên dưới.</p>
          </div>
        }

        <div class="foot">
          <a class="btn primary small" routerLink="/admin/thong-ke" [queryParams]="{ don: 1 }">🧹 Dọn dữ liệu không dùng</a>
          <span class="hint">Gói miễn phí Supabase: 500MB cơ sở dữ liệu, 1GB kho ảnh, 5GB băng thông/tháng. Chuông 🔔 tự cảnh báo khi dùng trên 70%.</span>
        </div>
      </section>

      <div class="two">
        <!-- Tên miền -->
        <section class="adm-box">
          <h2>🌐 Tên miền</h2>
          <div class="box-body">
            @if (d.domain; as dm) {
              <p class="big-name">{{ dm.name }}</p>
              @if (dm.expires) {
                @let left = daysLeft(dm.expires, d.now);
                <div class="count" [class]="'count ' + (left < 0 ? 'danger' : left <= 30 ? 'danger' : left <= 90 ? 'warn' : 'ok')">
                  <b>{{ left < 0 ? 'Đã hết hạn' : left }}</b>
                  @if (left >= 0) { <span>ngày nữa hết hạn</span> }
                </div>
                <dl>
                  <dt>Hết hạn</dt><dd>{{ date(dm.expires) }}</dd>
                  @if (dm.created) { <dt>Đăng ký từ</dt><dd>{{ date(dm.created) }}</dd> }
                  @if (dm.registrar) { <dt>Nhà đăng ký</dt><dd>{{ dm.registrar }}</dd> }
                  <dt>Nguồn</dt><dd>{{ dm.source === 'rdap' ? 'Tra cứu tự động (RDAP)' : 'Bạn nhập tay' }}</dd>
                </dl>
              } @else {
                <p class="hint">Chưa biết hạn: {{ dm.error || 'không tra cứu được' }} Hãy nhập ngày hết hạn ở ô bên dưới (xem trong email / trang quản lý của nơi bạn mua tên miền).</p>
              }
              @if (d.manual.renewUrl) { <a class="btn ghost small" [href]="d.manual.renewUrl" target="_blank" rel="noopener">Gia hạn tên miền ↗</a> }
            } @else {
              <p class="hint">Đang mở admin bằng địa chỉ tạm (vercel.app / máy thử) - nhập tên miền ở ô bên dưới.</p>
            }
          </div>
        </section>

        <!-- Hosting -->
        <section class="adm-box">
          <h2>☁️ Hosting</h2>
          <div class="box-body">
            @let h = d.hosting;
            <dl>
              <dt>Web chạy trên</dt><dd><b>{{ h.provider }}</b>@if (d.manual.hostingPlan) { · {{ d.manual.hostingPlan }} }</dd>
              @if (h.env) { <dt>Môi trường</dt><dd>{{ h.env === 'production' ? 'Chính thức (production)' : h.env }}</dd> }
              @if (h.region) { <dt>Máy chủ</dt><dd>{{ h.region }}</dd> }
              @if (h.productionUrl) { <dt>Địa chỉ Vercel</dt><dd>{{ h.productionUrl }}</dd> }
              @if (h.branch || h.commit) { <dt>Bản đang chạy</dt><dd>{{ h.branch }} · <code>{{ h.commit }}</code>@if (h.commitMessage) { <small>{{ h.commitMessage }}</small> }</dd> }
              @if (h.repo) { <dt>Mã nguồn</dt><dd>{{ h.repo }}</dd> }
              <dt>Dữ liệu</dt><dd>{{ h.database }}@if (h.databaseHost) { <small>{{ h.databaseHost }}</small> }</dd>
              @if (d.manual.hostingExpires) {
                @let hl = daysLeft(d.manual.hostingExpires + 'T00:00:00+07:00', d.now);
                <dt>Gói hosting hết hạn</dt><dd [class.red]="hl <= 30">{{ date(d.manual.hostingExpires + 'T00:00:00+07:00') }} ({{ hl < 0 ? 'đã hết hạn' : 'còn ' + hl + ' ngày' }})</dd>
              } @else {
                <dt>Thời hạn</dt><dd>Gói miễn phí (Vercel Hobby / Supabase Free) không có hạn - chỉ giới hạn dung lượng.</dd>
              }
            </dl>
            <p class="hint">Gói miễn phí Vercel: 100GB băng thông/tháng. Supabase miễn phí tạm dừng dự án nếu 7 ngày không có ai truy cập.</p>
          </div>
        </section>
      </div>

      <!-- Nhập tay -->
      <section class="adm-box">
        <h2>✏️ Thông tin nhập tay</h2>
        <div class="form">
          <label>Tên miền<input [value]="form().domain" (input)="setF('domain', $event)" placeholder="fumomainga.io.vn" /></label>
          <label>Ngày hết hạn tên miền<input type="date" [value]="form().domainExpires" (input)="setF('domainExpires', $event)" /></label>
          <label>Nơi mua tên miền<input [value]="form().registrar" (input)="setF('registrar', $event)" placeholder="Mắt Bão, PA Việt Nam, Tenten…" /></label>
          <label>Link gia hạn<input [value]="form().renewUrl" (input)="setF('renewUrl', $event)" placeholder="https://…" /></label>
          <label>Gói hosting<input [value]="form().hostingPlan" (input)="setF('hostingPlan', $event)" placeholder="Vercel Hobby (miễn phí)" /></label>
          <label>Hosting hết hạn (nếu trả phí)<input type="date" [value]="form().hostingExpires" (input)="setF('hostingExpires', $event)" /></label>
          <label class="wide">Ghi chú<textarea rows="2" [value]="form().note" (input)="setF('note', $event)" placeholder="Tài khoản đăng ký, email nhận nhắc gia hạn…"></textarea></label>
        </div>
        <div class="foot">
          <button data-save class="btn primary small" type="button" (click)="save()" [disabled]="saving()">{{ saving() ? 'Đang lưu…' : '💾 Lưu' }}</button>
          @if (saved()) { <span class="ok">✓ Đã lưu</span> }
          <span class="hint">Ngày tra cứu tự động (nếu có) được ưu tiên hơn ngày nhập tay. Chỉ admin xem được thông tin này.</span>
        </div>
      </section>
    } @else if (loading()) {
      <p class="none">Đang tải…</p>
    }
  `,
  styles: `
    .adm-box { margin-bottom: 16px; }
    .meters { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; padding: 14px 16px; }
    .meter { text-align: left; font: inherit; color: inherit; background: #fff; border: 1.5px solid #dcdcde; border-radius: 10px; padding: 12px 14px;
      display: grid; gap: 8px; cursor: pointer; transition: border-color .15s, box-shadow .15s; }
    .meter:hover, .meter.on { border-color: #2271b1; box-shadow: 0 0 0 3px rgba(34,113,177,.12); }
    .meter.off { cursor: default; background: #f6f7f7; }
    .m-top { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .m-foot { font-size: .82rem; color: #646970; }
    .m-foot u { color: #2271b1; margin-left: 4px; }
    .bar { height: 12px; border-radius: 6px; background: #f0f0f1; overflow: hidden; display: block; }
    .bar i { display: block; height: 100%; border-radius: 6px; background: #2e7d32; }
    .bar.warn i { background: #dba617; }
    .bar.danger i { background: #d63638; }
    .parts { padding: 0 16px 8px; }
    .parts h3 { font-size: .9rem; margin: 10px 0 6px; }
    .parts ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
    .parts li { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(60px, 1fr) auto; gap: 12px; align-items: center; padding: 7px 8px; border-radius: 6px; }
    .parts li:nth-child(odd) { background: #f6f7f7; }
    .parts li.empty { display: block; color: #646970; }
    .p-name { display: grid; min-width: 0; }
    .p-name small, .p-size small { color: #646970; font-size: .75rem; }
    .p-bar { height: 8px; border-radius: 4px; background: #e2e4e7; overflow: hidden; }
    .p-bar i { display: block; height: 100%; background: #2271b1; border-radius: 4px; min-width: 2px; }
    .p-size { text-align: right; display: grid; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 10px 16px 14px; }
    .hint { color: #646970; font-size: .8rem; margin: 0; }
    .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
    .box-body { padding: 14px 16px; display: grid; gap: 10px; align-content: start; }
    .big-name { margin: 0; font-size: 1.15rem; font-weight: 800; word-break: break-all; }
    .count { display: flex; align-items: baseline; gap: 8px; padding: 10px 14px; border-radius: 10px; background: #edfaef; color: #1e4620; }
    .count b { font-size: 2rem; line-height: 1; }
    .count.warn { background: #fcf9e8; color: #614a00; }
    .count.danger { background: #fcf0f1; color: #8a1f1f; }
    dl { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; font-size: .9rem; }
    dt { color: #646970; }
    dd { margin: 0; min-width: 0; word-break: break-word; }
    dd small { display: block; color: #646970; font-size: .78rem; }
    dd.red { color: #b32d2e; font-weight: 700; }
    .form { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px 14px; padding: 14px 16px 0; }
    .form label { display: grid; gap: 4px; font-size: .85rem; font-weight: 600; }
    .form .wide { grid-column: 1 / -1; }
    .form input, .form textarea { font: inherit; font-weight: 400; padding: 7px 10px; border: 1px solid #c3c4c7; border-radius: 6px; }
    .ok { color: #2e7d32; font-weight: 700; font-size: .85rem; }
    .none { color: #646970; }
    @media (max-width: 560px) {
      .parts li { grid-template-columns: minmax(0, 1fr) auto; }
      .p-bar { grid-column: 1 / -1; grid-row: 2; }
    }
  `,
})
export class AdminSystem {
  private readonly api = inject(OrderApiService);
  readonly info = signal<SystemInfo | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly open = signal<'db' | 'media' | null>(null);
  readonly form = signal<Manual>({ domain: '', domainExpires: '', registrar: '', renewUrl: '', hostingPlan: '', hostingExpires: '', note: '' });
  readonly saving = signal(false);
  readonly saved = signal(false);

  /** Từng bảng (đã đặt tên dễ hiểu) + phần hệ thống Supabase còn lại. */
  readonly dbParts = computed<Part[]>(() => {
    const db = this.info()?.usage?.db;
    if (!db) return [];
    const parts: Part[] = db.tables.map((t) => {
      const [label, hint] = TABLE_LABELS[t.name] ?? [t.name, ''];
      return { label, hint, bytes: t.bytes, count: t.name === 'app_kv' ? '' : `~${this.fmt(t.rows)} dòng` };
    });
    const used = parts.reduce((s, p) => s + p.bytes, 0);
    if (db.total > used) parts.push({ label: 'Hệ thống Supabase', hint: 'Tài khoản, thông tin kho ảnh, chỉ mục nội bộ', bytes: db.total - used });
    return parts.filter((p) => p.bytes > 0).sort((a, b) => b.bytes - a.bytes);
  });

  /** Các khoá trong "Dữ liệu web" gom theo nhóm. */
  readonly kvParts = computed<Part[]>(() => {
    const kv = this.info()?.usage?.db?.kv ?? [];
    const groups = new Map<string, Part & { n: number }>();
    for (const k of kv) {
      const m = KV_LABELS.find(([re]) => re.test(k.key));
      const label = m?.[1] ?? k.key;
      const g = groups.get(label) ?? { label, hint: m?.[2] ?? '', bytes: 0, n: 0 };
      g.bytes += k.bytes;
      g.n++;
      groups.set(label, g);
    }
    return [...groups.values()].map((g) => ({ ...g, count: g.n > 1 ? `${g.n} mục` : '' })).sort((a, b) => b.bytes - a.bytes);
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const r = await this.api.call<SystemInfo>('GET', '/api/admin/system', undefined, true, { timeoutMs: 30000 });
      this.info.set(r);
      this.form.set({ ...r.manual });
      if (r.usage?.error) this.error.set(r.usage.error);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Không tải được thông tin.');
    } finally {
      this.loading.set(false);
    }
  }

  toggle(k: 'db' | 'media'): void {
    this.open.set(this.open() === k ? null : k);
  }

  setF(k: keyof Manual, e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    this.form.update((f) => ({ ...f, [k]: v }));
    this.saved.set(false);
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      await this.api.call('PATCH', '/api/admin/system', this.form(), true);
      this.saved.set(true);
      await this.load();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Không lưu được.');
    } finally {
      this.saving.set(false);
    }
  }

  folderLabel(name: string): string {
    return FOLDER_LABELS[name] ?? name;
  }

  pct(used: number, limit: number): number {
    return limit ? Math.round((used / limit) * 1000) / 10 : 0;
  }

  level(p: number): string {
    return p >= 90 ? 'danger' : p >= 70 ? 'warn' : 'ok';
  }

  mb(bytes: number): string {
    const m = bytes / 1024 / 1024;
    return m >= 1024 ? `${(m / 1024).toFixed(2)} GB` : m >= 10 ? `${Math.round(m)} MB` : `${m.toFixed(m >= 1 ? 1 : 2)} MB`;
  }

  kb(bytes: number): string {
    return `${Math.round(bytes / 1024)} KB`;
  }

  fmt(n: number): string {
    return (n || 0).toLocaleString('vi-VN');
  }

  daysLeft(iso: string, now: number): number {
    return Math.floor((new Date(iso).getTime() - now) / 86_400_000);
  }

  date(iso: string): string {
    return new Date(iso).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}

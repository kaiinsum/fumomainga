import { isValidVnPhone } from '../../shared/validators';
import { Component, effect, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Customer, EMPTY_CUSTOMER, ORDER_STATUSES, ORDER_STATUS_LABEL, Order, OrderItem, OrderStatus } from '../../models/order';
import { ApiError, OrderApiService } from '../../services/order-api.service';
import { ProductService } from '../../services/product.service';
import { AdminInboxService } from '../inbox.service';
import { Product, finalPrice } from '../../models/product';
import { VndPipe } from '../../shared/vnd.pipe';
import { AdminToastService } from '../toast.service';

type Tab = 'all' | OrderStatus;

/** Bản nháp đang sửa (đơn có sẵn) hoặc đang tạo (code rỗng). */
interface Draft {
  code: string;
  status: OrderStatus;
  customer: Customer;
  items: OrderItem[];
  adminNote: string;
}

@Component({
  selector: 'app-admin-orders',
  imports: [FormsModule, DatePipe, VndPipe],
  template: `
    <div class="adm-head">
      <h1>Đơn hàng</h1>
      @if (connected()) {
        <button class="btn primary small" type="button" (click)="startCreate()">+ Thêm đơn</button>
        <button class="btn ghost small" type="button" [disabled]="loading()" (click)="load()">↻ Tải lại</button>
      }
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
        <h2>Kết nối máy chủ đơn hàng</h2>
        <form class="box-body" (ngSubmit)="connect()">
          <p class="hint">
            Đơn hàng của khách được lưu trên máy chủ, nên cần <b>mã quản trị</b> — chính là giá trị biến môi trường
            <code>ADMIN_API_KEY</code> bạn đặt trên Vercel. Chỉ cần nhập một lần trên máy này.
          </p>
          <div class="field">
            <label for="api-key">Mã quản trị</label>
            <input id="api-key" name="key" type="password" [(ngModel)]="keyInput" autocomplete="off" />
          </div>
          @if (error()) { <p class="err">{{ error() }}</p> }
          <button class="btn primary small" type="submit" [disabled]="loading()">{{ loading() ? 'Đang kết nối...' : 'Kết nối' }}</button>
        </form>
      </section>
      }
    } @else {
      <div class="view-switch" role="tablist">
        <button type="button" role="tab" [class.on]="view() === 'orders'" (click)="view.set('orders')">🧾 Đơn hàng ({{ orders().length }})</button>
        <button type="button" role="tab" [class.on]="view() === 'customers'" (click)="view.set('customers')">👥 Khách hàng ({{ customers().length }})</button>
      </div>

      @if (view() === 'orders') {
      <nav class="adm-tabs">
        @for (t of tabs(); track t.key) {
          <button type="button" [class.on]="tab() === t.key" (click)="tab.set(t.key)">
            {{ t.label }} <span class="count">({{ t.count }})</span>
          </button>
        }
      </nav>
      }

      <div class="adm-toolbar">
        <span class="spacer"></span>
        <input type="search" placeholder="Tìm mã đơn, tên, SĐT, email..." [ngModel]="search()" (ngModelChange)="search.set($event)" />
      </div>

      @if (error()) { <div class="adm-notice warn">{{ error() }}</div> }

      @if (draft(); as d) {
        <section class="adm-box editor">
          <h2>{{ d.code ? 'Đơn ' + d.code : 'Thêm đơn mới' }}</h2>
          <div class="box-body">
            <div class="grid">
              <div class="field">
                <label for="o-status">Trạng thái</label>
                <select id="o-status" [(ngModel)]="d.status">
                  @for (s of statuses; track s) { <option [value]="s">{{ label[s] }}</option> }
                </select>
              </div>
              <div class="field"><label class="req" for="o-name">Họ tên</label><input id="o-name" [class.invalid]="bad().has('name')" [(ngModel)]="d.customer.name" />
                @if (bad().has('name')) { <span class="field-err">Nhập họ tên khách.</span> }</div>
              <div class="field"><label class="req" for="o-phone">Số điện thoại</label><input id="o-phone" [class.invalid]="bad().has('phone')" [(ngModel)]="d.customer.phone" />
                @if (bad().has('phone')) { <span class="field-err">Số điện thoại không hợp lệ.</span> }</div>
              <div class="field"><label for="o-email">Email</label><input id="o-email" [(ngModel)]="d.customer.email" /></div>
              <div class="field full"><label class="req" for="o-addr">Địa chỉ</label><input id="o-addr" [class.invalid]="bad().has('address')" [(ngModel)]="d.customer.address" />
                @if (bad().has('address')) { <span class="field-err">Nhập địa chỉ nhận hàng (tối thiểu 5 ký tự).</span> }</div>
              <div class="field full"><label for="o-note">Ghi chú của khách</label><textarea id="o-note" rows="2" [(ngModel)]="d.customer.note"></textarea></div>
            </div>

            <div class="items">
              <b class="req">Sản phẩm</b>
              @if (bad().has('items')) { <span class="field-err">Đơn cần ít nhất 1 sản phẩm có tên, số lượng từ 1.</span> }
              @for (it of d.items; track $index; let i = $index) {
                <div class="item-row">
                  <input [class.invalid]="bad().has('items') && !it.name.trim()" [(ngModel)]="it.name" placeholder="Tên sản phẩm" aria-label="Tên sản phẩm" />
                  <input type="number" min="0" step="1000" [(ngModel)]="it.price" aria-label="Đơn giá" />
                  <input type="number" min="1" max="99" [(ngModel)]="it.qty" aria-label="Số lượng" />
                  <span class="line-sum">{{ it.price * it.qty | vnd }}</span>
                  <button type="button" class="mini del" (click)="d.items.splice(i, 1)" aria-label="Xoá dòng">✕</button>
                </div>
              }
              <div class="add-row">
                <select [(ngModel)]="pickProduct" aria-label="Chọn sản phẩm">
                  <option value="">— Thêm sản phẩm có sẵn —</option>
                  @for (p of products(); track p.id) { <option [value]="p.id">{{ p.name }} ({{ unit(p) | vnd }})</option> }
                </select>
                <button type="button" class="mini" (click)="addProduct(d)">+ Thêm</button>
                <button type="button" class="mini" (click)="d.items.push({ id: '', name: '', price: 0, qty: 1 })">+ Dòng trống</button>
                <span class="spacer"></span>
                <b>Tổng: {{ draftTotal(d) | vnd }}</b>
              </div>
            </div>

            <div class="field">
              <label for="o-admin">Ghi chú nội bộ (khách không thấy)</label>
              <textarea id="o-admin" rows="2" [(ngModel)]="d.adminNote" placeholder="VD: đã nhận 1.529.000đ lúc 14:05, mã GD ..."></textarea>
            </div>

            <div class="actions">
              @if (d.code) { <button type="button" class="link-del" (click)="remove(d.code)">Xoá đơn</button> }
              <span class="spacer"></span>
              <button class="btn ghost small" type="button" (click)="draft.set(null)">Huỷ</button>
              <button class="btn primary small" type="button" [disabled]="saving()" (click)="save(d)">
                {{ saving() ? 'Đang lưu...' : d.code ? 'Lưu thay đổi' : 'Tạo đơn' }}
              </button>
            </div>
          </div>
        </section>
      }

      @if (view() === 'customers') {
        <div class="adm-table-wrap">
          <table class="adm-table">
            <thead>
              <tr><th>Khách hàng</th><th>Liên hệ</th><th>Địa chỉ gần nhất</th><th>Số đơn</th><th>Đã chi (đơn đã thanh toán)</th><th>Đơn gần nhất</th></tr>
            </thead>
            <tbody>
              @for (c of customerRows(); track c.phone) {
                <tr>
                  <td><b>{{ c.name }}</b></td>
                  <td>{{ c.phone }}@if (c.email) {<div class="sub">{{ c.email }}</div>}</td>
                  <td><div class="sub wrap">{{ c.address }}</div></td>
                  <td>{{ c.orders }}</td>
                  <td><b>{{ c.spent | vnd }}</b></td>
                  <td>
                    <button type="button" class="link" (click)="showOrdersOf(c.phone)">{{ c.lastCode }}</button>
                    <div class="sub">{{ c.lastAt | date: 'dd/MM/yyyy HH:mm' }}</div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="empty">Chưa có khách hàng nào.</td></tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="adm-table-wrap">
          <table class="adm-table">
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Khách hàng</th>
                <th>Tổng tiền</th>
                <th>Trạng thái</th>
                <th>Ngày đặt</th>
                <th style="width: 170px"></th>
              </tr>
            </thead>
            <tbody>
              @for (o of rows(); track o.code) {
                <tr>
                  <td>
                    <b class="mono">{{ o.code }}</b>
                    @if (o.status === 'pending' && o.paidClaimAt) {
                      <div><span class="flag" [title]="'Khách báo đã CK lúc ' + (o.paidClaimAt | date: 'HH:mm dd/MM')">💸 Khách báo đã CK</span></div>
                    }
                  </td>
                  <td>
                    <b>{{ o.customer.name }}</b>
                    <div class="sub">{{ o.customer.phone }}{{ o.customer.email ? ' · ' + o.customer.email : '' }}</div>
                    <div class="sub">{{ o.customer.address }}</div>
                  </td>
                  <td>
                    <b>{{ o.total | vnd }}</b>
                    <div class="sub">{{ o.items.length }} sản phẩm</div>
                  </td>
                  <td>
                    <select class="status-select" [ngModel]="o.status" (ngModelChange)="quickStatus(o, $event)" [attr.aria-label]="'Trạng thái đơn ' + o.code">
                      @for (s of statuses; track s) { <option [value]="s">{{ label[s] }}</option> }
                    </select>
                  </td>
                  <td>{{ o.createdAt | date: 'dd/MM/yyyy HH:mm' }}</td>
                  <td class="row-btns">
                    <button type="button" class="mini" (click)="startEdit(o)">Xem / sửa</button>
                    <button type="button" class="mini del" (click)="remove(o.code)">Xoá</button>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="empty">{{ loading() ? 'Đang tải...' : 'Chưa có đơn hàng nào.' }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
      <p class="hint footer-hint">
        Đã kết nối máy chủ. <button type="button" class="link" (click)="disconnect()">Đổi mã quản trị</button>
      </p>
    }
  `,
  styles: `
    .narrow { max-width: 620px; }
    .setup ol { margin: 0; padding-left: 20px; display: grid; gap: 8px; }
    .hint { color: #646970; font-size: 0.85rem; margin: 0; }
    .err { color: var(--error, #b32d2e); font-weight: 700; margin: 0; }
    .mono { font-family: ui-monospace, Consolas, monospace; letter-spacing: .04em; }
    .sub { font-size: .8rem; color: #646970; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .flag { display: inline-block; margin-top: 4px; font-size: .72rem; font-weight: 800; padding: 2px 8px; border-radius: 999px; background: var(--primary-100); color: var(--primary-ink); }
    .status-select { font: inherit; font-size: .85rem; padding: 5px 8px; border: 1px solid #c3c4c7; border-radius: 8px; background: #fff; }
    .row-btns { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
    .mini { font: inherit; font-size: .8rem; padding: 4px 10px; border: 1px solid #c3c4c7; border-radius: 6px; background: #fff; cursor: pointer; }
    .mini:hover { border-color: var(--primary); color: var(--primary-dark); }
    .mini.del { color: var(--primary-ink); }
    .editor { margin-bottom: 16px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .grid .full { grid-column: 1 / -1; }
    .items { display: flex; flex-direction: column; gap: 8px; }
    .item-row { display: grid; grid-template-columns: 1fr 130px 70px 120px 32px; gap: 8px; align-items: center; }
    .item-row input, .add-row select { font: inherit; padding: 6px 10px; border: 1px solid #c3c4c7; border-radius: 8px; min-width: 0; }
    .line-sum { text-align: right; font-weight: 700; }
    .add-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .spacer { flex: 1; }
    .actions { display: flex; gap: 8px; align-items: center; padding-top: 12px; border-top: 1px solid #f0f0f1; }
    .link-del, .link { background: none; border: none; padding: 0; font: inherit; text-decoration: underline; cursor: pointer; color: var(--primary-ink); }
    .link { color: var(--primary-dark); font-size: .85rem; }
    .footer-hint { margin-top: 12px; }
    .view-switch { display: inline-flex; gap: 4px; padding: 4px; margin-bottom: 14px; border-radius: 10px; background: #f0f0f1; }
    .view-switch button { font: inherit; font-weight: 700; padding: 7px 14px; border: none; border-radius: 8px; background: none; cursor: pointer; color: #50575e; }
    .view-switch button.on { background: #fff; color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    .sub.wrap { white-space: normal; }
    @media (max-width: 760px) {
      .grid { grid-template-columns: 1fr; }
      .item-row { grid-template-columns: 1fr 90px 56px 32px; }
      .line-sum { display: none; }
    }
  `,
})
export class AdminOrders {
  private readonly api = inject(OrderApiService);
  private readonly toast = inject(AdminToastService);
  readonly products = inject(ProductService).products;
  protected readonly unit = (p: Product) => finalPrice(p);

  readonly label = ORDER_STATUS_LABEL;
  readonly statuses = ORDER_STATUSES;
  readonly orders = signal<Order[]>([]);
  private readonly inbox = inject(AdminInboxService);
  private readonly syncBadge = effect(() => {
    const list = this.orders();
    if (list.length) this.inbox.setOrders(list);
  });
  readonly connected = signal(false);
  /** Thông báo khi máy chủ chưa cấu hình (503). */
  readonly setup = signal('');
  /** Cần nhập mã quản trị (401 hoặc chưa có mã). */
  readonly needKey = signal(false);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly tab = signal<Tab>('all');
  readonly view = signal<'orders' | 'customers'>('orders');

  /** Khách hàng gom theo số điện thoại từ các đơn đã có. */
  readonly customers = computed(() => {
    const map = new Map<string, { name: string; phone: string; email: string; address: string; orders: number; spent: number; lastCode: string; lastAt: number }>();
    for (const o of this.orders()) {
      const key = o.customer.phone.replace(/\D/g, '');
      const c = map.get(key);
      const paid = o.status === 'paid' || o.status === 'shipping' || o.status === 'done' ? o.total : 0;
      if (!c) {
        map.set(key, { name: o.customer.name, phone: o.customer.phone, email: o.customer.email, address: o.customer.address, orders: 1, spent: paid, lastCode: o.code, lastAt: o.createdAt });
      } else {
        c.orders++;
        c.spent += paid;
        if (o.createdAt > c.lastAt) Object.assign(c, { name: o.customer.name, email: o.customer.email || c.email, address: o.customer.address, lastCode: o.code, lastAt: o.createdAt });
      }
    }
    return [...map.values()].sort((a, b) => b.lastAt - a.lastAt);
  });

  readonly customerRows = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.customers().filter((c) => !term || [c.name, c.phone, c.email, c.address].some((v) => v.toLowerCase().includes(term)));
  });

  showOrdersOf(phone: string): void {
    this.view.set('orders');
    this.tab.set('all');
    this.search.set(phone);
  }
  readonly search = signal('');
  readonly draft = signal<Draft | null>(null);
  keyInput = '';
  pickProduct = '';

  readonly tabs = computed(() => {
    const all = this.orders();
    return [
      { key: 'all' as Tab, label: 'Tất cả', count: all.length },
      ...ORDER_STATUSES.map((s) => ({ key: s as Tab, label: ORDER_STATUS_LABEL[s], count: all.filter((o) => o.status === s).length })),
    ];
  });

  readonly rows = computed(() => {
    const term = this.search().trim().toLowerCase();
    const tab = this.tab();
    return this.orders().filter((o) => {
      if (tab !== 'all' && o.status !== tab) return false;
      if (!term) return true;
      const c = o.customer;
      return [o.code, c.name, c.phone, c.email, c.address].some((v) => v.toLowerCase().includes(term));
    });
  });

  constructor() {
    void this.load();
  }

  async connect(): Promise<void> {
    this.api.setAdminKey(this.keyInput);
    await this.load();
  }

  disconnect(): void {
    this.api.setAdminKey('');
    this.connected.set(false);
    this.needKey.set(true);
    this.orders.set([]);
    this.draft.set(null);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.orders.set((await this.api.list()).orders);
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

  startCreate(): void {
    this.draft.set({ code: '', status: 'pending', customer: { ...EMPTY_CUSTOMER }, items: [], adminNote: '' });
  }

  startEdit(o: Order): void {
    this.draft.set(structuredClone({ code: o.code, status: o.status, customer: o.customer, items: o.items, adminNote: o.adminNote }));
    scrollTo({ top: 0, behavior: 'smooth' });
  }

  addProduct(d: Draft): void {
    const p = this.products().find((x) => x.id === this.pickProduct);
    if (!p) return;
    const line = d.items.find((i) => i.id === p.id);
    if (line) line.qty++;
    else d.items.push({ id: p.id, name: p.name, price: finalPrice(p), qty: 1 });
    this.pickProduct = '';
  }

  draftTotal(d: Draft): number {
    return d.items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);
  }

  /** Trường đang thiếu / sai sau khi bấm lưu (tô đỏ). */
  readonly bad = signal<Set<string>>(new Set());

  private check(d: Draft): Set<string> {
    const bad = new Set<string>();
    if (d.customer.name.trim().length < 2) bad.add('name');
    if (!isValidVnPhone(d.customer.phone)) bad.add('phone');
    if (d.customer.address.trim().length < 5) bad.add('address');
    if (!d.items.length || d.items.some((i) => !String(i.name).trim() || !(Number(i.qty) >= 1))) bad.add('items');
    return bad;
  }

  async save(d: Draft): Promise<void> {
    const bad = this.check(d);
    this.bad.set(bad);
    if (bad.size) {
      this.toast.err('Vui lòng điền các trường đang tô đỏ.');
      setTimeout(() => document.querySelector<HTMLElement>('.adm-shell .invalid, .adm-shell .field-err')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    this.saving.set(true);
    try {
      const items = d.items.map((i) => ({ ...i, price: Number(i.price), qty: Number(i.qty) }));
      if (d.code) {
        const { order } = await this.api.update(d.code, { status: d.status, customer: d.customer, items, adminNote: d.adminNote });
        this.orders.update((list) => list.map((o) => (o.code === order.code ? order : o)));
        this.toast.ok(`Đã lưu đơn ${order.code}`);
      } else {
        const { code } = await this.api.adminCreate({ customer: d.customer, items, status: d.status, adminNote: d.adminNote });
        this.toast.ok(`Đã tạo đơn ${code}`);
        await this.load();
      }
      this.draft.set(null);
    } catch (e) {
      this.toast.err(e instanceof Error ? e.message : 'Không lưu được đơn.');
    } finally {
      this.saving.set(false);
    }
  }

  async quickStatus(o: Order, status: OrderStatus): Promise<void> {
    try {
      const { order } = await this.api.update(o.code, { status });
      this.orders.update((list) => list.map((x) => (x.code === order.code ? order : x)));
      this.toast.ok(`Đơn ${o.code}: ${ORDER_STATUS_LABEL[status]}`);
    } catch (e) {
      this.toast.err(e instanceof Error ? e.message : 'Không cập nhật được trạng thái.');
      await this.load();
    }
  }

  async remove(code: string): Promise<void> {
    if (!confirm(`Xoá vĩnh viễn đơn ${code}? Không thể hoàn tác.`)) return;
    try {
      await this.api.remove(code);
      this.orders.update((list) => list.filter((o) => o.code !== code));
      if (this.draft()?.code === code) this.draft.set(null);
      this.toast.ok(`Đã xoá đơn ${code}`);
    } catch (e) {
      this.toast.err(e instanceof Error ? e.message : 'Không xoá được đơn.');
    }
  }
}

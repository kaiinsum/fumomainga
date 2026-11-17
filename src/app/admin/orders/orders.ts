import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Customer, EMPTY_CUSTOMER, ORDER_STATUSES, ORDER_STATUS_LABEL, Order, OrderItem, OrderStatus } from '../../models/order';
import { OrderApiService } from '../../services/order-api.service';
import { ProductService } from '../../services/product.service';
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
    } @else {
      <nav class="adm-tabs">
        @for (t of tabs(); track t.key) {
          <button type="button" [class.on]="tab() === t.key" (click)="tab.set(t.key)">
            {{ t.label }} <span class="count">({{ t.count }})</span>
          </button>
        }
      </nav>

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
              <div class="field"><label for="o-name">Họ tên</label><input id="o-name" [(ngModel)]="d.customer.name" /></div>
              <div class="field"><label for="o-phone">Số điện thoại</label><input id="o-phone" [(ngModel)]="d.customer.phone" /></div>
              <div class="field"><label for="o-email">Email</label><input id="o-email" [(ngModel)]="d.customer.email" /></div>
              <div class="field full"><label for="o-addr">Địa chỉ</label><input id="o-addr" [(ngModel)]="d.customer.address" /></div>
              <div class="field full"><label for="o-note">Ghi chú của khách</label><textarea id="o-note" rows="2" [(ngModel)]="d.customer.note"></textarea></div>
            </div>

            <div class="items">
              <b>Sản phẩm</b>
              @for (it of d.items; track $index; let i = $index) {
                <div class="item-row">
                  <input [(ngModel)]="it.name" placeholder="Tên sản phẩm" aria-label="Tên sản phẩm" />
                  <input type="number" min="0" step="1000" [(ngModel)]="it.price" aria-label="Đơn giá" />
                  <input type="number" min="1" max="99" [(ngModel)]="it.qty" aria-label="Số lượng" />
                  <span class="line-sum">{{ it.price * it.qty | vnd }}</span>
                  <button type="button" class="mini del" (click)="d.items.splice(i, 1)" aria-label="Xoá dòng">✕</button>
                </div>
              }
              <div class="add-row">
                <select [(ngModel)]="pickProduct" aria-label="Chọn sản phẩm">
                  <option value="">— Thêm sản phẩm có sẵn —</option>
                  @for (p of products(); track p.id) { <option [value]="p.id">{{ p.name }} ({{ p.price | vnd }})</option> }
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
      <p class="hint footer-hint">
        Đã kết nối máy chủ. <button type="button" class="link" (click)="disconnect()">Đổi mã quản trị</button>
      </p>
    }
  `,
  styles: `
    .narrow { max-width: 560px; }
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

  readonly label = ORDER_STATUS_LABEL;
  readonly statuses = ORDER_STATUSES;
  readonly orders = signal<Order[]>([]);
  readonly connected = signal(false);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly tab = signal<Tab>('all');
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
    if (this.api.adminKey()) void this.load();
  }

  async connect(): Promise<void> {
    this.api.setAdminKey(this.keyInput);
    await this.load();
  }

  disconnect(): void {
    this.api.setAdminKey('');
    this.connected.set(false);
    this.orders.set([]);
    this.draft.set(null);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.orders.set((await this.api.list()).orders);
      this.connected.set(true);
    } catch (e) {
      this.connected.set(false);
      this.error.set(e instanceof Error ? e.message : 'Không tải được đơn hàng.');
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
    else d.items.push({ id: p.id, name: p.name, price: p.price, qty: 1 });
    this.pickProduct = '';
  }

  draftTotal(d: Draft): number {
    return d.items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);
  }

  async save(d: Draft): Promise<void> {
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

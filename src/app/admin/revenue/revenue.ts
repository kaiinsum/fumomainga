import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Order } from '../../models/order';
import { ApiError, OrderApiService } from '../../services/order-api.service';
import { ProductService } from '../../services/product.service';
import { VndPipe } from '../../shared/vnd.pipe';
import { CostService } from '../cost.service';

const RANGES = [
  { days: 7, label: '7 ngày' },
  { days: 30, label: '30 ngày' },
  { days: 90, label: '90 ngày' },
  { days: 365, label: '1 năm' },
  { days: 0, label: 'Tất cả' },
];

interface Line {
  key: string;
  name: string;
  image: string;
  qty: number;
  revenue: number;
  cost: number;
  /** Số bé chưa nhập giá nhập. */
  missing: number;
}

/**
 * Admin → Doanh thu.
 *  - Doanh thu chỉ tính đơn ĐÃ HOÀN THÀNH (không tính đơn huỷ / đang xử lý).
 *  - Lãi ròng = doanh thu − giá nhập (giá nhập chỉ admin thấy).
 *  - Tiền đang bị giam = đơn đã đặt nhưng chưa thanh toán; tiền đang về = đã thanh toán / đang giao, chưa hoàn thành.
 */
@Component({
  selector: 'app-admin-revenue',
  imports: [VndPipe, DecimalPipe, DatePipe, RouterLink],
  template: `
    <div class="adm-head">
      <h1>Doanh thu</h1>
      <div class="seg" role="radiogroup" aria-label="Khoảng thời gian">
        @for (r of ranges; track r.days) {
          <button type="button" role="radio" [attr.aria-checked]="days() === r.days" [class.on]="days() === r.days" (click)="days.set(r.days)">{{ r.label }}</button>
        }
      </div>
      <button class="btn ghost small" type="button" (click)="load()" [disabled]="loading()">{{ loading() ? 'Đang tải…' : '↻ Tải lại' }}</button>
    </div>
    @if (error()) { <p class="err">{{ error() }}</p> }
    @if (costs.error()) { <p class="err">Giá nhập: {{ costs.error() }}</p> }

    <section class="adm-box">
      <h2>💰 Kết quả kinh doanh <small>đơn đã hoàn thành</small></h2>
      <div class="box-body">
        <div class="tiles">
          <div class="tile"><span>Doanh thu</span><b>{{ sum().revenue | vnd }}</b><small>{{ sum().orders }} đơn hoàn thành · {{ sum().qty }} bé</small></div>
          <div class="tile"><span>Chi phí nhập hàng 🔒</span><b>{{ sum().cost | vnd }}</b><small>@if (sum().missing) { ⚠️ {{ sum().missing }} bé chưa có giá nhập } @else { đã đủ giá nhập }</small></div>
          <div class="tile good" [class.bad]="sum().profit < 0"><span>Lãi ròng 🔒</span><b>{{ sum().profit | vnd }}</b><small>biên lãi {{ sum().revenue ? ((sum().profit / sum().revenue) * 100 | number: '1.0-1') : 0 }}%</small></div>
          <div class="tile"><span>Giá trị TB / đơn</span><b>{{ (sum().orders ? sum().revenue / sum().orders : 0) | vnd }}</b><small>lãi TB {{ (sum().orders ? sum().profit / sum().orders : 0) | vnd }} / đơn</small></div>
        </div>
        @if (sum().missing) {
          <p class="hint">⚠️ Sản phẩm chưa nhập giá nhập được tính chi phí = 0 (lãi sẽ cao hơn thực tế). Nhập giá ở trang <a routerLink="/admin/san-pham">sửa sản phẩm</a> → ô <b>🔒 Giá nhập</b>.</p>
        }
      </div>
    </section>

    <section class="adm-box">
      <h2>⏳ Tiền chưa về <small>tại thời điểm hiện tại, không lọc theo ngày</small></h2>
      <div class="box-body">
        <div class="tiles three">
          <div class="tile warn"><span>Tiền đang bị giam</span><b>{{ held().pending.total | vnd }}</b><small>{{ held().pending.count }} đơn đã đặt nhưng chưa thanh toán</small></div>
          <div class="tile"><span>Đã thanh toán, chưa xong</span><b>{{ held().inflight.total | vnd }}</b><small>{{ held().inflight.count }} đơn đã xác nhận / đang giao</small></div>
          <div class="tile muted"><span>Đơn đã huỷ</span><b>{{ held().cancelled.total | vnd }}</b><small>{{ held().cancelled.count }} đơn trong khoảng đã chọn - không tính vào doanh thu</small></div>
        </div>
        @if (held().oldest.length) {
          <h3>Đơn chờ thanh toán lâu nhất</h3>
          <ul class="olds">
            @for (o of held().oldest; track o.code) {
              <li><a routerLink="/admin/don-hang">{{ o.code }}</a> · {{ o.customer.name }} · <b>{{ o.total | vnd }}</b> <small>đặt {{ o.createdAt | date: 'dd/MM HH:mm' }}</small></li>
            }
          </ul>
        }
      </div>
    </section>

    <section class="adm-box">
      <h2>📈 Doanh thu theo {{ unitLabel() }}</h2>
      <div class="box-body">
        @if (series().length) {
          <div class="chart" role="img" [attr.aria-label]="'Biểu đồ doanh thu và lãi theo ' + unitLabel()">
            @for (b of series(); track b.label) {
              <div class="col" [title]="b.label + ': doanh thu ' + (b.revenue | vnd) + ' · lãi ' + (b.profit | vnd)">
                <div class="bars-v">
                  <span class="rv" [style.height.%]="pct(b.revenue, maxSeries())"></span>
                  <span class="pf" [class.neg]="b.profit < 0" [style.height.%]="pct(b.profit > 0 ? b.profit : 0, maxSeries())"></span>
                </div>
                <small>{{ b.label }}</small>
              </div>
            }
          </div>
          <p class="legend"><i class="rv"></i> Doanh thu <i class="pf"></i> Lãi ròng</p>
        } @else {
          <p class="hint">Chưa có đơn hoàn thành trong khoảng này.</p>
        }
      </div>
    </section>

    <section class="adm-box">
      <h2>🧸 Lãi theo sản phẩm</h2>
      <div class="box-body">
        @if (lines().length) {
          <div class="adm-table-wrap">
            <table class="adm-table">
              <thead><tr><th>Sản phẩm</th><th class="num">Đã bán</th><th class="num">Doanh thu</th><th class="num">Giá nhập</th><th class="num">Lãi ròng</th><th class="num">Biên lãi</th></tr></thead>
              <tbody>
                @for (l of lines(); track l.key) {
                  <tr>
                    <td class="pname">@if (l.image) { <img [src]="l.image" alt="" /> }{{ l.name }}@if (l.missing) { <span class="miss" title="Chưa nhập giá nhập">⚠️</span> }</td>
                    <td class="num">{{ l.qty | number }}</td>
                    <td class="num">{{ l.revenue | vnd }}</td>
                    <td class="num">{{ l.cost | vnd }}</td>
                    <td class="num" [class.neg]="l.revenue - l.cost < 0"><b>{{ l.revenue - l.cost | vnd }}</b></td>
                    <td class="num">{{ l.revenue ? (((l.revenue - l.cost) / l.revenue) * 100 | number: '1.0-1') + '%' : '-' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="hint">Chưa có đơn hoàn thành trong khoảng này.</p>
        }
      </div>
    </section>
  `,
  styles: `
    .seg { display: inline-flex; border: 1px solid #c3c4c7; border-radius: 8px; overflow: hidden; flex-wrap: wrap; }
    .seg button { border: 0; border-right: 1px solid #c3c4c7; background: #fff; padding: 6px 12px; font: inherit; font-size: .85rem; cursor: pointer; }
    .seg button:last-child { border-right: 0; }
    .seg button.on { background: #2271b1; color: #fff; font-weight: 700; }
    .err { color: #b32d2e; }
    h2 small { font-weight: 400; color: #646970; font-size: .78rem; margin-left: 6px; }
    h3 { margin: 16px 0 6px; font-size: .92rem; }
    .hint { color: #646970; font-size: .8rem; }
    .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .tiles.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .tile { padding: 12px 14px; border: 1px solid #dcdcde; border-radius: 10px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .tile span { font-size: .75rem; color: #646970; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; }
    .tile b { font-size: 1.3rem; color: #1d2327; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .tile small { color: #646970; font-size: .75rem; }
    .tile.good { border-color: #68de7c; background: #edfaef; }
    .tile.good b { color: #00731d; }
    .tile.bad { border-color: #f86368; background: #fcf0f1; }
    .tile.bad b { color: #b32d2e; }
    .tile.warn { border-color: #f0c33c; background: #fcf9e8; }
    .tile.warn b { color: #8a6100; }
    .tile.muted b { color: #646970; }
    .olds { margin: 0; padding-left: 18px; font-size: .85rem; display: grid; gap: 4px; }
    .olds small { color: #646970; }
    .chart { display: flex; align-items: flex-end; gap: 4px; height: 200px; overflow-x: auto; padding-bottom: 2px; }
    .col { flex: 1 0 22px; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; }
    .bars-v { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 2px; }
    .bars-v span { width: 45%; max-width: 18px; border-radius: 3px 3px 0 0; min-height: 1px; }
    .rv { background: #2271b1; }
    .pf { background: #00a32a; }
    .pf.neg { background: #d63638; }
    .col small { font-size: .65rem; color: #646970; white-space: nowrap; }
    .col:hover .rv { background: #135e96; }
    .legend { font-size: .78rem; color: #646970; display: flex; gap: 12px; align-items: center; margin: 8px 0 0; }
    .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: -6px; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .neg, td.neg b { color: #b32d2e; }
    .pname { display: flex; align-items: center; gap: 8px; }
    .pname img { width: 24px; height: 24px; border-radius: 6px; object-fit: cover; flex: none; }
    .miss { font-size: .8rem; }
    @media (max-width: 900px) { .tiles, .tiles.three { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 600px) { .adm-table th:nth-child(6), .adm-table td:nth-child(6) { display: none; } }
  `,
})
export class AdminRevenue {
  private readonly api = inject(OrderApiService);
  private readonly products = inject(ProductService);
  readonly costs = inject(CostService);
  readonly ranges = RANGES;
  readonly days = signal(30);
  readonly orders = signal<Order[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    await Promise.all([
      this.api
        .list()
        .then((r) => this.orders.set(r.orders))
        .catch((e) =>
          this.error.set(e instanceof ApiError && (e.status === 404 || e.status === 0) ? 'Chỉ xem được khi web chạy trên Vercel (cần máy chủ).' : e instanceof Error ? e.message : 'Không tải được đơn hàng.'),
        ),
      this.costs.load(true),
    ]);
    this.loading.set(false);
  }

  pct(v: number, max: number): number {
    return max > 0 ? Math.max(0.5, (v / max) * 100) : 0;
  }

  private readonly from = computed(() => (this.days() ? Date.now() - this.days() * 86_400_000 : 0));
  /** Đơn hoàn thành trong khoảng (theo ngày đặt). */
  private readonly done = computed(() => this.orders().filter((o) => o.status === 'done' && o.createdAt >= this.from()));

  private orderCost(o: Order): { cost: number; missing: number } {
    let cost = 0;
    let missing = 0;
    for (const it of o.items) {
      const c = this.costs.costOf(it.id);
      if (c === null) missing += it.qty;
      else cost += c * it.qty;
    }
    return { cost, missing };
  }

  readonly sum = computed(() => {
    this.costs.costs();
    let revenue = 0;
    let cost = 0;
    let missing = 0;
    let qty = 0;
    for (const o of this.done()) {
      revenue += o.total;
      const c = this.orderCost(o);
      cost += c.cost;
      missing += c.missing;
      qty += o.items.reduce((s, i) => s + i.qty, 0);
    }
    return { orders: this.done().length, revenue, cost, missing, qty, profit: revenue - cost };
  });

  readonly held = computed(() => {
    const all = this.orders();
    const agg = (list: Order[]) => ({ count: list.length, total: list.reduce((s, o) => s + o.total, 0) });
    const pending = all.filter((o) => o.status === 'pending');
    return {
      pending: agg(pending),
      inflight: agg(all.filter((o) => o.status === 'paid' || o.status === 'shipping')),
      cancelled: agg(all.filter((o) => o.status === 'cancelled' && o.createdAt >= this.from())),
      oldest: [...pending].sort((a, b) => a.createdAt - b.createdAt).slice(0, 5),
    };
  });

  readonly unitLabel = computed(() => (this.days() && this.days() <= 90 ? 'ngày' : 'tháng'));

  readonly series = computed(() => {
    this.costs.costs();
    const byDay = this.unitLabel() === 'ngày';
    const map = new Map<string, { label: string; t: number; revenue: number; profit: number }>();
    const key = (t: number) => {
      const d = new Date(t);
      return byDay
        ? { k: d.toISOString().slice(0, 10), label: `${d.getDate()}/${d.getMonth() + 1}`, t: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }
        : { k: `${d.getFullYear()}-${d.getMonth()}`, label: `T${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`, t: new Date(d.getFullYear(), d.getMonth(), 1).getTime() };
    };
    // Khoảng ngày ngắn → đủ mọi ngày (kể cả ngày 0 đồng) cho biểu đồ liền mạch.
    if (byDay) {
      for (let i = this.days() - 1; i >= 0; i--) {
        const k = key(Date.now() - i * 86_400_000);
        map.set(k.k, { label: k.label, t: k.t, revenue: 0, profit: 0 });
      }
    }
    for (const o of this.done()) {
      const k = key(o.createdAt);
      const b = map.get(k.k) ?? { label: k.label, t: k.t, revenue: 0, profit: 0 };
      b.revenue += o.total;
      b.profit += o.total - this.orderCost(o).cost;
      map.set(k.k, b);
    }
    return [...map.values()].sort((a, b) => a.t - b.t);
  });
  readonly maxSeries = computed(() => Math.max(0, ...this.series().map((b) => b.revenue)));

  readonly lines = computed<Line[]>(() => {
    this.costs.costs();
    const rows = new Map<string, Line>();
    for (const o of this.done()) {
      for (const it of o.items) {
        const key = String(it.id).split('::')[0];
        const p = this.products.getById(key);
        const r = rows.get(key) ?? { key, name: p?.name ?? it.name.split(' - ')[0], image: p?.images[0] ?? '', qty: 0, revenue: 0, cost: 0, missing: 0 };
        r.qty += it.qty;
        r.revenue += it.price * it.qty;
        const c = this.costs.costOf(it.id);
        if (c === null) r.missing += it.qty;
        else r.cost += c * it.qty;
        rows.set(key, r);
      }
    }
    return [...rows.values()].sort((a, b) => b.revenue - b.cost - (a.revenue - a.cost));
  });
}

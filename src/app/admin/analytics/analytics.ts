import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { OrderApiService } from '../../services/order-api.service';

type RangeKey = 'hour' | 'day' | 'month' | 'all';
type Unit = 'minute' | 'hour' | 'day' | 'month';

interface Visit {
  at: number;
  vid: string;
  sid: string;
  path: string;
  ip: string;
  ua: string;
  ref: string;
}

interface Stats {
  now: number;
  range: RangeKey;
  unit: Unit;
  from: number;
  online: { count: number; list: { vid: string; lastSeen: number; path: string; ip: string; ua: string }[] };
  total: { views: number; visitors: number };
  today: { views: number; visitors: number };
  inRange: { views: number; visitors: number };
  series: { t: number; views: number; visitors: number }[];
  top: { path: string; views: number; visitors: number }[];
  latest: Visit[];
}

interface Point {
  t: number;
  views: number;
  visitors: number;
}

const REFRESH_MS = 15_000;
const VN = 7 * 3600_000;
const STEP: Record<Exclude<Unit, 'month'>, number> = { minute: 60_000, hour: 3600_000, day: 86_400_000 };

/** Đầu phút / giờ / ngày / tháng theo giờ Việt Nam (khớp với máy chủ). */
function trunc(t: number, unit: Unit): number {
  if (unit === 'month') {
    const d = new Date(t + VN);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - VN;
  }
  return Math.floor((t + VN) / STEP[unit]) * STEP[unit] - VN;
}

function next(t: number, unit: Unit): number {
  if (unit !== 'month') return t + STEP[unit];
  const d = new Date(t + VN);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - VN;
}

/** Đỉnh trục Y = 4 vạch đều nhau, mỗi vạch là số đẹp (1, 2, 5 × 10^n) → nhãn luôn là số nguyên. */
function niceMax(v: number): number {
  const raw = Math.max(1, v / 4);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw && Number.isInteger(s)) ?? Math.ceil(raw);
  return step * 4;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Định dạng theo giờ Việt Nam (không phụ thuộc múi giờ máy admin). */
function vnParts(t: number) {
  const d = new Date(t + VN);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
}

export function device(ua: string): string {
  const mobile = /iPhone|Android.+Mobile|Windows Phone/i.test(ua);
  const tablet = !mobile && /iPad|Android|Tablet/i.test(ua);
  const browser = /Zalo/i.test(ua)
    ? 'Zalo'
    : /FBAN|FBAV|FB_IAB/i.test(ua)
      ? 'Facebook'
      : /coc_coc|CocCoc/i.test(ua)
        ? 'Cốc Cốc'
        : /Edg\//i.test(ua)
          ? 'Edge'
          : /OPR\//i.test(ua)
            ? 'Opera'
            : /Firefox|FxiOS/i.test(ua)
              ? 'Firefox'
              : /Chrome|CriOS/i.test(ua)
                ? 'Chrome'
                : /Safari/i.test(ua)
                  ? 'Safari'
                  : 'Khác';
  return `${mobile ? '📱' : tablet ? '📟' : '💻'} ${browser}`;
}

/** Trang admin "Thống kê": khách đang truy cập, lượt xem theo phút → toàn bộ, IP gần nhất. */
@Component({
  selector: 'app-admin-analytics',
  template: `
    <div class="adm-head">
      <h1>Thống kê truy cập</h1>
      <span class="live" [class.off]="!auto()">
        <i></i>{{ auto() ? 'Tự cập nhật mỗi 15 giây' : 'Đã tạm dừng cập nhật' }}
      </span>
      <button class="btn ghost small" type="button" (click)="auto.set(!auto())">{{ auto() ? '⏸ Tạm dừng' : '▶ Tiếp tục' }}</button>
      <button class="btn ghost small" type="button" (click)="load()" [disabled]="loading()">↻ Tải lại</button>
    </div>

    @if (error()) {
      <div class="adm-notice warn">⚠ {{ error() }}</div>
    }

    @if (data(); as d) {
      <!-- Chỉ số chính -->
      <div class="tiles">
        <div class="tile adm-box online">
          <span class="lbl"><i class="dot"></i>Đang truy cập</span>
          <strong>{{ d.online.count }}</strong>
          <small>người trong 75 giây qua</small>
        </div>
        <div class="tile adm-box">
          <span class="lbl">Hôm nay</span>
          <strong>{{ fmt(d.today.views) }}</strong>
          <small>lượt xem · {{ fmt(d.today.visitors) }} khách</small>
        </div>
        <div class="tile adm-box">
          <span class="lbl">{{ rangeLabel() }}</span>
          <strong>{{ fmt(d.inRange.views) }}</strong>
          <small>lượt xem · {{ fmt(d.inRange.visitors) }} khách</small>
        </div>
        <div class="tile adm-box">
          <span class="lbl">Từ trước đến nay</span>
          <strong>{{ fmt(d.total.views) }}</strong>
          <small>lượt xem · {{ fmt(d.total.visitors) }} khách</small>
        </div>
      </div>

      <!-- Biểu đồ -->
      <section class="adm-box chart-box">
        <div class="chart-head">
          <div class="seg" role="group" aria-label="Khoảng thời gian">
            @for (r of ranges; track r.key) {
              <button type="button" [class.on]="range() === r.key" (click)="setRange(r.key)">
                {{ r.label }} <small>{{ r.step }}</small>
              </button>
            }
          </div>
          <div class="legend">
            <span><i class="sw views"></i>Lượt xem</span>
            <span><i class="sw visitors"></i>Khách (không trùng)</span>
            <button type="button" class="link" (click)="asTable.set(!asTable())">{{ asTable() ? '📈 Xem biểu đồ' : '📋 Xem dạng bảng' }}</button>
          </div>
        </div>

        @if (!asTable()) {
          <div class="chart" (pointerleave)="hover.set(-1)">
            <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" role="img"
              [attr.aria-label]="'Biểu đồ lượt xem và khách, ' + rangeLabel()" (pointermove)="onMove($event)">
              @for (g of chart().grid; track g.v) {
                <line class="grid" [attr.x1]="PL" [attr.x2]="W - PR" [attr.y1]="g.y" [attr.y2]="g.y" />
              }
              <path class="area" [attr.d]="chart().area" />
              <path class="line views" [attr.d]="chart().views" />
              <path class="line visitors" [attr.d]="chart().visitors" />
              @if (hover() >= 0 && chart().pts[hover()]; as p) {
                <line class="cross" [attr.x1]="p.x" [attr.x2]="p.x" [attr.y1]="PT" [attr.y2]="H - PB" />
                <circle class="dot views" [attr.cx]="p.x" [attr.cy]="p.yv" r="4.5" />
                <circle class="dot visitors" [attr.cx]="p.x" [attr.cy]="p.yu" r="4.5" />
              }
            </svg>
            <!-- Trục Y / X bằng HTML để chữ không bị kéo giãn -->
            @for (g of chart().grid; track g.v) {
              <span class="ytick" [style.top.%]="(g.y / H) * 100">{{ fmt(g.v) }}</span>
            }
            @for (x of chart().xticks; track x.x) {
              <span class="xtick" [style.left.%]="(x.x / W) * 100">{{ x.label }}</span>
            }
            @if (hover() >= 0 && chart().pts[hover()]; as p) {
              <div class="tip" [style.left.%]="(p.x / W) * 100" [class.flip]="p.x > W * 0.7">
                <b>{{ bucketLabel(p.t) }}</b>
                <span><i class="sw views"></i><strong>{{ fmt(p.views) }}</strong> lượt xem</span>
                <span><i class="sw visitors"></i><strong>{{ fmt(p.visitors) }}</strong> khách</span>
              </div>
            }
          </div>
        } @else {
          <div class="adm-table-wrap table-view">
            <table class="adm-table">
              <thead><tr><th>Thời gian</th><th>Lượt xem</th><th>Khách</th></tr></thead>
              <tbody>
                @for (p of points().slice().reverse(); track p.t) {
                  <tr><td>{{ bucketLabel(p.t) }}</td><td>{{ fmt(p.views) }}</td><td>{{ fmt(p.visitors) }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      <div class="two">
        <!-- Đang online -->
        <section class="adm-box">
          <h2>🟢 Đang truy cập ({{ d.online.count }})</h2>
          @if (d.online.list.length) {
            <ul class="olist">
              @for (o of d.online.list; track o.vid) {
                <li>
                  <span class="path" [title]="o.path">{{ o.path }}</span>
                  <span class="meta">{{ o.ip || '—' }} · {{ dev(o.ua) }} · {{ ago(o.lastSeen, d.now) }}</span>
                </li>
              }
            </ul>
          } @else {
            <p class="none">Hiện chưa có ai đang xem web.</p>
          }
        </section>

        <!-- Trang xem nhiều -->
        <section class="adm-box">
          <h2>📄 Trang xem nhiều · {{ rangeLabel() }}</h2>
          @if (d.top.length) {
            <ul class="top">
              @for (t of d.top; track t.path) {
                <li>
                  <span class="path" [title]="t.path">{{ t.path }}</span>
                  <span class="bar"><i [style.width.%]="(t.views / d.top[0].views) * 100"></i></span>
                  <strong>{{ fmt(t.views) }}</strong>
                </li>
              }
            </ul>
          } @else {
            <p class="none">Chưa có lượt xem nào trong khoảng này.</p>
          }
        </section>
      </div>

      <!-- IP gần nhất -->
      <section class="adm-box">
        <h2>🌐 Lượt truy cập gần nhất (IP)</h2>
        <div class="adm-table-wrap latest-wrap">
          <table class="adm-table latest">
            <thead><tr><th>Thời gian</th><th>IP</th><th>Trang</th><th>Thiết bị</th><th class="ref">Đến từ</th></tr></thead>
            <tbody>
              @for (v of d.latest; track $index) {
                <tr>
                  <td class="nowrap">{{ timeLabel(v.at, d.now) }}</td>
                  <td class="mono">{{ v.ip || '—' }}</td>
                  <td class="path" [title]="v.path">{{ v.path }}</td>
                  <td class="nowrap">{{ dev(v.ua) }}</td>
                  <td class="ref" [title]="v.ref">{{ host(v.ref) }}</td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="empty">Chưa có lượt truy cập nào.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    } @else if (loading()) {
      <p class="none">Đang tải số liệu…</p>
    }
  `,
  styles: `
    .live { display: inline-flex; align-items: center; gap: 6px; font-size: .8rem; color: #2e7d32; font-weight: 700; }
    .live i { width: 8px; height: 8px; border-radius: 50%; background: #2e7d32; animation: pulse 1.6s infinite; }
    .live.off { color: #8c8f94; }
    .live.off i { background: #8c8f94; animation: none; }
    @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(46,125,50,.5); } 70% { box-shadow: 0 0 0 8px rgba(46,125,50,0); } 100% { box-shadow: 0 0 0 0 rgba(46,125,50,0); } }

    .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 16px; }
    .tile { padding: 14px 16px; display: flex; flex-direction: column; gap: 2px; }
    .tile .lbl { font-size: .8rem; font-weight: 700; color: #50575e; display: flex; align-items: center; gap: 6px; }
    .tile strong { font-size: 2rem; line-height: 1.15; color: #1d2327; font-variant-numeric: tabular-nums; }
    .tile small { color: #646970; font-size: .8rem; }
    .tile.online { border-left: 4px solid #2e7d32; }
    .tile .dot { width: 9px; height: 9px; border-radius: 50%; background: #2e7d32; animation: pulse 1.6s infinite; }

    .chart-box { padding: 14px 16px 16px; margin-bottom: 16px; }
    .chart-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
    .seg { display: inline-flex; border: 1px solid #c3c4c7; border-radius: 8px; overflow: hidden; }
    .seg button { border: 0; border-right: 1px solid #c3c4c7; background: #fff; padding: 6px 12px; font: inherit; font-size: .85rem; font-weight: 700; cursor: pointer; color: #1d2327; }
    .seg button:last-child { border-right: 0; }
    .seg button small { display: block; font-weight: 500; font-size: .68rem; color: #646970; }
    .seg button.on { background: #2271b1; color: #fff; }
    .seg button.on small { color: #dbe9f6; }
    .legend { display: flex; align-items: center; gap: 14px; font-size: .82rem; color: #3c434a; flex-wrap: wrap; }
    .legend span { display: inline-flex; align-items: center; gap: 6px; }
    .sw { display: inline-block; width: 14px; height: 3px; border-radius: 2px; }
    .sw.views { background: #2271b1; }
    .sw.visitors { background: #d97706; }
    .link { border: 0; background: none; color: #2271b1; font: inherit; font-weight: 700; cursor: pointer; padding: 0; }

    .chart { position: relative; height: 260px; margin: 6px 0 22px 40px; touch-action: pan-y; }
    svg { width: 100%; height: 100%; display: block; overflow: visible; cursor: crosshair; }
    .grid { stroke: #f0f0f1; stroke-width: 1; vector-effect: non-scaling-stroke; }
    .area { fill: rgba(34,113,177,.1); }
    .line { fill: none; stroke-width: 2; vector-effect: non-scaling-stroke; stroke-linejoin: round; stroke-linecap: round; }
    .line.views { stroke: #2271b1; }
    .line.visitors { stroke: #d97706; }
    .cross { stroke: #8c8f94; stroke-width: 1; stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
    .dot { stroke: #fff; stroke-width: 2; vector-effect: non-scaling-stroke; }
    .dot.views { fill: #2271b1; }
    .dot.visitors { fill: #d97706; }
    .ytick { position: absolute; left: -44px; width: 38px; text-align: right; transform: translateY(-50%); font-size: .7rem; color: #646970; font-variant-numeric: tabular-nums; }
    .xtick { position: absolute; bottom: -20px; transform: translateX(-50%); font-size: .7rem; color: #646970; white-space: nowrap; }
    .tip {
      position: absolute; top: 4px; transform: translateX(12px); pointer-events: none; z-index: 2;
      background: #1d2327; color: #fff; border-radius: 8px; padding: 8px 10px; font-size: .78rem; display: flex; flex-direction: column; gap: 3px;
      box-shadow: 0 6px 18px rgba(0,0,0,.2); white-space: nowrap;
    }
    .tip.flip { transform: translateX(calc(-100% - 12px)); }
    .tip span { display: flex; align-items: center; gap: 6px; }
    .tip strong { font-variant-numeric: tabular-nums; }
    .table-view { max-height: 300px; overflow-y: auto; }

    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    h2 { font-size: 1rem; margin: 0; padding: 12px 16px; border-bottom: 1px solid #dcdcde; }
    .olist, .top { list-style: none; margin: 0; padding: 6px 16px 12px; max-height: 320px; overflow-y: auto; }
    .olist li { display: flex; flex-direction: column; padding: 7px 0; border-bottom: 1px solid #f0f0f1; }
    .olist .meta { font-size: .78rem; color: #646970; }
    .path { font-weight: 700; color: #1d2327; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .top li { display: grid; grid-template-columns: minmax(0, 1fr) 90px 44px; align-items: center; gap: 10px; padding: 6px 0; font-size: .88rem; }
    .top strong { text-align: right; font-variant-numeric: tabular-nums; }
    .bar { height: 8px; background: #f0f0f1; border-radius: 4px; overflow: hidden; }
    .bar i { display: block; height: 100%; background: #2271b1; border-radius: 4px; }
    .none { padding: 16px; margin: 0; color: #646970; }
    .latest-wrap { max-height: 520px; overflow-y: auto; }
    .latest-wrap thead th { position: sticky; top: 0; z-index: 1; }
    .latest .mono { font-family: ui-monospace, Consolas, monospace; font-size: .82rem; }
    .latest .path { max-width: 260px; font-weight: 600; }
    .latest .ref { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #646970; }
    .nowrap { white-space: nowrap; }

    @media (max-width: 1000px) {
      .tiles { grid-template-columns: 1fr 1fr; }
      .two { grid-template-columns: 1fr; }
    }
    @media (max-width: 600px) {
      .tiles { gap: 10px; }
      .tile { padding: 10px 12px; }
      .tile strong { font-size: 1.5rem; }
      .chart { height: 200px; margin-left: 32px; }
      .ytick { left: -36px; width: 30px; }
      .seg button { padding: 5px 8px; font-size: .78rem; }
      .latest .ref { display: none; }
      .latest .path { max-width: 120px; }
    }
    @media (prefers-reduced-motion: reduce) { .live i, .tile .dot { animation: none; } }
  `,
})
export class AdminAnalytics {
  private readonly api = inject(OrderApiService);

  readonly W = 800;
  readonly H = 260;
  readonly PL = 0;
  readonly PR = 0;
  readonly PT = 10;
  readonly PB = 2;

  readonly ranges: { key: RangeKey; label: string; step: string }[] = [
    { key: 'hour', label: '60 phút', step: 'mỗi 1 phút' },
    { key: 'day', label: '24 giờ', step: 'mỗi giờ' },
    { key: 'month', label: '30 ngày', step: 'mỗi ngày' },
    { key: 'all', label: 'Toàn bộ', step: 'mỗi tháng' },
  ];

  readonly range = signal<RangeKey>('hour');
  readonly data = signal<Stats | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly auto = signal(true);
  readonly asTable = signal(false);
  readonly hover = signal(-1);

  readonly rangeLabel = computed(() => ({ hour: '60 phút qua', day: '24 giờ qua', month: '30 ngày qua', all: 'Toàn bộ' })[this.range()]);

  /** Chuỗi điểm đầy đủ (điền 0 cho phút / giờ / ngày không có ai). */
  readonly points = computed<Point[]>(() => {
    const d = this.data();
    if (!d) return [];
    const by = new Map(d.series.map((p) => [p.t, p]));
    const end = trunc(d.now, d.unit);
    let start = d.from;
    // "Toàn bộ": bắt đầu từ tháng có dữ liệu đầu tiên (ít nhất 6 tháng cho dễ nhìn).
    if (d.range === 'all') {
      const first = d.series[0]?.t ?? end;
      start = Math.min(first, trunc(end - 150 * 86_400_000, 'month'));
    }
    const out: Point[] = [];
    for (let t = start, i = 0; t <= end && i < 400; t = next(t, d.unit), i++) {
      const p = by.get(t);
      out.push({ t, views: p?.views ?? 0, visitors: p?.visitors ?? 0 });
    }
    return out;
  });

  readonly chart = computed(() => {
    const pts = this.points();
    const max = niceMax(Math.max(1, ...pts.map((p) => p.views)));
    const n = Math.max(1, pts.length - 1);
    const x = (i: number) => this.PL + (i / n) * (this.W - this.PL - this.PR);
    const y = (v: number) => this.H - this.PB - (v / max) * (this.H - this.PT - this.PB);
    const mapped = pts.map((p, i) => ({ ...p, x: x(i), yv: y(p.views), yu: y(p.visitors) }));
    const line = (key: 'yv' | 'yu') => mapped.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p[key].toFixed(1)}`).join('');
    const views = line('yv');
    const area = mapped.length ? `${views}L${mapped[mapped.length - 1].x.toFixed(1)},${this.H - this.PB}L${mapped[0].x.toFixed(1)},${this.H - this.PB}Z` : '';
    const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: Math.round(max * f), y: y(max * f) }));
    // Khoảng 6 nhãn trục X.
    const every = Math.max(1, Math.ceil(mapped.length / 6));
    const xticks = mapped.filter((_, i) => i % every === 0).map((p) => ({ x: p.x, label: this.tickLabel(p.t) }));
    return { pts: mapped, views, visitors: line('yu'), area, grid, xticks };
  });

  private timer?: ReturnType<typeof setInterval>;

  constructor() {
    void this.load();
    this.timer = setInterval(() => {
      if (this.auto() && document.visibilityState === 'visible') void this.load(true);
    }, REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
  }

  setRange(r: RangeKey): void {
    if (r === this.range()) return;
    this.range.set(r);
    this.hover.set(-1);
    void this.load();
  }

  async load(quiet = false): Promise<void> {
    if (!this.api.adminKey()) {
      this.error.set('Chưa có mã quản trị — vào trang Đơn hàng để nhập mã, rồi quay lại đây.');
      return;
    }
    if (!quiet) this.loading.set(true);
    try {
      const d = await this.api.call<Stats>('GET', `/api/analytics?range=${this.range()}`, undefined, true, { timeoutMs: 20000 });
      this.data.set(d);
      this.error.set('');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Không tải được số liệu.');
    } finally {
      this.loading.set(false);
    }
  }

  onMove(e: PointerEvent): void {
    const svg = e.currentTarget as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const n = this.chart().pts.length;
    if (!n || !r.width) return;
    const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
    this.hover.set(Math.max(0, Math.min(n - 1, i)));
  }

  fmt(n: number): string {
    return n.toLocaleString('vi-VN');
  }

  dev(ua: string): string {
    return device(ua);
  }

  host(ref: string): string {
    if (!ref) return 'Trực tiếp';
    try {
      return new URL(ref).hostname.replace(/^www\./, '');
    } catch {
      return ref;
    }
  }

  tickLabel(t: number): string {
    const p = vnParts(t);
    const unit = this.data()?.unit;
    if (unit === 'minute' || unit === 'hour') return `${pad(p.h)}:${pad(p.mi)}`;
    if (unit === 'day') return `${pad(p.d)}/${pad(p.mo)}`;
    return `${pad(p.mo)}/${p.y}`;
  }

  bucketLabel(t: number): string {
    const p = vnParts(t);
    const unit = this.data()?.unit;
    if (unit === 'minute') return `${pad(p.h)}:${pad(p.mi)} · ${pad(p.d)}/${pad(p.mo)}`;
    if (unit === 'hour') return `${pad(p.h)}:00 – ${pad(p.h)}:59 · ${pad(p.d)}/${pad(p.mo)}`;
    if (unit === 'day') return `${pad(p.d)}/${pad(p.mo)}/${p.y}`;
    return `Tháng ${p.mo}/${p.y}`;
  }

  ago(t: number, now: number): string {
    const s = Math.max(0, Math.round((now - t) / 1000));
    return s < 5 ? 'vừa xong' : `${s} giây trước`;
  }

  timeLabel(t: number, now: number): string {
    const s = Math.round((now - t) / 1000);
    if (s < 60) return `${Math.max(0, s)} giây trước`;
    if (s < 3600) return `${Math.round(s / 60)} phút trước`;
    const p = vnParts(t);
    return `${pad(p.h)}:${pad(p.mi)} ${pad(p.d)}/${pad(p.mo)}`;
  }
}

import { AfterViewInit, Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Order } from '../../models/order';
import { ApiError, OrderApiService } from '../../services/order-api.service';
import { VndPipe } from '../../shared/vnd.pipe';
import { provinceFromAddress } from '../../shared/vn-provinces';

/* Leaflet + leaflet.heat tải từ CDN khi cần (không làm nặng bản build). */
type LMap = { remove(): void; fitBounds(b: unknown, o?: unknown): void; setView(c: [number, number], z: number): void; invalidateSize(): void };
type LLayer = { addTo(m: LMap): LLayer; remove(): void };
interface LeafletNs {
  map(el: HTMLElement, o?: unknown): LMap;
  tileLayer(url: string, o?: unknown): LLayer;
  heatLayer(points: [number, number, number][], o?: unknown): LLayer;
  circleMarker(c: [number, number], o?: unknown): LLayer & { bindTooltip(t: string, o?: unknown): LLayer };
  layerGroup(l?: LLayer[]): LLayer;
  latLngBounds(c: [number, number][]): unknown;
}
const LEAFLET_CSS = '/vendor/leaflet/leaflet.css';
let leafletPromise: Promise<LeafletNs> | null = null;

/** Tải Leaflet + leaflet.heat (đóng gói sẵn trong web, chỉ tải khi mở Bảng tin). */
function loadLeaflet(): Promise<LeafletNs> {
  leafletPromise ??= (async () => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = LEAFLET_CSS;
      document.head.appendChild(l);
    }
    const mod = (await import('leaflet')) as unknown as { default?: LeafletNs } & LeafletNs;
    const L = mod.default ?? mod;
    // leaflet.heat gắn thêm heatLayer vào biến toàn cục L.
    (window as unknown as { L: LeafletNs }).L = L;
    await import('leaflet.heat');
    return (window as unknown as { L: LeafletNs }).L;
  })().catch((e) => {
    leafletPromise = null;
    throw e instanceof Error ? e : new Error('Không tải được thư viện bản đồ.');
  });
  return leafletPromise;
}

interface Place {
  name: string;
  lat: number;
  lon: number;
  orders: number;
  revenue: number;
  /** 'ip' = theo IP lúc đặt, 'address' = đoán từ địa chỉ giao hàng. */
  source: 'ip' | 'address';
}

const RANGES = [
  { days: 30, label: '30 ngày' },
  { days: 90, label: '90 ngày' },
  { days: 0, label: 'Tất cả' },
];

/** Bảng tin: bản đồ nhiệt nơi khách đặt hàng (theo IP lúc đặt; đơn cũ không có IP thì theo địa chỉ giao hàng). */
@Component({
  selector: 'app-order-heatmap',
  imports: [VndPipe],
  template: `
    <section class="adm-box">
      <h2>
        🗺 Khách đặt hàng ở đâu
        <span class="tools">
          <span class="seg" role="radiogroup" aria-label="Khoảng thời gian">
            @for (r of ranges; track r.days) {
              <button type="button" role="radio" [attr.aria-checked]="days() === r.days" [class.on]="days() === r.days" (click)="days.set(r.days)">{{ r.label }}</button>
            }
          </span>
          <span class="seg" role="radiogroup" aria-label="Đo theo">
            <button type="button" role="radio" [attr.aria-checked]="metric() === 'orders'" [class.on]="metric() === 'orders'" (click)="metric.set('orders')">Số đơn</button>
            <button type="button" role="radio" [attr.aria-checked]="metric() === 'revenue'" [class.on]="metric() === 'revenue'" (click)="metric.set('revenue')">Doanh thu</button>
          </span>
        </span>
      </h2>
      <div class="box-body">
        @if (error()) {
          <p class="err">{{ error() }}</p>
        } @else {
          <div class="wrap">
            <div class="map" #map aria-label="Bản đồ nhiệt đơn hàng"></div>
            <div class="side">
              <h3>Khu vực đặt nhiều</h3>
              @if (places().length) {
                <ol class="rank">
                  @for (p of places().slice(0, 10); track p.name) {
                    <li [title]="p.name + ': ' + p.orders + ' đơn · ' + (p.revenue | vnd)">
                      <span class="nm">{{ p.name }}@if (p.source === 'address') { <i title="Đoán từ địa chỉ giao hàng">🏠</i> }</span>
                      <span class="track"><span class="fill" [style.width.%]="share(p)"></span></span>
                      <b>{{ metric() === 'orders' ? p.orders + ' đơn' : (p.revenue | vnd) }}</b>
                    </li>
                  }
                </ol>
              } @else if (!loading()) {
                <p class="hint">Chưa có đơn hàng trong khoảng này.</p>
              }
              <p class="hint">
                {{ stats().ip }} đơn theo IP lúc đặt · {{ stats().address }} đơn đoán từ địa chỉ (🏠) · {{ stats().unknown }} đơn chưa xác định được.
              </p>
            </div>
          </div>
          <p class="hint">Vị trí theo IP là ước tính (thường đúng tới tỉnh / thành phố). Đơn đặt trước khi có tính năng này được đoán theo địa chỉ giao hàng. Không tính đơn đã huỷ.</p>
        }
      </div>
    </section>
  `,
  styles: `
    h2 { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
    .tools { display: flex; gap: 8px; flex-wrap: wrap; font-size: .8rem; font-weight: 400; }
    .seg { display: inline-flex; border: 1px solid #c3c4c7; border-radius: 8px; overflow: hidden; }
    .seg button { border: 0; border-right: 1px solid #c3c4c7; background: #fff; padding: 5px 10px; font: inherit; cursor: pointer; }
    .seg button:last-child { border-right: 0; }
    .seg button.on { background: #2271b1; color: #fff; font-weight: 700; }
    .wrap { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(240px, 1fr); gap: 16px; }
    .map { height: 380px; border-radius: 10px; border: 1px solid #dcdcde; background: #eef3f7; z-index: 0; }
    h3 { margin: 0 0 8px; font-size: .95rem; }
    .rank { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; counter-reset: r; }
    .rank li { display: grid; grid-template-columns: minmax(90px, 40%) 1fr auto; gap: 8px; align-items: center; font-size: .85rem; counter-increment: r; }
    .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    .nm::before { content: counter(r) '. '; color: #646970; }
    .nm i { font-style: normal; font-size: .75rem; margin-left: 4px; }
    .track { height: 10px; background: #f0f0f1; border-radius: 4px; overflow: hidden; }
    .fill { display: block; height: 100%; background: #d7301f; border-radius: 0 4px 4px 0; min-width: 2px; }
    .rank b { font-size: .8rem; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .hint { color: #646970; font-size: .78rem; margin: 8px 0 0; }
    .err { color: #b32d2e; }
    @media (max-width: 800px) { .wrap { grid-template-columns: 1fr; } .map { height: 300px; } }
  `,
})
export class OrderHeatmapComponent implements AfterViewInit {
  private readonly api = inject(OrderApiService);
  private readonly el = viewChild<ElementRef<HTMLElement>>('map');
  readonly ranges = RANGES;
  readonly days = signal(90);
  readonly metric = signal<'orders' | 'revenue'>('orders');
  readonly orders = signal<Order[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  private L?: LeafletNs;
  private map?: LMap;
  private layers: LLayer[] = [];

  constructor() {
    void this.api
      .list()
      .then((r) => this.orders.set(r.orders))
      .catch((e) =>
        this.error.set(e instanceof ApiError && (e.status === 404 || e.status === 0) ? 'Bản đồ chỉ có khi web chạy trên Vercel (cần máy chủ đơn hàng).' : e instanceof Error ? e.message : 'Không tải được đơn hàng.'),
      )
      .finally(() => this.loading.set(false));
    effect(() => {
      this.places();
      this.metric();
      this.draw();
    });
    inject(DestroyRef).onDestroy(() => this.map?.remove());
  }

  async ngAfterViewInit(): Promise<void> {
    try {
      this.L = await loadLeaflet();
      const el = this.el()?.nativeElement;
      if (!el) return;
      this.map = this.L.map(el, { scrollWheelZoom: false, attributionControl: true });
      this.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 12,
        attribution: '&copy; OpenStreetMap',
      }).addTo(this.map);
      this.map.setView([16.2, 106.3], 5);
      this.draw();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Không tải được bản đồ.');
    }
  }

  /** Gộp đơn theo nơi đặt. */
  readonly grouped = computed(() => {
    const d = this.days();
    const from = d ? Date.now() - d * 86_400_000 : 0;
    const map = new Map<string, Place>();
    let ip = 0;
    let address = 0;
    let unknown = 0;
    for (const o of this.orders()) {
      if (o.status === 'cancelled' || o.createdAt < from) continue;
      const g = o.customer.geo;
      let place: Omit<Place, 'orders' | 'revenue'> | null = null;
      if (g && g.lat !== null && g.lon !== null) {
        place = { name: g.city || g.region || g.country || 'Không rõ', lat: g.lat, lon: g.lon, source: 'ip' };
        ip++;
      } else {
        const p = provinceFromAddress(o.customer.address);
        if (p) {
          place = { name: p.name, lat: p.lat, lon: p.lon, source: 'address' };
          address++;
        } else unknown++;
      }
      if (!place) continue;
      const key = `${place.name}|${place.lat.toFixed(2)}|${place.lon.toFixed(2)}`;
      const cur = map.get(key) ?? { ...place, orders: 0, revenue: 0 };
      cur.orders++;
      cur.revenue += o.total;
      map.set(key, cur);
    }
    return { list: [...map.values()], stats: { ip, address, unknown } };
  });
  readonly stats = computed(() => this.grouped().stats);
  readonly places = computed(() => {
    const k = this.metric();
    return [...this.grouped().list].sort((a, b) => b[k] - a[k]);
  });

  share(p: Place): number {
    const max = this.places()[0]?.[this.metric()] ?? 0;
    return max ? Math.max(2, (p[this.metric()] / max) * 100) : 0;
  }

  private draw(): void {
    const L = this.L;
    const map = this.map;
    if (!L || !map) return;
    this.layers.forEach((l) => l.remove());
    this.layers = [];
    const list = this.places();
    if (!list.length) return;
    const k = this.metric();
    const max = Math.max(...list.map((p) => p[k]));
    // Nhiệt một tông màu (cam nhạt → đỏ đậm), không dùng cầu vồng.
    const heat = L.heatLayer(
      list.map((p) => [p.lat, p.lon, Math.max(0.35, p[k] / max)] as [number, number, number]),
      { radius: 34, blur: 20, maxZoom: 9, max: 1, minOpacity: 0.45, gradient: { 0.25: '#fdd49e', 0.5: '#fc8d59', 0.75: '#d7301f', 1: '#7f0000' } },
    ).addTo(map);
    // Điểm trong suốt để rê chuột xem số liệu.
    const dots = list.map((p) =>
      L.circleMarker([p.lat, p.lon], { radius: 12, stroke: false, fillOpacity: 0 })
        .bindTooltip(`<b>${p.name}</b><br>${p.orders} đơn · ${p.revenue.toLocaleString('vi-VN')} ₫${p.source === 'address' ? '<br><small>Đoán từ địa chỉ giao hàng</small>' : ''}`, { direction: 'top' })
        .addTo(map),
    );
    this.layers = [heat, ...dots];
    if (list.length > 1) map.fitBounds(L.latLngBounds(list.map((p) => [p.lat, p.lon])), { padding: [30, 30], maxZoom: 8 });
    else map.setView([list[0].lat, list[0].lon], 7);
  }
}

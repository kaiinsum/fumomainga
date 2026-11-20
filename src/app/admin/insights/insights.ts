import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { GAMES } from '../../models/minigames';
import { Order } from '../../models/order';
import { ApiError, OrderApiService } from '../../services/order-api.service';
import { ProductService } from '../../services/product.service';
import { NewsService } from '../../services/news.service';
import { newsPath } from '../../models/news';
import { VndPipe } from '../../shared/vnd.pipe';

interface GameStat {
  game: string;
  players: number;
  plays: number;
  seconds: number;
}
interface PageStat {
  path: string;
  views: number;
  visitors: number;
}
interface ProductRow {
  key: string;
  name: string;
  image: string;
  link: string;
  qty: number;
  revenue: number;
  orders: number;
  views: number;
  visitors: number;
}

const RANGES = [
  { days: 7, label: '7 ngày' },
  { days: 30, label: '30 ngày' },
  { days: 90, label: '90 ngày' },
  { days: 0, label: 'Tất cả' },
];

/** "1 giờ 5 phút", "12 phút", "40 giây". */
export function fmtDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} giây`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  return `${h} giờ${m % 60 ? ' ' + (m % 60) + ' phút' : ''}`;
}

/** Admin → Hiệu suất: minigame (người chơi, thời gian chơi) và sản phẩm (đặt nhiều, doanh thu, lượt xem). */
@Component({
  selector: 'app-admin-insights',
  imports: [DecimalPipe, RouterLink, VndPipe],
  template: `
    <div class="adm-head">
      <h1>Hiệu suất</h1>
      <div class="seg" role="radiogroup" aria-label="Khoảng thời gian">
        @for (r of ranges; track r.days) {
          <button type="button" role="radio" [attr.aria-checked]="days() === r.days" [class.on]="days() === r.days" (click)="setDays(r.days)">{{ r.label }}</button>
        }
      </div>
      <button class="btn ghost small" type="button" (click)="load()" [disabled]="loading()">{{ loading() ? 'Đang tải…' : '↻ Tải lại' }}</button>
    </div>

    <!-- ================= MINIGAME ================= -->
    <section class="adm-box">
      <h2>🎮 Minigame</h2>
      <div class="box-body">
        @if (gameError()) {
          <p class="err">{{ gameError() }}</p>
        } @else {
          <div class="tiles">
            <div class="tile"><span>Người chơi</span><b>{{ gameTotals().players | number }}</b><small>khách khác nhau (cộng theo từng game)</small></div>
            <div class="tile"><span>Lượt chơi</span><b>{{ gameTotals().plays | number }}</b><small>lần vào trang game</small></div>
            <div class="tile"><span>Tổng thời gian chơi</span><b>{{ dur(gameTotals().seconds) }}</b><small>chỉ tính lúc đang chơi thật</small></div>
            <div class="tile"><span>Chơi lâu nhất</span><b>{{ gameRows()[0]?.title ?? '—' }}</b><small>{{ gameRows()[0] ? dur(gameRows()[0].seconds) : 'chưa có dữ liệu' }}</small></div>
          </div>

          @if (gameRows().length) {
            <h3>Thời gian chơi theo game</h3>
            <div class="bars" role="list">
              @for (g of gameRows(); track g.game) {
                <div class="bar-row" role="listitem" [title]="g.title + ': ' + dur(g.seconds) + ' · ' + g.players + ' người chơi · ' + g.plays + ' lượt'">
                  <span class="lbl">{{ g.icon }} {{ g.title }}</span>
                  <span class="track"><span class="fill" [style.width.%]="pct(g.seconds, maxGameSec())"></span></span>
                  <span class="val">{{ dur(g.seconds) }}</span>
                </div>
              }
            </div>

            <div class="adm-table-wrap">
              <table class="adm-table">
                <thead><tr><th>Game</th><th class="num">Người chơi</th><th class="num">Lượt chơi</th><th class="num">Tổng thời gian</th><th class="num">TB / người</th><th class="num">TB / lượt</th></tr></thead>
                <tbody>
                  @for (g of gameRows(); track g.game) {
                    <tr>
                      <td><b>{{ g.icon }} {{ g.title }}</b></td>
                      <td class="num">{{ g.players | number }}</td>
                      <td class="num">{{ g.plays | number }}</td>
                      <td class="num">{{ dur(g.seconds) }}</td>
                      <td class="num">{{ dur(g.players ? g.seconds / g.players : 0) }}</td>
                      <td class="num">{{ dur(g.plays ? g.seconds / g.plays : 0) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else if (!loading()) {
            <p class="hint">Chưa có ai chơi minigame trong khoảng này.</p>
          }
          <p class="hint">Thời gian chơi <b>không tính lúc treo máy</b>: chỉ đếm khi tab đang hiện và khách có thao tác (chuột, phím, chạm) trong 20 giây gần nhất. Số liệu trước bản cập nhật này vẫn tính theo thời gian mở trang.</p>
        }
      </div>
    </section>

    <!-- ================= BÀI VIẾT ================= -->
    <section class="adm-box">
      <h2>📰 Bài viết</h2>
      <div class="box-body">
        @if (gameError()) {
          <p class="err">{{ gameError() }}</p>
        } @else {
          <div class="tiles">
            <div class="tile"><span>Lượt đọc</span><b>{{ newsTotals().plays | number }}</b><small>lần mở bài viết</small></div>
            <div class="tile"><span>Người đọc</span><b>{{ newsTotals().players | number }}</b><small>khách khác nhau (cộng theo từng bài)</small></div>
            <div class="tile"><span>Thời gian đọc TB</span><b>{{ dur(newsTotals().plays ? newsTotals().seconds / newsTotals().plays : 0) }}</b><small>mỗi lượt đọc</small></div>
            <div class="tile"><span>Xem nhiều nhất</span><b [title]="newsTop()[0]?.title ?? ''">{{ newsTop()[0]?.title ?? '—' }}</b><small>{{ newsTop()[0] ? newsTop()[0].plays + ' lượt' : 'chưa có dữ liệu' }}</small></div>
          </div>
          @if (newsRows().length) {
            <h3>Lượt xem theo bài</h3>
            <div class="bars" role="list">
              @for (n of newsTop(); track n.slug) {
                <div class="bar-row" role="listitem" [title]="n.title + ': ' + n.plays + ' lượt · ' + n.players + ' người · TB ' + dur(n.avg)">
                  <span class="lbl">@if (n.cover) { <img [src]="n.cover" alt="" /> }{{ n.title }}</span>
                  <span class="track"><span class="fill" [style.width.%]="pct(n.plays, newsTop()[0].plays)"></span></span>
                  <span class="val">{{ n.plays | number }}</span>
                </div>
              }
            </div>
            <div class="adm-table-wrap">
              <table class="adm-table">
                <thead>
                  <tr>
                    <th>Bài viết</th>
                    <th class="num sort" (click)="newsSort.set('plays')" [class.on]="newsSort() === 'plays'">Lượt xem</th>
                    <th class="num sort" (click)="newsSort.set('players')" [class.on]="newsSort() === 'players'">Người đọc</th>
                    <th class="num sort" (click)="newsSort.set('avg')" [class.on]="newsSort() === 'avg'">Ở lại TB</th>
                    <th class="num sort" (click)="newsSort.set('seconds')" [class.on]="newsSort() === 'seconds'">Tổng thời gian</th>
                  </tr>
                </thead>
                <tbody>
                  @for (n of newsRows(); track n.slug) {
                    <tr>
                      <td class="pname">@if (n.cover) { <img [src]="n.cover" alt="" /> }@if (n.link) { <a [routerLink]="n.link">{{ n.title }}</a> } @else { {{ n.title }} }</td>
                      <td class="num">{{ n.plays | number }}</td>
                      <td class="num">{{ n.players | number }}</td>
                      <td class="num">{{ dur(n.avg) }}</td>
                      <td class="num">{{ dur(n.seconds) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else if (!loading()) {
            <p class="hint">Chưa có lượt đọc bài viết trong khoảng này.</p>
          }
          <p class="hint">Thời gian ở lại chỉ tính khi tab đang hiện và khách có thao tác (cuộn, chuột, phím) trong 90 giây gần nhất. Bắt đầu ghi từ bản cập nhật này.</p>
        }
      </div>
    </section>

    <!-- ================= SẢN PHẨM ================= -->
    <section class="adm-box">
      <h2>🧸 Sản phẩm</h2>
      <div class="box-body">
        @if (orderError()) { <p class="err">{{ orderError() }}</p> }
        <div class="tiles">
          <div class="tile"><span>Đơn hoàn thành</span><b>{{ orderTotals().orders | number }}</b><small>không tính đơn huỷ / đang xử lý</small></div>
          <div class="tile"><span>Bé đã bán</span><b>{{ orderTotals().qty | number }}</b><small>tổng số lượng</small></div>
          <div class="tile"><span>Doanh thu</span><b>{{ orderTotals().revenue | vnd }}</b><small>đơn đã hoàn thành · <a routerLink="/admin/doanh-thu">xem lãi ròng →</a></small></div>
          <div class="tile"><span>Đặt nhiều nhất</span><b>{{ topQty()[0]?.name ?? '—' }}</b><small>{{ topQty()[0] ? topQty()[0].qty + ' bé' : 'chưa có đơn' }}</small></div>
        </div>

        <div class="cols">
          <div>
            <h3>🏆 Đặt nhiều nhất (số lượng)</h3>
            @if (topQty().length) {
              <div class="bars">
                @for (p of topQty(); track p.key) {
                  <div class="bar-row" [title]="p.name + ': ' + p.qty + ' bé · ' + p.orders + ' đơn'">
                    <span class="lbl"><img [src]="p.image" alt="" />{{ p.name }}</span>
                    <span class="track"><span class="fill" [style.width.%]="pct(p.qty, topQty()[0].qty)"></span></span>
                    <span class="val">{{ p.qty }}</span>
                  </div>
                }
              </div>
            } @else { <p class="hint">Chưa có đơn hàng trong khoảng này.</p> }
          </div>
          <div>
            <h3>💰 Doanh thu cao nhất</h3>
            @if (topRevenue().length) {
              <div class="bars">
                @for (p of topRevenue(); track p.key) {
                  <div class="bar-row" [title]="p.name + ': ' + (p.revenue | vnd)">
                    <span class="lbl"><img [src]="p.image" alt="" />{{ p.name }}</span>
                    <span class="track"><span class="fill" [style.width.%]="pct(p.revenue, topRevenue()[0].revenue)"></span></span>
                    <span class="val">{{ p.revenue | vnd }}</span>
                  </div>
                }
              </div>
            } @else { <p class="hint">Chưa có đơn hàng trong khoảng này.</p> }
          </div>
        </div>

        <h3>📋 Chi tiết từng sản phẩm</h3>
        @if (productRows().length) {
          <div class="adm-table-wrap">
            <table class="adm-table">
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th class="num sort" (click)="sort.set('qty')" [class.on]="sort() === 'qty'">Đã đặt</th>
                  <th class="num sort" (click)="sort.set('orders')" [class.on]="sort() === 'orders'">Số đơn</th>
                  <th class="num sort" (click)="sort.set('revenue')" [class.on]="sort() === 'revenue'">Doanh thu</th>
                  <th class="num sort" (click)="sort.set('views')" [class.on]="sort() === 'views'">Lượt xem</th>
                  <th class="num sort" (click)="sort.set('rate')" [class.on]="sort() === 'rate'" title="Số đơn / số khách xem">Tỉ lệ đặt</th>
                </tr>
              </thead>
              <tbody>
                @for (p of productRows(); track p.key) {
                  <tr>
                    <td class="pname">@if (p.image) { <img [src]="p.image" alt="" /> }@if (p.link) { <a [routerLink]="p.link">{{ p.name }}</a> } @else { {{ p.name }} }</td>
                    <td class="num">{{ p.qty | number }}</td>
                    <td class="num">{{ p.orders | number }}</td>
                    <td class="num">{{ p.revenue | vnd }}</td>
                    <td class="num">{{ p.views | number }}</td>
                    <td class="num">{{ p.visitors ? ((p.orders / p.visitors) * 100 | number: '1.0-1') + '%' : '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="hint">Bấm tiêu đề cột để sắp xếp. Tỉ lệ đặt = số đơn có sản phẩm ÷ số khách đã xem trang sản phẩm. Sản phẩm nhiều lượt xem nhưng ít đơn → nên xem lại giá / ảnh / mô tả.</p>
        } @else if (!loading()) {
          <p class="hint">Chưa có dữ liệu.</p>
        }
      </div>
    </section>
  `,
  styles: `
    .seg { display: inline-flex; border: 1px solid #c3c4c7; border-radius: 8px; overflow: hidden; }
    .seg button { border: 0; border-right: 1px solid #c3c4c7; background: #fff; padding: 6px 12px; font: inherit; font-size: .85rem; cursor: pointer; }
    .seg button:last-child { border-right: 0; }
    .seg button.on { background: #2271b1; color: #fff; font-weight: 700; }
    .err { color: #b32d2e; }
    .hint { color: #646970; font-size: .8rem; }
    h3 { margin: 16px 0 8px; font-size: .95rem; }
    .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .tile { padding: 12px 14px; border: 1px solid #dcdcde; border-radius: 10px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .tile span { font-size: .75rem; color: #646970; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; }
    .tile b { font-size: 1.35rem; color: #1d2327; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tile small { color: #646970; font-size: .75rem; }
    .bars { display: grid; gap: 6px; }
    .bar-row { display: grid; grid-template-columns: minmax(120px, 34%) 1fr auto; gap: 10px; align-items: center; padding: 2px 0; }
    .bar-row:hover .fill { background: #135e96; }
    .lbl { display: flex; align-items: center; gap: 6px; font-size: .85rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lbl img, .pname img { width: 24px; height: 24px; border-radius: 6px; object-fit: cover; flex: none; }
    .track { height: 14px; background: #f0f0f1; border-radius: 4px; overflow: hidden; }
    .fill { display: block; height: 100%; background: #2271b1; border-radius: 0 4px 4px 0; min-width: 2px; transition: width .4s ease; }
    .val { font-size: .82rem; font-weight: 700; color: #1d2327; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    th.sort { cursor: pointer; user-select: none; }
    th.sort.on { color: #2271b1; }
    th.sort.on::after { content: ' ▼'; font-size: .7em; }
    .pname { display: flex; align-items: center; gap: 8px; }
    @media (max-width: 900px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } .cols { grid-template-columns: 1fr; } }
    @media (max-width: 600px) { .adm-table th:nth-child(6), .adm-table td:nth-child(6) { display: none; } }
  `,
})
export class AdminInsights {
  private readonly api = inject(OrderApiService);
  private readonly productsSvc = inject(ProductService);
  readonly ranges = RANGES;
  readonly days = signal(30);
  readonly loading = signal(false);
  readonly gameError = signal('');
  readonly orderError = signal('');
  readonly games = signal<GameStat[]>([]);
  readonly news = signal<(GameStat & { slug: string })[]>([]);
  readonly newsSort = signal<'plays' | 'players' | 'avg' | 'seconds'>('plays');
  private readonly newsSvc = inject(NewsService);
  readonly views = signal<PageStat[]>([]);
  readonly orders = signal<Order[]>([]);
  readonly sort = signal<'qty' | 'orders' | 'revenue' | 'views' | 'rate'>('qty');
  readonly dur = fmtDuration;

  constructor() {
    void this.load();
  }

  setDays(d: number): void {
    this.days.set(d);
    void this.load();
  }

  pct(v: number, max: number): number {
    return max > 0 ? Math.max(1, (v / max) * 100) : 0;
  }

  readonly gameRows = computed(() => {
    const icon: Record<string, string> = { jp: '⌨️', gacha: '🎁', dle: '🔎', ninja: '🗡️', shmup: '🚀', crush: '💎', merge: '🫧', piano: '🎹' };
    return this.games()
      .map((g) => {
        const def = GAMES.find((d) => d.path === '/mini-game/' + g.game);
        return { ...g, title: def?.title ?? g.game, icon: def ? icon[def.art] ?? '🎮' : '🎮' };
      })
      .sort((a, b) => b.seconds - a.seconds);
  });
  readonly maxGameSec = computed(() => Math.max(0, ...this.gameRows().map((g) => g.seconds)));
  readonly gameTotals = computed(() =>
    this.games().reduce((t, g) => ({ players: t.players + g.players, plays: t.plays + g.plays, seconds: t.seconds + g.seconds }), { players: 0, plays: 0, seconds: 0 }),
  );

  /** Bài viết: gộp theo bài (slug hoặc id), kèm tiêu đề / ảnh bìa. */
  readonly newsRows = computed(() => {
    const posts = this.newsSvc.posts();
    const find = (slug: string) => posts.find((p) => p.seo?.slug === slug || p.id === slug);
    const rows = new Map<string, { slug: string; title: string; cover: string; link: string; plays: number; players: number; seconds: number; avg: number }>();
    for (const n of this.news()) {
      const slug = decodeURIComponent(n.slug);
      const p = find(slug);
      const k = p?.id ?? slug;
      const r = rows.get(k) ?? { slug: k, title: p?.title ?? slug, cover: p?.cover ?? '', link: p ? newsPath(p) : '', plays: 0, players: 0, seconds: 0, avg: 0 };
      r.plays += n.plays;
      r.players += n.players;
      r.seconds += n.seconds;
      rows.set(k, r);
    }
    const key = this.newsSort();
    return [...rows.values()]
      .map((r) => ({ ...r, avg: r.plays ? r.seconds / r.plays : 0 }))
      .sort((a, b) => b[key] - a[key] || b.plays - a.plays);
  });
  readonly newsTop = computed(() => [...this.newsRows()].sort((a, b) => b.plays - a.plays).slice(0, 10));
  readonly newsTotals = computed(() =>
    this.news().reduce((t, g) => ({ players: t.players + g.players, plays: t.plays + g.plays, seconds: t.seconds + g.seconds }), { players: 0, plays: 0, seconds: 0 }),
  );

  /** Đơn ĐÃ HOÀN THÀNH trong khoảng thời gian (doanh thu chỉ tính đơn hoàn thành). */
  private readonly ordersInRange = computed(() => {
    const d = this.days();
    const from = d ? Date.now() - d * 86_400_000 : 0;
    return this.orders().filter((o) => o.status === 'done' && o.createdAt >= from);
  });
  readonly orderTotals = computed(() => {
    const list = this.ordersInRange();
    return {
      orders: list.length,
      qty: list.reduce((s, o) => s + o.items.reduce((a, i) => a + i.qty, 0), 0),
      revenue: list.reduce((s, o) => s + o.total, 0),
    };
  });

  readonly productRows = computed<(ProductRow & { rate: number })[]>(() => {
    const products = this.productsSvc.products();
    const byId = new Map(products.map((p) => [p.id, p]));
    const rows = new Map<string, ProductRow>();
    const row = (key: string, name: string) => {
      let r = rows.get(key);
      if (!r) {
        const p = byId.get(key);
        r = {
          key,
          name: p?.name ?? name,
          image: p?.images[0] ?? '',
          link: p ? `/san-pham/${p.slug || p.id}` : '',
          qty: 0,
          revenue: 0,
          orders: 0,
          views: 0,
          visitors: 0,
        };
        rows.set(key, r);
      }
      return r;
    };
    for (const o of this.ordersInRange()) {
      const seen = new Set<string>();
      for (const it of o.items) {
        // id trong đơn có thể kèm biến thể (id::bienthe) → gộp về sản phẩm.
        const key = String(it.id).split('::')[0];
        const r = row(key, it.name.split(' — ')[0]);
        r.qty += it.qty;
        r.revenue += it.price * it.qty;
        if (!seen.has(key)) r.orders++;
        seen.add(key);
      }
    }
    // Lượt xem: /san-pham/<slug> (cả slug cũ) → sản phẩm.
    const bySlug = new Map<string, string>();
    for (const p of products) for (const s of [p.slug, p.id, ...(p.oldSlugs ?? [])]) if (s) bySlug.set(s, p.id);
    for (const v of this.views()) {
      const id = bySlug.get(decodeURIComponent(v.path.replace('/san-pham/', '')));
      if (!id) continue;
      const p = byId.get(id)!;
      const r = row(id, p.name);
      r.views += v.views;
      r.visitors += v.visitors;
    }
    const key = this.sort();
    const out = [...rows.values()].map((r) => ({ ...r, rate: r.visitors ? r.orders / r.visitors : 0 }));
    return out.sort((a, b) => b[key] - a[key] || b.qty - a.qty);
  });
  readonly topQty = computed(() => [...this.productRows()].filter((p) => p.qty > 0).sort((a, b) => b.qty - a.qty).slice(0, 8));
  readonly topRevenue = computed(() => [...this.productRows()].filter((p) => p.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 8));

  async load(): Promise<void> {
    this.loading.set(true);
    this.gameError.set('');
    this.orderError.set('');
    const msg = (e: unknown) =>
      e instanceof ApiError && (e.status === 404 || e.status === 0)
        ? 'Chỉ xem được khi web chạy trên Vercel (cần máy chủ).'
        : e instanceof Error ? e.message : 'Không tải được dữ liệu.';
    await Promise.all([
      this.api
        .call<{ games: GameStat[]; news?: (GameStat & { slug: string })[]; productViews: PageStat[] }>('GET', `/api/analytics?insights=1&days=${this.days()}`, undefined, true)
        .then((r) => {
          this.games.set(r.games);
          this.news.set(r.news ?? []);
          this.views.set(r.productViews);
        })
        .catch((e) => this.gameError.set(msg(e))),
      this.api
        .list()
        .then((r) => this.orders.set(r.orders))
        .catch((e) => this.orderError.set(msg(e))),
    ]);
    this.loading.set(false);
  }
}

import { Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
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
  /** Nhãn nguồn đã phân loại (máy chủ gửi): "🔎 Google", "💬 Facebook", "📣 fb · sale"... */
  source?: string;
}

type SourceKind = 'search' | 'social' | 'campaign' | 'referral' | 'direct';
interface Sources {
  list: { kind: SourceKind; name: string; entries: number; visitors: number }[];
  kinds: Record<SourceKind, number>;
  campaigns: { source: string; medium: string; campaign: string; entries: number; visitors: number }[];
  partial: boolean;
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
  storage: Storage | null;
  sources?: Sources | null;
}

interface Storage {
  rows: number;
  viewsBytes: number;
  dbBytes: number;
  limitBytes: number;
  pct: number;
  level: 'ok' | 'warn' | 'danger';
  oldest: number | null;
}

interface Point {
  t: number;
  views: number;
  visitors: number;
}

type CleanKey = 'views' | 'online' | 'rateLimits' | 'salts' | 'images';
type CleanCounts = Record<CleanKey, number> & { imageBytes: number };

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

    @if (data()?.storage; as st) {
      @if (st.level !== 'ok') {
        <div class="store-alert" [class.danger]="st.level === 'danger'" role="alert">
          <b>{{ st.level === 'danger' ? '🚨 Bộ nhớ sắp đầy!' : '⚠ Bộ nhớ đang đầy dần' }}</b>
          Cơ sở dữ liệu đã dùng <b>{{ mb(st.dbBytes) }}</b> / {{ mb(st.limitBytes) }} ({{ st.pct }}%).
          {{ st.level === 'danger' ? 'Khi đầy, web có thể không lưu được đơn hàng mới.' : '' }}
          Hãy dọn bớt dữ liệu cũ không dùng đến.
          <button class="btn primary small clean-btn" type="button" (click)="openCleanup()">🧹 Dọn dữ liệu không dùng</button>
        </div>
      }
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
                  <span class="meta">{{ o.ip || '-' }} · {{ dev(o.ua) }} · {{ ago(o.lastSeen, d.now) }}</span>
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


      <!-- Nguồn truy cập -->
      <section class="adm-box src-box">
        <h2>🔗 Nguồn truy cập · {{ rangeLabel() }}</h2>
        @if (d.sources; as so) {
          @let tot = srcTotal(so);
          @if (tot) {
            <div class="pies">
              @for (pc of srcPies(so, tot); track pc.title) {
                <figure class="pie-card">
                  <figcaption>{{ pc.title }}</figcaption>
                  <div class="pie-row">
                    <svg viewBox="-1.05 -1.05 2.1 2.1" class="pie" role="img" [attr.aria-label]="pc.title">
                      @for (sl of pc.slices; track sl.label) {
                        @if (sl.full) {
                          <circle r="1" [attr.fill]="sl.color" [class.dim]="pieHover() && pieHover() !== pc.title + sl.label"
                            (mouseenter)="pieHover.set(pc.title + sl.label)" (mouseleave)="pieHover.set('')"><title>{{ sl.label }}: {{ fmt(sl.value) }} ({{ sl.pct }}%)</title></circle>
                        } @else {
                          <path [attr.d]="sl.d" [attr.fill]="sl.color" [class.dim]="pieHover() && pieHover() !== pc.title + sl.label"
                            (mouseenter)="pieHover.set(pc.title + sl.label)" (mouseleave)="pieHover.set('')"><title>{{ sl.label }}: {{ fmt(sl.value) }} ({{ sl.pct }}%)</title></path>
                        }
                      }
                    </svg>
                    <ul class="klegend">
                      @for (sl of pc.slices; track sl.label) {
                        <li [class.dim]="pieHover() && pieHover() !== pc.title + sl.label" (mouseenter)="pieHover.set(pc.title + sl.label)" (mouseleave)="pieHover.set('')">
                          <span class="sw" [style.background]="sl.color"></span><span class="lb">{{ sl.label }}</span> <b>{{ sl.pct }}%</b> <small>({{ fmt(sl.value) }})</small>
                        </li>
                      }
                    </ul>
                  </div>
                </figure>
              }
            </div>
            <div class="adm-table-wrap">
              <table class="adm-table src-table">
                <thead><tr><th>Nguồn</th><th>Loại</th><th class="num">Lượt vào web</th><th class="num">Khách</th><th class="barcol"></th></tr></thead>
                <tbody>
                  @for (r of so.list.slice(0, srcMore() ? 100 : 12); track r.kind + r.name) {
                    <tr>
                      <td><b>{{ kindOf(r.kind).icon }} {{ r.name }}</b></td>
                      <td><span class="kchip" [style.borderColor]="kindOf(r.kind).color">{{ kindOf(r.kind).label }}</span></td>
                      <td class="num">{{ fmt(r.entries) }}</td>
                      <td class="num">{{ fmt(r.visitors) }}</td>
                      <td class="barcol"><span class="bar"><i [style.width.%]="(r.entries / so.list[0].entries) * 100" [style.background]="kindOf(r.kind).color"></i></span></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (so.list.length > 12) {
              <button type="button" class="lnk" (click)="srcMore.set(!srcMore())">{{ srcMore() ? 'Thu gọn' : 'Xem tất cả ' + so.list.length + ' nguồn' }}</button>
            }
            @if (so.campaigns.length) {
              <h3 class="sub-h">📣 Chiến dịch (link theo dõi)</h3>
              <div class="adm-table-wrap">
                <table class="adm-table src-table">
                  <thead><tr><th>Nguồn (utm_source)</th><th>Kênh (utm_medium)</th><th>Chiến dịch (utm_campaign)</th><th class="num">Lượt vào</th><th class="num">Khách</th></tr></thead>
                  <tbody>
                    @for (c of so.campaigns; track $index) {
                      <tr><td><b>{{ c.source }}</b></td><td>{{ c.medium || '-' }}</td><td>{{ c.campaign || '-' }}</td><td class="num">{{ fmt(c.entries) }}</td><td class="num">{{ fmt(c.visitors) }}</td></tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          } @else {
            <p class="none">Chưa có lượt vào web nào trong khoảng này.</p>
          }
          <p class="hint src-note">
            Tính theo <b>lần mở web</b> (trang đầu tiên khách vào). <b>Trực tiếp</b> = gõ địa chỉ, bookmark, hoặc mở từ ứng dụng không báo nguồn
            (Messenger / Zalo trên điện thoại thường như vậy) - dùng <b>link theo dõi</b> bên dưới để biết chính xác.
            @if (so.partial) { <br />⚠ Đang tính tạm trên 1000 lượt vào gần nhất - chạy lại <code>supabase/schema.sql</code> để thống kê đủ. }
          </p>
        } @else {
          <p class="none">Chưa đọc được nguồn truy cập.</p>
        }

        <details class="utm">
          <summary>🔧 Tạo link theo dõi (biết khách đến từ bài đăng / nhóm / quảng cáo nào)</summary>
          <div class="utm-body">
            <div class="utm-grid">
              <label>Trang<input [value]="utmPath()" (input)="utmPath.set($any($event.target).value)" placeholder="/ hoặc /san-pham/ten-san-pham" /></label>
              <label>Nguồn (nơi đăng link)<input [value]="utmSource()" (input)="utmSource.set($any($event.target).value)" placeholder="facebook, zalo, tiktok…" list="utm-src" /></label>
              <label>Kênh<input [value]="utmMedium()" (input)="utmMedium.set($any($event.target).value)" placeholder="bai-dang, nhom, quang-cao, bio…" list="utm-med" /></label>
              <label>Tên chiến dịch<input [value]="utmCampaign()" (input)="utmCampaign.set($any($event.target).value)" placeholder="sale-11-11" /></label>
            </div>
            <datalist id="utm-src"><option value="facebook"></option><option value="zalo"></option><option value="tiktok"></option><option value="instagram"></option><option value="youtube"></option><option value="shopee"></option><option value="email"></option><option value="qr"></option></datalist>
            <datalist id="utm-med"><option value="bai-dang"></option><option value="nhom"></option><option value="quang-cao"></option><option value="bio"></option><option value="tin-nhan"></option><option value="in-an"></option></datalist>
            <div class="utm-out">
              <input readonly [value]="utmLink()" aria-label="Link theo dõi" (focus)="$any($event.target).select()" />
              <button type="button" class="btn primary small" [disabled]="!utmSource().trim()" (click)="copyUtm()">{{ copied() ? '✓ Đã chép' : 'Chép link' }}</button>
            </div>
            <p class="hint">Dán link này vào bài đăng / tin nhắn / quảng cáo. Khách bấm vào sẽ được tính vào bảng <b>Chiến dịch</b> ở trên (link tự gọn lại sau khi mở).</p>
          </div>
        </details>
      </section>

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
                  <td class="mono">{{ v.ip || '-' }}</td>
                  <td class="path" [title]="v.path">{{ v.path }}</td>
                  <td class="nowrap">{{ dev(v.ua) }}</td>
                  <td class="ref" [title]="v.ref">{{ v.source || host(v.ref) }}</td>
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

    <!-- Bảng dọn dữ liệu: xem trước → chọn → xác nhận xoá -->
    <!-- <dialog> gốc của trình duyệt: luôn nằm trên cùng, giữa màn hình (không bị khung trang làm lệch) -->
    <dialog #cleanDlg class="cl-dialog" aria-labelledby="cl-title" (cancel)="$event.preventDefault(); closeCleanup()" (click)="onDialogClick($event)">
    @if (cleanOpen()) {
        <div class="cl-modal">
          <h2 id="cl-title">🧹 Dọn dữ liệu không dùng</h2>

          @if (cleanResult(); as r) {
            <div class="cl-done">
              <p>✅ <b>Đã dọn xong!</b></p>
              <ul>
                @for (p of parts; track p.key) {
                  @if (r[p.key]) { <li>{{ p.label }}: <b>{{ fmt(r[p.key]) }}</b>{{ p.key === 'images' ? ' ảnh (' + mb(r.imageBytes) + ')' : '' }}</li> }
                }
              </ul>
              @if (!cleanTotal(r)) { <p class="hint">Không có gì cần xoá.</p> }
            </div>
            <div class="cl-actions">
              <button class="btn primary small" type="button" (click)="closeCleanup()">Đóng</button>
            </div>
          } @else {
            <p class="cl-intro">Chọn loại dữ liệu cần xoá. <b>Đơn hàng, khách hàng, sản phẩm, tin tức, lời nhắn không bị đụng tới.</b></p>
            <label class="cl-days">
              Xoá lượt truy cập cũ hơn
              <select (change)="setCleanDays(+$any($event.target).value)">
                @for (n of [30, 90, 180, 365]; track n) { <option [value]="n" [selected]="n === cleanDays()">{{ n }} ngày</option> }
              </select>
            </label>

            <ul class="cl-list">
              @for (p of parts; track p.key) {
                <li [class.off]="!picked().has(p.key)">
                  <label>
                    <input type="checkbox" [checked]="picked().has(p.key)" (change)="togglePart(p.key)" />
                    <span class="cl-txt"><b>{{ p.label }}</b><small>{{ p.hint }}</small></span>
                    <span class="cl-count">
                      @if (scanning()) { … } @else if (cleanCounts(); as c) {
                        {{ fmt(c[p.key]) }}{{ p.key === 'images' && c.imageBytes ? ' · ' + mb(c.imageBytes) : '' }}
                      }
                    </span>
                  </label>
                </li>
              }
            </ul>
            @if (cleanError()) { <p class="cl-err">⚠ {{ cleanError() }}</p> }
            <p class="cl-warn">⚠ Dữ liệu đã xoá <b>không khôi phục được</b>.</p>
            <div class="cl-actions">
              <button class="btn ghost small" type="button" (click)="closeCleanup()" [disabled]="cleaning()">Huỷ</button>
              <button class="btn danger small" type="button" (click)="confirmCleanup()" [disabled]="cleaning() || scanning() || !selectedCount()">
                {{ cleaning() ? 'Đang xoá…' : '🗑 Xác nhận xoá' + (selectedCount() ? ' (' + fmt(selectedCount()) + ' mục)' : '') }}
              </button>
            </div>
          }
        </div>
    }
    </dialog>
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
    .src-box { padding-bottom: 6px; }
    .pies { padding: 12px 16px 4px; display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; }
    .pie-card { margin: 0; border: 1px solid #dcdcde; border-radius: 10px; padding: 10px 12px; }
    .pie-card figcaption { font-weight: 700; font-size: .85rem; margin-bottom: 8px; color: #3c434a; }
    .pie-row { display: flex; align-items: center; gap: 16px; }
    .pie { width: 140px; height: 140px; flex: none; transform: rotate(-90deg); }
    .pie path, .pie circle { stroke: #fff; stroke-width: .02; cursor: pointer; transition: opacity .15s; }
    .pie .dim, .klegend .dim { opacity: .35; }
    .klegend { list-style: none; margin: 0; padding: 0; display: grid; gap: 5px; font-size: .84rem; min-width: 0; flex: 1; }
    .klegend li { display: flex; align-items: center; gap: 6px; cursor: default; transition: opacity .15s; }
    .klegend .lb { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; }
    @media (max-width: 420px) { .pie-row { flex-direction: column; align-items: stretch; } .pie { align-self: center; } }
    .klegend small { color: #646970; }
    .sw { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: middle; }
    .src-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .src-table .barcol { width: 22%; }
    .src-table .bar { display: block; height: 8px; border-radius: 4px; background: #f0f0f1; overflow: hidden; }
    .src-table .bar i { display: block; height: 100%; }
    .kchip { font-size: .72rem; font-weight: 700; padding: 1px 8px; border-radius: 999px; border: 1.5px solid; white-space: nowrap; }
    .sub-h { margin: 14px 16px 6px; font-size: .95rem; }
    .lnk { border: 0; background: none; color: #2271b1; cursor: pointer; font: inherit; font-size: .85rem; padding: 6px 16px; }
    .src-note { padding: 6px 16px 10px; margin: 0; }
    .utm { border-top: 1px solid #f0f0f1; margin-top: 6px; }
    .utm > summary { cursor: pointer; padding: 12px 16px; font-weight: 700; }
    .utm-body { padding: 0 16px 14px; display: grid; gap: 10px; }
    .utm-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
    .utm-grid label { display: grid; gap: 4px; font-size: .82rem; font-weight: 700; }
    .utm-out { display: flex; gap: 8px; }
    .utm-out input { flex: 1; min-width: 0; font-family: ui-monospace, Consolas, monospace; font-size: .8rem; }
    @media (max-width: 600px) { .src-table .barcol { display: none; } .utm-out { flex-direction: column; } }
    .latest-wrap { max-height: 520px; overflow-y: auto; }
    .latest-wrap thead th { position: sticky; top: 0; z-index: 1; }
    .latest .mono { font-family: ui-monospace, Consolas, monospace; font-size: .82rem; }
    .latest .path { max-width: 260px; font-weight: 600; }
    .latest .ref { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #646970; }
    .nowrap { white-space: nowrap; }
    .store-alert { margin-bottom: 16px; padding: 12px 16px; border-radius: 10px; background: #fcf9e8; border: 1.5px solid #dba617; color: #3c434a; line-height: 1.6; }
    .store-alert.danger { background: #fcf0f1; border-color: #d63638; }
    .store-alert a { color: #2271b1; font-weight: 700; }
    .store { margin-bottom: 16px; scroll-margin-top: 80px; }
    .store-body { padding: 14px 16px; display: grid; gap: 8px; }
    .store-bar { height: 12px; border-radius: 6px; background: #f0f0f1; overflow: hidden; }
    .store-bar i { display: block; height: 100%; border-radius: 6px; background: #2e7d32; }
    .store-bar.warn i { background: #dba617; }
    .store-bar.danger i { background: #d63638; }
    .store-line { margin: 0; font-size: .9rem; }
    .store .hint { margin: 0; color: #646970; font-size: .8rem; }
    .purge { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: .88rem; }
    .clean-btn { margin-left: 6px; }
    .cl-dialog { width: min(560px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); padding: 0; border: 0; outline: none; border-radius: 14px; box-shadow: 0 20px 50px rgba(0,0,0,.3); }
    .cl-dialog::backdrop { background: rgba(0,0,0,.45); }
    .cl-modal { padding: 20px 22px; background: #fff; }
    .cl-modal h2 { margin: 0 0 8px; padding: 0; border: 0; font-size: 1.2rem; }
    .cl-intro { margin: 0 0 12px; font-size: .9rem; color: #3c434a; }
    .cl-days { display: flex; align-items: center; gap: 8px; font-size: .9rem; font-weight: 600; margin-bottom: 10px; }
    .cl-days select { font: inherit; padding: 5px 8px; border: 1px solid #c3c4c7; border-radius: 8px; }
    .cl-list { list-style: none; margin: 0; padding: 0; border: 1px solid #dcdcde; border-radius: 10px; overflow: hidden; }
    .cl-list li + li { border-top: 1px solid #f0f0f1; }
    .cl-list label { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; }
    .cl-list li.off { opacity: .55; }
    .cl-txt { display: flex; flex-direction: column; }
    .cl-txt small { color: #646970; font-size: .78rem; }
    .cl-count { font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .cl-warn { margin: 12px 0 0; font-size: .85rem; color: #8a2424; }
    .cl-err { margin: 10px 0 0; color: #d63638; font-weight: 700; font-size: .88rem; }
    .cl-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
    .btn.danger { background: #d63638 !important; color: #fff !important; border-color: #d63638 !important; }
    .btn.danger:disabled { opacity: .5; }
    .cl-done ul { margin: 6px 0; padding-left: 20px; }

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
  readonly purging = signal(false);

  // ---------- Dọn dữ liệu không dùng ----------
  readonly parts: { key: CleanKey; label: string; hint: string }[] = [
    { key: 'views', label: 'Lượt truy cập cũ', hint: 'Lịch sử xem trang cũ hơn số ngày đã chọn (bảng thống kê).' },
    { key: 'images', label: 'Ảnh không còn dùng', hint: 'Ảnh đã tải lên nhưng không sản phẩm / bài viết nào dùng nữa (giữ lại ảnh mới tải trong 24 giờ).' },
    { key: 'online', label: 'Khách online đã rời đi', hint: 'Dấu vết "đang truy cập" của khách đã rời hơn 1 ngày.' },
    { key: 'rateLimits', label: 'Bộ đếm chống spam hết hạn', hint: 'Số lần gửi form / nhập code của các khung giờ đã qua.' },
    { key: 'salts', label: 'Dữ liệu code minigame ngày cũ', hint: 'Dùng để tạo code các ngày đã qua - không còn tác dụng.' },
  ];
  readonly cleanOpen = signal(false);
  readonly cleanDays = signal(90);
  readonly picked = signal<Set<CleanKey>>(new Set(['views', 'images', 'online', 'rateLimits', 'salts']));
  readonly cleanCounts = signal<CleanCounts | null>(null);
  readonly cleanResult = signal<CleanCounts | null>(null);
  readonly cleanError = signal('');
  readonly scanning = signal(false);
  readonly cleaning = signal(false);
  /** Số mục sẽ xoá theo lựa chọn hiện tại. */
  readonly selectedCount = computed(() => {
    const c = this.cleanCounts();
    if (!c) return 0;
    return [...this.picked()].reduce((s, k) => s + (c[k] || 0), 0);
  });

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
    // Bấm cảnh báo bộ nhớ trong chuông (?don=1) → mở luôn bảng dọn dữ liệu.
    const openClean = inject(ActivatedRoute).snapshot.queryParamMap.has('don');
    void this.load().then(() => {
      if (openClean) this.openCleanup();
    });
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
      this.error.set('Chưa có mã quản trị - vào trang Đơn hàng để nhập mã, rồi quay lại đây.');
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

  mb(bytes: number): string {
    return bytes >= 1024 * 1024 * 1024 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  dayLabel(t: number): string {
    const p = vnParts(t);
    return `${pad(p.d)}/${pad(p.mo)}/${p.y}`;
  }

  private readonly cleanDlg = viewChild<ElementRef<HTMLDialogElement>>('cleanDlg');

  openCleanup(): void {
    this.cleanResult.set(null);
    this.cleanError.set('');
    this.cleanOpen.set(true);
    const d = this.cleanDlg()?.nativeElement;
    if (d && !d.open) d.showModal();
    void this.scanCleanup();
  }

  closeCleanup(): void {
    if (this.cleaning()) return;
    this.cleanOpen.set(false);
    this.cleanDlg()?.nativeElement.close();
  }

  /** Bấm ra vùng tối bên ngoài bảng → đóng. */
  onDialogClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.closeCleanup();
  }

  setCleanDays(n: number): void {
    this.cleanDays.set(n);
    void this.scanCleanup();
  }

  togglePart(k: CleanKey): void {
    this.picked.update((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  cleanTotal(c: CleanCounts): number {
    return this.parts.reduce((s, p) => s + (c[p.key] || 0), 0);
  }

  /** Xem trước: đếm số mục mỗi loại (chưa xoá gì). */
  async scanCleanup(): Promise<void> {
    this.scanning.set(true);
    this.cleanError.set('');
    try {
      const r = await this.api.call<{ counts: CleanCounts }>('GET', `/api/analytics?cleanup=1&days=${this.cleanDays()}`, undefined, true, { timeoutMs: 30000 });
      this.cleanCounts.set(r.counts);
    } catch (e) {
      this.cleanError.set(e instanceof Error ? e.message : 'Không kiểm tra được dữ liệu.');
    } finally {
      this.scanning.set(false);
    }
  }

  /** Bấm "Xác nhận xoá": hỏi lại lần cuối rồi mới xoá. */
  async confirmCleanup(): Promise<void> {
    const n = this.selectedCount();
    if (!n) return;
    if (!confirm(`Xoá vĩnh viễn ${this.fmt(n)} mục dữ liệu đã chọn? Thao tác này không khôi phục được.`)) return;
    this.cleaning.set(true);
    this.cleanError.set('');
    try {
      const parts = [...this.picked()].join(',');
      const r = await this.api.call<{ deleted: CleanCounts }>('DELETE', `/api/analytics?cleanup=1&days=${this.cleanDays()}&parts=${parts}`, undefined, true, {
        timeoutMs: 30000,
      });
      this.cleanResult.set(r.deleted);
      void this.load();
    } catch (e) {
      this.cleanError.set(e instanceof Error ? e.message : 'Không xoá được dữ liệu.');
    } finally {
      this.cleaning.set(false);
    }
  }

  async purge(days: number): Promise<void> {
    if (!confirm(`Xoá vĩnh viễn mọi lượt truy cập cũ hơn ${days} ngày? Không khôi phục được.`)) return;
    this.purging.set(true);
    try {
      const r = await this.api.call<{ deleted: number }>('DELETE', `/api/analytics?days=${days}`, undefined, true, { timeoutMs: 30000 });
      this.error.set('');
      alert(`Đã xoá ${this.fmt(r.deleted)} lượt truy cập cũ.`);
      await this.load();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Không xoá được dữ liệu cũ.');
    } finally {
      this.purging.set(false);
    }
  }

  fmt(n: number): string {
    return n.toLocaleString('vi-VN');
  }

  dev(ua: string): string {
    return device(ua);
  }

  // ---------- Nguồn truy cập ----------
  readonly kindList: { id: SourceKind; label: string; icon: string; color: string }[] = [
    { id: 'search', label: 'Tìm kiếm', icon: '🔎', color: '#4285f4' },
    { id: 'social', label: 'Mạng xã hội', icon: '💬', color: '#e1306c' },
    { id: 'campaign', label: 'Chiến dịch', icon: '📣', color: '#f59e0b' },
    { id: 'referral', label: 'Web khác', icon: '🔗', color: '#10b981' },
    { id: 'direct', label: 'Trực tiếp', icon: '⌨️', color: '#8c8f94' },
  ];
  readonly srcMore = signal(false);
  kindOf(id: SourceKind) {
    return this.kindList.find((k) => k.id === id) ?? this.kindList[4];
  }
  readonly pieHover = signal('');
  /** Màu cho từng nguồn cụ thể (biểu đồ "Nguồn hàng đầu"). */
  private readonly srcColors = ['#2271b1', '#d63638', '#00a32a', '#dba617', '#8c5fd6', '#e26f1b', '#0aa5a5', '#c2185b'];

  /** 2 biểu đồ tròn: theo loại nguồn, và 7 nguồn nhiều nhất (+ Khác). */
  srcPies(so: Sources, tot: number): { title: string; slices: { label: string; value: number; pct: number; color: string; d: string; full: boolean }[] }[] {
    const build = (items: { label: string; value: number; color: string }[]) => {
      const sum = items.reduce((a, b) => a + b.value, 0) || 1;
      let a0 = 0;
      return items
        .filter((x) => x.value > 0)
        .map((x) => {
          const frac = x.value / sum;
          const a1 = a0 + frac * Math.PI * 2;
          const [x0, y0, x1, y1] = [Math.cos(a0), Math.sin(a0), Math.cos(a1), Math.sin(a1)];
          const d = `M0 0 L${x0.toFixed(4)} ${y0.toFixed(4)} A1 1 0 ${frac > 0.5 ? 1 : 0} 1 ${x1.toFixed(4)} ${y1.toFixed(4)} Z`;
          a0 = a1;
          return { ...x, pct: Math.round(frac * 1000) / 10, d, full: frac >= 0.9999 };
        });
    };
    const kinds = build(this.kindList.map((k) => ({ label: `${k.icon} ${k.label}`, value: so.kinds[k.id] || 0, color: k.color })));
    const top = so.list.slice(0, 7);
    const rest = tot - top.reduce((a, r) => a + r.entries, 0);
    const sources = build([
      ...top.map((r, i) => ({ label: `${this.kindOf(r.kind).icon} ${r.name}`, value: r.entries, color: this.srcColors[i] })),
      ...(rest > 0 ? [{ label: 'Khác', value: rest, color: '#a7aaad' }] : []),
    ]);
    return [
      { title: 'Theo loại nguồn', slices: kinds },
      { title: 'Nguồn hàng đầu', slices: sources },
    ];
  }

  srcTotal(so: Sources): number {
    return Object.values(so.kinds).reduce((a, b) => a + b, 0);
  }
  pct(n: number, total: number): number {
    return total ? Math.round((n / total) * 1000) / 10 : 0;
  }

  // Tạo link theo dõi (UTM)
  readonly utmPath = signal('/');
  readonly utmSource = signal('facebook');
  readonly utmMedium = signal('bai-dang');
  readonly utmCampaign = signal('');
  readonly copied = signal(false);
  readonly utmLink = computed(() => {
    const clean = (v: string) => v.trim().toLowerCase().replace(/\s+/g, '-');
    let path = this.utmPath().trim() || '/';
    if (/^https?:\/\//i.test(path)) {
      try {
        path = new URL(path).pathname;
      } catch {
        path = '/';
      }
    }
    if (!path.startsWith('/')) path = '/' + path;
    const q = new URLSearchParams();
    if (this.utmSource().trim()) q.set('utm_source', clean(this.utmSource()));
    if (this.utmMedium().trim()) q.set('utm_medium', clean(this.utmMedium()));
    if (this.utmCampaign().trim()) q.set('utm_campaign', clean(this.utmCampaign()));
    const qs = q.toString();
    return location.origin + path + (qs ? '?' + qs : '');
  });
  async copyUtm(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.utmLink());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    } catch {
      /* trình duyệt chặn - khách tự bôi đen ô link */
    }
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

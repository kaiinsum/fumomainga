import { Component, OnInit, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { OrderApiService } from '../../services/order-api.service';

export interface IpGeo {
  ip: string;
  private?: boolean;
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  lat?: number | null;
  lon?: number | null;
  isp?: string;
}

/** Bộ nhớ tạm dùng chung (mở lại không phải tra lại). */
const cache = new Map<string, Promise<IpGeo>>();

/** Nút "📍" cạnh địa chỉ IP: bấm → tra vị trí ước tính + bản đồ Google Maps. */
@Component({
  selector: 'app-ip-geo',
  template: `
    <button type="button" class="pin" (click)="toggle()" [attr.aria-expanded]="open()" [title]="'Xem vị trí IP ' + ip()">📍</button>
    @if (open()) {
      <div class="pop" role="dialog" [attr.aria-label]="'Vị trí IP ' + ip()">
        <button type="button" class="x" (click)="open.set(false)" aria-label="Đóng">✕</button>
        @if (loading()) {
          <p class="muted">Đang tra vị trí {{ ip() }}…</p>
        } @else if (err()) {
          <p class="err">{{ err() }}</p>
        } @else if (geo(); as g) {
          @if (g.private) {
            <p class="muted"><code>{{ g.ip }}</code> là IP nội bộ (mạng LAN / máy chủ) - không có vị trí.</p>
          } @else {
            <p class="place"><b>{{ place(g) }}</b></p>
            <p class="muted"><code>{{ g.ip }}</code>{{ g.isp ? ' · ' + g.isp : '' }}</p>
            @if (mapUrl(); as m) {
              <iframe [src]="m" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Bản đồ vị trí IP"></iframe>
            }
            @if (g.lat !== null && g.lat !== undefined) {
              <a class="gm" [href]="'https://www.google.com/maps?q=' + g.lat + ',' + g.lon" target="_blank" rel="noopener">Mở trên Google Maps ↗</a>
            }
            <small class="muted">Vị trí theo IP chỉ là ước tính (thường đúng tới tỉnh / thành phố, nhà mạng có thể đặt máy chủ ở nơi khác).</small>
          }
        }
      </div>
    }
  `,
  styles: `
    :host { position: relative; display: inline-block; vertical-align: middle; }
    .pin { border: 1px solid #c3c4c7; background: #fff; border-radius: 6px; padding: 2px 7px; font: inherit; font-size: .78rem; cursor: pointer; white-space: nowrap; }
    .pin:hover { border-color: #2271b1; color: #2271b1; }
    .pop { position: absolute; z-index: 50; top: calc(100% + 6px); left: 0; width: min(340px, 86vw); padding: 12px; border-radius: 10px;
      background: #fff; border: 1px solid #c3c4c7; box-shadow: 0 10px 30px rgba(0,0,0,.18); display: grid; gap: 6px; white-space: normal; text-align: left; }
    .x { position: absolute; top: 6px; right: 6px; border: 0; background: none; cursor: pointer; color: #646970; }
    p { margin: 0; font-size: .85rem; }
    .place { font-size: .95rem; padding-right: 18px; }
    .muted { color: #646970; font-size: .78rem; }
    .err { color: #b32d2e; }
    code { font-family: ui-monospace, Consolas, monospace; }
    iframe { width: 100%; height: 180px; border: 0; border-radius: 8px; background: #eef3f7; }
    .gm { font-weight: 700; font-size: .85rem; }
  `,
})
export class IpGeoComponent implements OnInit {
  private readonly api = inject(OrderApiService);
  private readonly sanitizer = inject(DomSanitizer);
  readonly ip = input.required<string>();
  /** Mở sẵn khung vị trí (ô "Kiểm tra IP"). */
  readonly autoOpen = input(false);
  readonly open = signal(false);
  readonly loading = signal(false);
  readonly err = signal('');
  readonly geo = signal<IpGeo | null>(null);
  readonly mapUrl = signal<SafeResourceUrl | null>(null);

  ngOnInit(): void {
    if (this.autoOpen()) void this.toggle();
  }

  place(g: IpGeo): string {
    return [g.city, g.region !== g.city ? g.region : '', g.country].filter(Boolean).join(', ') || 'Không rõ vị trí';
  }

  async toggle(): Promise<void> {
    this.open.update((v) => !v);
    if (!this.open() || this.geo()) return;
    this.loading.set(true);
    this.err.set('');
    const ip = this.ip().trim();
    try {
      let p = cache.get(ip);
      if (!p) {
        p = this.api.call<IpGeo>('GET', `/api/admin/security?geo=${encodeURIComponent(ip)}`, undefined, true);
        cache.set(ip, p);
        p.catch(() => cache.delete(ip));
      }
      const g = await p;
      this.geo.set(g);
      if (g.lat !== null && g.lat !== undefined && g.lon !== null && g.lon !== undefined) {
        // Bản đồ nhúng Google Maps (không cần API key).
        this.mapUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(`https://maps.google.com/maps?q=${g.lat},${g.lon}&z=10&output=embed`));
      }
    } catch (e) {
      this.err.set(e instanceof Error ? e.message : 'Không tra được vị trí IP.');
    } finally {
      this.loading.set(false);
    }
  }
}

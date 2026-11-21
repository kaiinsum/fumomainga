import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

const VID_KEY = 'fumo.vid';
const SID_KEY = 'fumo.sid';
/** Báo "vẫn đang xem" mỗi 30 giây khi tab đang hiển thị. */
const PING_MS = 30_000;

function randomId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

function stored(storage: () => Storage, key: string): string {
  try {
    const s = storage();
    let v = s.getItem(key);
    if (!v) s.setItem(key, (v = randomId()));
    return v;
  } catch {
    return randomId();
  }
}

/**
 * Thống kê truy cập cho admin: mỗi lần mở trang gửi 1 lượt xem, đang mở thì báo online.
 * Không gửi gì ở trang /admin. Mã khách (vid) là số ngẫu nhiên trên trình duyệt, không chứa thông tin cá nhân.
 */
/**
 * Đọc nguồn khách tới: document.referrer + utm_source / utm_medium / utm_campaign trên link,
 * và mã quảng cáo (fbclid → Facebook, gclid → Google Ads, ttclid → TikTok, zarsrc → Zalo).
 * Trả về "<referrer|(direct)>[ ##utm_source=..&...]" - máy chủ tự phân loại (api/_lib/traffic-source.ts).
 */
function entrySource(): string {
  const ref = document.referrer || '(direct)';
  let params: URLSearchParams;
  try {
    params = new URL(location.href).searchParams;
  } catch {
    return ref;
  }
  const tags = new URLSearchParams();
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) {
    const v = params.get(k)?.trim();
    if (v) tags.set(k, v.slice(0, 60));
  }
  if (!tags.has('utm_source')) {
    if (params.has('gclid') || params.has('gbraid') || params.has('wbraid')) tags.set('click', 'gads');
    else if (params.has('fbclid')) tags.set('click', 'fb');
    else if (params.has('ttclid')) tags.set('click', 'tiktok');
    else if (params.has('zarsrc')) tags.set('click', 'zalo');
  }
  // Bỏ các thẻ theo dõi khỏi thanh địa chỉ cho link gọn (khách copy link không mang theo mã chiến dịch).
  const strip = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'gbraid', 'wbraid', 'ttclid', 'zarsrc', 'zarsrc_ref'];
  if (strip.some((k) => params.has(k))) {
    try {
      const u = new URL(location.href);
      strip.forEach((k) => u.searchParams.delete(k));
      history.replaceState(history.state, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams : '') + u.hash);
    } catch {
      /* bỏ qua */
    }
  }
  const t = tags.toString();
  return (t ? `${ref} ##${t}` : ref).slice(0, 300);
}

@Injectable({ providedIn: 'root' })
export class TrackerService {
  private readonly router = inject(Router);
  private readonly vid = stored(() => localStorage, VID_KEY);
  private readonly sid = stored(() => sessionStorage, SID_KEY);
  private path = '';
  /** Nguồn của lần mở web này: trang dẫn tới (hoặc "(direct)") + thẻ chiến dịch (utm / mã quảng cáo) trên link. */
  private firstRef = entrySource();

  /** Lần cuối khách thao tác (chuột, phím, chạm, cuộn). */
  private lastInput = Date.now();
  /** Số giây hoạt động thật trên trang hiện tại, chưa gửi. */
  private activeSec = 0;

  start(): void {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      const path = (e as NavigationEnd).urlAfterRedirects.split(/[?#]/)[0] || '/';
      if (path === this.path) return;
      this.flushTime(); // gửi nốt thời gian của trang cũ
      this.path = path;
      this.lastInput = Date.now();
      if (!path.startsWith('/admin')) this.send('view');
    });
    setInterval(() => {
      if (document.visibilityState === 'visible') {
        this.send('ping');
        this.flushTime();
      }
    }, PING_MS);
    // Quay lại tab → báo online ngay. Rời tab / đóng trang → gửi nốt thời gian.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.lastInput = Date.now();
        this.send('ping');
      } else this.flushTime();
    });
    addEventListener('pagehide', () => this.flushTime());

    // Đếm thời gian hoạt động: mỗi giây, nếu tab đang hiện và khách vừa thao tác gần đây.
    const mark = () => (this.lastInput = Date.now());
    for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart']) {
      addEventListener(ev, mark, { passive: true, capture: true });
    }
    setInterval(() => {
      const idle = this.idleLimit();
      if (!idle || document.visibilityState !== 'visible') return;
      if (Date.now() - this.lastInput <= idle) this.activeSec++;
    }, 1000);
  }

  /**
   * Trang có đo thời gian và ngưỡng treo máy (ms): không thao tác lâu hơn ngưỡng thì không tính giờ.
   * Minigame: 20 giây (đang chơi là phải bấm liên tục). Bài viết: 90 giây (đọc thì ít khi đụng chuột).
   */
  private idleLimit(): number {
    if (/^\/mini-game\/[a-z0-9-]+$/.test(this.path)) return 20_000;
    if (/^\/tin-tuc\/[^/]+$/.test(this.path)) return 90_000;
    return 0;
  }

  /** Gửi số giây hoạt động thật đã gom được của trang hiện tại. */
  private flushTime(): void {
    const sec = this.activeSec;
    this.activeSec = 0;
    if (sec <= 0 || !this.idleLimit()) return;
    const body = JSON.stringify({ t: 'time', vid: this.vid, sid: this.sid, path: this.path, sec });
    fetch('/api/analytics', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => undefined);
  }

  private send(t: 'view' | 'ping'): void {
    if (!this.path || this.path.startsWith('/admin')) return;
    const body = JSON.stringify({ t, vid: this.vid, sid: this.sid, path: this.path, ref: t === 'view' ? this.firstRef : '' });
    if (t === 'view') this.firstRef = '';
    fetch('/api/analytics', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => undefined);
  }
}

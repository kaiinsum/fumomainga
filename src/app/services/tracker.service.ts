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
@Injectable({ providedIn: 'root' })
export class TrackerService {
  private readonly router = inject(Router);
  private readonly vid = stored(() => localStorage, VID_KEY);
  private readonly sid = stored(() => sessionStorage, SID_KEY);
  private path = '';
  private firstRef = document.referrer;

  start(): void {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      const path = (e as NavigationEnd).urlAfterRedirects.split(/[?#]/)[0] || '/';
      if (path === this.path) return;
      this.path = path;
      if (!path.startsWith('/admin')) this.send('view');
    });
    setInterval(() => {
      if (document.visibilityState === 'visible') this.send('ping');
    }, PING_MS);
    // Quay lại tab → báo online ngay.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.send('ping');
    });
  }

  private send(t: 'view' | 'ping'): void {
    if (!this.path || this.path.startsWith('/admin')) return;
    const body = JSON.stringify({ t, vid: this.vid, sid: this.sid, path: this.path, ref: t === 'view' ? this.firstRef : '' });
    if (t === 'view') this.firstRef = '';
    fetch('/api/analytics', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => undefined);
  }
}

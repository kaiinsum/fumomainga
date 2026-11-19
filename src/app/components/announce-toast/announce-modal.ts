import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Announcement } from '../../models/site-settings';
import { SeasonService } from '../../services/season.service';
import { SettingsService } from '../../services/settings.service';
import { activeAnnouncements } from './announce-toast';

const SEEN_KEY = 'fumo.announce.modal.seen';

function readSeen(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Mở lại 1 thông báo dạng modal (từ chuông thông báo). */
export const announceModalOpen = signal<string | null>(null);

/**
 * Thông báo hệ thống dạng modal (giống thiệp dịp lễ): tiêu đề, nội dung, ảnh, 1–2 nút.
 * Hiện 1 lần cho mỗi thông báo (đợi thiệp dịp lễ đóng trước); mở lại được từ chuông.
 */
@Component({
  selector: 'app-announce-modal',
  template: `
    @if (current(); as a) {
      <div class="backdrop" (click)="close(a)" role="presentation">
        <div class="card" role="dialog" aria-modal="true" [attr.aria-label]="a.title" (click)="$event.stopPropagation()">
          <button type="button" class="x" (click)="close(a)" aria-label="Đóng">✕</button>
          @if (a.image) {
            <img class="hero" [src]="a.image" alt="" />
          } @else {
            <div class="ico" aria-hidden="true">{{ a.icon }}</div>
          }
          <div class="txt">
            <h2>@if (a.image) { <span aria-hidden="true">{{ a.icon }}</span> }{{ a.title }}</h2>
            <p>{{ a.content }}</p>
            <div class="btns">
              <button type="button" class="btn primary" (click)="press(a, a.btn1?.link)">{{ a.btn1?.text || 'Đã hiểu' }}</button>
              @if (a.btn2?.text) {
                <button type="button" class="btn ghost" (click)="press(a, a.btn2?.link)">{{ a.btn2!.text }}</button>
              }
            </div>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 16px;
      background: rgba(10, 10, 20, .4); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); animation: fade .3s ease; }
    :host-context(html.lite) .backdrop { backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); background: rgba(10, 10, 20, .55); }
    .card { position: relative; width: min(460px, 100%); max-height: calc(100dvh - 32px); overflow-y: auto; border-radius: 24px; background: var(--surface); color: var(--text);
      border: 2px solid color-mix(in srgb, var(--primary) 45%, transparent); box-shadow: 0 30px 70px rgba(0,0,0,.35); animation: pop .45s cubic-bezier(.2, 1.4, .4, 1); }
    .x { position: absolute; top: 10px; right: 12px; z-index: 1; width: 34px; height: 34px; border-radius: 50%; border: 0; cursor: pointer;
      background: color-mix(in srgb, var(--surface) 85%, transparent); color: var(--muted); font-size: 1rem; box-shadow: 0 2px 8px rgba(0,0,0,.15); }
    .hero { display: block; width: 100%; max-height: 260px; object-fit: cover; }
    .ico { font-size: 4rem; text-align: center; padding: 28px 0 0; animation: bob 2.6s ease-in-out infinite; }
    .txt { padding: 18px 24px 22px; text-align: center; }
    h2 { margin: 0 0 8px; font-size: clamp(1.3rem, 5vw, 1.7rem); color: var(--primary-dark); }
    h2 span { margin-right: 6px; }
    p { margin: 0 0 18px; color: var(--muted); line-height: 1.6; white-space: pre-line; }
    .btns { display: flex; flex-direction: column; gap: 8px; }
    .btns .btn { width: 100%; justify-content: center; }
    @keyframes fade { from { opacity: 0; } }
    @keyframes pop { from { opacity: 0; transform: scale(.85) translateY(20px); } }
    @keyframes bob { 50% { transform: translateY(-8px); } }
    @media (prefers-reduced-motion: reduce) { .backdrop, .card, .ico { animation: none; } }
  `,
})
export class AnnounceModalComponent {
  private readonly settings = inject(SettingsService).settings;
  private readonly season = inject(SeasonService);
  private readonly router = inject(Router);
  private readonly seen = signal(readSeen());
  private readonly ready = signal(false);

  /** Modal đang hiện: mở lại từ chuông, hoặc thông báo modal mới nhất chưa xem (đợi thiệp dịp lễ đóng). */
  readonly current = computed<Announcement | undefined>(() => {
    const list = activeAnnouncements(this.settings().announcements).filter((a) => a.type === 'modal');
    const forced = announceModalOpen();
    if (forced) return list.find((a) => a.id === forced);
    if (!this.ready() || this.season.popupOpen()) return undefined;
    return list.find((a) => !this.seen().includes(a.id));
  });

  constructor() {
    // Chờ trang tải xong một chút rồi mới hiện (để thiệp dịp lễ — nếu có — hiện trước).
    setTimeout(() => this.ready.set(true), 1200);
    effect(() => {
      const a = this.current();
      document.documentElement.style.overflow = a ? 'hidden' : '';
    });
  }

  close(a: Announcement): void {
    announceModalOpen.set(null);
    if (this.seen().includes(a.id)) return;
    const next = [...this.seen(), a.id].slice(-50);
    this.seen.set(next);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(next));
    } catch {
      /* bỏ qua */
    }
  }

  press(a: Announcement, link?: string): void {
    this.close(a);
    if (!link) return;
    if (link.startsWith('/')) void this.router.navigateByUrl(link);
    else window.open(link, '_blank', 'noopener');
  }
}

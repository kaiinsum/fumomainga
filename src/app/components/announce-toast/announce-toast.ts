import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Announcement } from '../../models/site-settings';
import { SettingsService } from '../../services/settings.service';
import { IconComponent } from '../../shared/icon';

const SEEN_KEY = 'fumo.announce.seen';

function readSeen(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Thông báo hệ thống còn hạn (mới nhất trước). */
export function activeAnnouncements(list: Announcement[] | undefined, now = Date.now()): Announcement[] {
  return (list ?? []).filter((a) => !a.expiresAt || a.expiresAt > now).sort((a, b) => b.createdAt - a.createdAt);
}

/** Khung thông báo nổi góc trái dưới: hiện thông báo hệ thống mới nhất khách chưa đóng. */
@Component({
  imports: [IconComponent],
  selector: 'app-announce-toast',
  template: `
    @if (current(); as a) {
      <div class="toast" role="status" aria-live="polite">
        <span class="ico" aria-hidden="true"><app-icon [icon]="a.icon" /></span>
        <div class="txt" [class.link]="!!a.link" (click)="go(a)">
          <b>{{ a.title }}</b>
          <p>{{ a.content }}</p>
          @if (a.link) { <span class="more">Xem chi tiết →</span> }
        </div>
        <button type="button" class="x" (click)="dismiss(a)" aria-label="Đóng thông báo">✕</button>
      </div>
    }
  `,
  styles: `
    .toast { position: fixed; left: 16px; bottom: 16px; z-index: 70; width: min(360px, calc(100vw - 32px)); display: flex; gap: 12px; align-items: flex-start;
      padding: 14px 14px 14px 16px; border-radius: 16px; background: var(--surface); color: var(--text); border: 1px solid var(--border);
      border-left: 5px solid var(--primary); box-shadow: 0 16px 40px rgba(0,0,0,.2); animation: slide .4s cubic-bezier(.2, 1.3, .4, 1); }
    .ico { font-size: 1.8rem; line-height: 1; }
    .txt { flex: 1; min-width: 0; }
    .txt.link { cursor: pointer; }
    b { display: block; font-size: .95rem; }
    p { margin: 2px 0 0; font-size: .85rem; color: var(--muted); line-height: 1.45; }
    .more { display: inline-block; margin-top: 4px; font-size: .8rem; font-weight: 800; color: var(--primary-dark); }
    .x { border: 0; background: var(--surface-2); color: var(--muted); width: 28px; height: 28px; border-radius: 50%; cursor: pointer; flex: none; }
    .x:hover { color: var(--text); }
    @keyframes slide { from { opacity: 0; transform: translateY(20px) scale(.96); } }
    @media (max-width: 600px) { .toast { left: 10px; right: 70px; bottom: 10px; width: auto; } }
    @media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
  `,
})
export class AnnounceToastComponent {
  private readonly settings = inject(SettingsService).settings;
  private readonly router = inject(Router);
  private readonly seen = signal(readSeen());
  readonly current = computed(() =>
    activeAnnouncements(this.settings().announcements).find((a) => a.type !== 'modal' && !this.seen().includes(a.id)),
  );

  dismiss(a: Announcement): void {
    const next = [...this.seen(), a.id].slice(-50);
    this.seen.set(next);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(next));
    } catch {
      /* bỏ qua */
    }
  }

  go(a: Announcement): void {
    if (!a.link) return;
    this.dismiss(a);
    if (a.link.startsWith('/')) void this.router.navigateByUrl(a.link);
    else window.open(a.link, '_blank', 'noopener');
  }
}

import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { CustomerNotice, buildNotices, toDay } from '../../models/notifications';
import { ProductService } from '../../services/product.service';
import { SettingsService } from '../../services/settings.service';
import { SeasonService } from '../../services/season.service';
import { seasonRange } from '../../models/seasons';

const SEEN_KEY = 'fumo.notify.seen';

function readSeen(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Chuông thông báo cho khách: sản phẩm mới, minigame mới ra mắt trong N ngày (admin chỉnh N). */
@Component({
  selector: 'app-notify-bell',
  imports: [RouterLink],
  template: `
    @if (enabled()) {
      <button
        type="button"
        class="bell"
        [class.ring]="unread() > 0"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="unread() ? 'Thông báo, ' + unread() + ' mục mới' : 'Thông báo'"
        title="Thông báo"
        (click)="toggle()"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        @if (unread()) { <span class="badge">{{ unread() > 9 ? '9+' : unread() }}</span> }
      </button>

      @if (open()) {
        <div class="panel" role="dialog" aria-label="Thông báo">
          <header>
            <b>🔔 Thông báo</b>
            <small>Ra mắt trong {{ days() }} ngày qua</small>
          </header>
          @if (items().length) {
            <ul>
              @for (n of items(); track n.key) {
                <li [class.new]="fresh().has(n.key)">
                  <a [routerLink]="n.kind === 'season' ? null : n.link" [attr.tabindex]="n.kind === 'season' ? 0 : null" [attr.role]="n.kind === 'season' ? 'button' : null" (click)="pick(n.kind, $event)">
                    @if (n.image) {
                      <img [src]="n.image" alt="" loading="lazy" />
                    } @else {
                      <span class="ico" aria-hidden="true">{{ n.kind === 'season' ? n.icon : n.kind === 'game' ? '🎮' : '🧸' }}</span>
                    }
                    <span class="txt">
                      <span class="kind" [class.game]="n.kind === 'game'" [class.season]="n.kind === 'season'">{{ n.kind === 'season' ? 'Chủ đề dịp lễ' : n.kind === 'game' ? 'Minigame mới' : 'Sản phẩm mới' }}</span>
                      <b>{{ n.title }}</b>
                      @if (n.content) { <span class="content">{{ n.content }}</span> }
                      <time [attr.datetime]="iso(n.date)">📅 {{ n.kind === 'season' ? 'Từ' : 'Ra mắt' }} {{ fmt(n.date) }} · {{ ago(n.date) }}</time>
                    </span>
                  </a>
                </li>
              }
            </ul>
          } @else {
            <p class="empty">Chưa có sản phẩm hay minigame mới trong {{ days() }} ngày qua.<br />Quay lại sau nhé! ✨</p>
          }
        </div>
      }
    }
  `,
  styles: `
    :host { position: relative; display: block; }
    .bell {
      position: relative; width: 42px; height: 42px; display: grid; place-items: center; cursor: pointer;
      border: 1.5px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--primary-dark);
      transition: border-color .2s, box-shadow .2s, color .2s;
    }
    .bell:hover, .bell[aria-expanded='true'] { border-color: var(--primary); color: var(--primary); box-shadow: 0 0 0 4px var(--primary-100); }
    .bell.ring svg { animation: ring 2.4s ease-in-out infinite; transform-origin: 50% 10%; }
    @keyframes ring { 0%, 70%, 100% { transform: rotate(0); } 75% { transform: rotate(14deg); } 82% { transform: rotate(-12deg); } 89% { transform: rotate(8deg); } 95% { transform: rotate(-4deg); } }
    .badge {
      position: absolute; top: -6px; right: -6px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 999px;
      display: grid; place-items: center; font-size: .7rem; font-weight: 800; background: #ff4d6d; color: #fff;
      box-shadow: 0 0 0 2px var(--surface);
    }
    .panel {
      position: absolute; top: calc(100% + 10px); right: -8px; z-index: 60; width: 360px; max-height: min(70vh, 520px);
      display: flex; flex-direction: column; overflow: hidden;
      background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 16px;
      box-shadow: 0 18px 44px color-mix(in srgb, var(--primary) 25%, rgba(0,0,0,.25)); animation: drop .2s ease;
    }
    @keyframes drop { from { opacity: 0; transform: translateY(-6px); } }
    header { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
    header small { color: var(--muted); font-size: .78rem; }
    ul { list-style: none; margin: 0; padding: 6px; overflow-y: auto; }
    li a { display: flex; gap: 12px; padding: 10px; border-radius: 12px; color: inherit; text-decoration: none; transition: background .15s; }
    li a:hover { background: var(--surface-2); }
    li.new a { background: color-mix(in srgb, var(--primary) 9%, transparent); }
    li.new a:hover { background: color-mix(in srgb, var(--primary) 15%, transparent); }
    img, .ico { flex: none; width: 52px; height: 52px; border-radius: 12px; object-fit: cover; background: var(--surface-2); }
    .ico { display: grid; place-items: center; font-size: 1.6rem; }
    .txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; line-height: 1.35; }
    .kind { align-self: flex-start; font-size: .68rem; font-weight: 800; padding: 1px 8px; border-radius: 999px; background: var(--primary-100); color: var(--primary-dark); }
    .kind.season { background: color-mix(in srgb, #ff7a00 18%, transparent); color: #d35f00; }
    .kind.game { background: color-mix(in srgb, #b06bff 18%, transparent); color: #8a4fd8; }
    b { font-size: .93rem; }
    .content { font-size: .82rem; color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    time { font-size: .74rem; color: var(--muted); font-weight: 600; }
    .empty { margin: 0; padding: 28px 20px; text-align: center; color: var(--muted); font-size: .9rem; }
    @media (max-width: 600px) {
      :host { position: static; }
      .bell { width: 38px; height: 38px; border-radius: 11px; }
      .panel { position: fixed; top: calc(var(--header-h) + 4px); left: 10px; right: 10px; width: auto; }
    }
    @media (prefers-reduced-motion: reduce) { .bell.ring svg, .panel { animation: none; } }
  `,
})
export class NotifyBellComponent {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly settings = inject(SettingsService).settings;
  private readonly products = inject(ProductService).shop;

  readonly open = signal(false);
  private readonly seen = signal<string[]>(readSeen());
  /** Mục chưa xem lúc mở bảng (tô nổi bật trong lần xem này). */
  readonly fresh = signal<Set<string>>(new Set());

  readonly enabled = computed(() => this.settings().notifyEnabled !== false);
  readonly days = computed(() => Math.max(1, Math.min(365, Math.round(this.settings().notifyDays || 14))));
  private readonly season = inject(SeasonService);

  /** Bấm 1 thông báo: đóng bảng; thông báo chủ đề thì mở lại thiệp chào. */
  pick(kind: string, e: Event): void {
    this.open.set(false);
    if (kind === 'season') {
      e.preventDefault();
      this.season.open();
    }
  }
  readonly items = computed<(CustomerNotice & { icon?: string })[]>(() => {
    const list: (CustomerNotice & { icon?: string })[] = buildNotices(this.products(), this.settings().minigames, this.days());
    // Chủ đề dịp lễ đang bật → thông báo đầu danh sách, bấm vào mở lại thiệp chào.
    const s = this.season.active();
    if (s) {
      const r = seasonRange(s.id, new Date().getFullYear());
      const date = Math.min(Date.now(), Math.max(r.start, this.settings().seasonChangedAt || 0) || Date.now());
      list.unshift({ key: `s:${s.id}:${new Date(r.start).getFullYear()}`, kind: 'season', title: s.title, content: s.message, date, link: '', icon: s.icon });
    }
    return list;
  });
  readonly unread = computed(() => {
    const seen = new Set(this.seen());
    return this.items().filter((n) => !seen.has(n.key)).length;
  });

  constructor() {
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.open.set(false));
  }

  toggle(): void {
    if (this.open()) return this.open.set(false);
    const seen = new Set(this.seen());
    this.fresh.set(new Set(this.items().filter((n) => !seen.has(n.key)).map((n) => n.key)));
    this.open.set(true);
    // Mở bảng = đã xem hết (chỉ giữ khoá còn hiệu lực để bộ nhớ không phình ra).
    const keys = this.items().map((n) => n.key);
    this.seen.set(keys);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(keys));
    } catch {
      /* bỏ qua */
    }
  }

  iso(t: number): string {
    return toDay(t);
  }

  fmt(t: number): string {
    return new Date(t).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  ago(t: number): string {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = Math.round((today.getTime() - t) / 86_400_000);
    return d <= 0 ? 'Hôm nay' : d === 1 ? 'Hôm qua' : `${d} ngày trước`;
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (this.open() && !this.host.contains(e.target as Node)) this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.open.set(false);
  }
}

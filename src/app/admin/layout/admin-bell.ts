import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AdminInboxService } from '../inbox.service';

/** Chuông thông báo admin: đơn hàng chờ duyệt, lời nhắn mới từ khách. */
@Component({
  selector: 'app-admin-bell',
  imports: [RouterLink],
  template: `
    <button type="button" class="bell" [class.ring]="unread() > 0" [attr.aria-expanded]="open()" (click)="toggle()"
      [attr.aria-label]="'Thông báo' + (unread() ? ', ' + unread() + ' mới' : '')" title="Thông báo">
      🔔
      @if (unread()) { <span class="badge">{{ unread() > 99 ? '99+' : unread() }}</span> }
    </button>
    @if (open()) {
      <div class="panel" role="dialog" aria-label="Thông báo quản trị">
        <header>
          <b>Thông báo</b>
          <span>{{ inbox.pendingOrders() }} đơn chờ duyệt · {{ inbox.newMessages() }} lời nhắn mới</span>
        </header>
        @if (inbox.notices().length) {
          <ul>
            @for (n of inbox.notices(); track n.key) {
              <li [class.new]="fresh().has(n.key)">
                <a [href]="n.link" (click)="go($event, n.link)">
                  <span class="ico" [class.contact]="n.kind === 'contact'" [class.storage]="n.kind === 'storage'">{{ n.kind === 'order' ? '🧾' : n.kind === 'storage' ? '💾' : '✉️' }}</span>
                  <span class="txt">
                    <b>{{ n.title }}</b>
                    <span class="content">{{ n.content }}</span>
                    <time>{{ when(n.createdAt) }}</time>
                  </span>
                </a>
              </li>
            }
          </ul>
        } @else {
          <p class="empty">Không có đơn chờ duyệt hay lời nhắn mới. ✨</p>
        }
        <footer>
          <a routerLink="/admin/don-hang" (click)="open.set(false)">Tất cả đơn hàng</a>
          <a routerLink="/admin/lien-he" (click)="open.set(false)">Tất cả lời nhắn</a>
        </footer>
      </div>
    }
  `,
  styles: `
    :host { position: relative; display: block; }
    .bell { position: relative; width: 34px; height: 34px; border-radius: 8px; border: 0; background: none; cursor: pointer; font-size: 1.05rem; line-height: 1; }
    .bell:hover, .bell[aria-expanded='true'] { background: rgba(255,255,255,.12); }
    .bell.ring { animation: ring 2.4s ease-in-out infinite; }
    @keyframes ring { 0%, 70%, 100% { transform: rotate(0); } 76% { transform: rotate(14deg); } 84% { transform: rotate(-12deg); } 92% { transform: rotate(6deg); } }
    .badge { position: absolute; top: -2px; right: -4px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 999px; display: grid; place-items: center;
      background: #d63638; color: #fff; font-size: .65rem; font-weight: 800; }
    .panel { position: absolute; top: calc(100% + 8px); right: 0; z-index: 200; width: 360px; max-height: 70vh; display: flex; flex-direction: column;
      background: #fff; color: #1d2327; border-radius: 12px; box-shadow: 0 16px 40px rgba(0,0,0,.25); overflow: hidden; }
    header { display: flex; flex-direction: column; gap: 2px; padding: 12px 16px; border-bottom: 1px solid #f0f0f1; }
    header span { font-size: .78rem; color: #646970; }
    ul { list-style: none; margin: 0; padding: 6px; overflow-y: auto; }
    li a { display: flex; gap: 10px; padding: 9px 10px; border-radius: 8px; color: inherit; text-decoration: none; }
    li a:hover { background: #f6f7f7; }
    li.new a { background: #fcf0f1; }
    .ico { flex: none; width: 36px; height: 36px; border-radius: 9px; display: grid; place-items: center; background: #fcf9e8; font-size: 1.1rem; }
    .ico.contact { background: #e7f2fd; }
    .ico.storage { background: #fcf0f1; }
    .txt { display: flex; flex-direction: column; min-width: 0; line-height: 1.35; }
    .txt b { font-size: .88rem; }
    .content { font-size: .8rem; color: #50575e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    time { font-size: .72rem; color: #8c8f94; }
    .empty { margin: 0; padding: 24px 16px; text-align: center; color: #646970; font-size: .88rem; }
    footer { display: flex; justify-content: space-between; padding: 10px 16px; border-top: 1px solid #f0f0f1; font-size: .82rem; }
    footer a { color: #2271b1; font-weight: 700; }
    @media (max-width: 600px) { .panel { position: fixed; top: 52px; left: 8px; right: 8px; width: auto; } }
  `,
})
export class AdminBellComponent {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  readonly inbox = inject(AdminInboxService);
  private readonly router = inject(Router);
  readonly open = signal(false);
  readonly fresh = signal<Set<string>>(new Set());
  readonly unread = computed(() => {
    const seen = this.inbox.seen();
    return this.inbox.notices().filter((n) => !seen.has(n.key)).length;
  });

  toggle(): void {
    if (this.open()) return this.open.set(false);
    const seen = this.inbox.seen();
    this.fresh.set(new Set(this.inbox.notices().filter((n) => !seen.has(n.key)).map((n) => n.key)));
    this.open.set(true);
    this.inbox.markAllSeen();
    // Tải lại ngay: mục mới về trong lúc bảng đang mở cũng được tô nổi bật và tính là đã xem.
    void this.inbox.refresh().then(() => {
      if (!this.open()) return;
      const seenNow = this.inbox.seen();
      const added = this.inbox.notices().filter((n) => !seenNow.has(n.key)).map((n) => n.key);
      if (!added.length) return;
      this.fresh.update((s) => new Set([...s, ...added]));
      this.inbox.markAllSeen();
    });
  }

  go(e: Event, link: string): void {
    e.preventDefault();
    this.open.set(false);
    void this.router.navigateByUrl(link);
  }

  when(t: number): string {
    if (!t) return '';
    const min = Math.round((Date.now() - t) / 60_000);
    if (min < 1) return 'Vừa xong';
    if (min < 60) return `${min} phút trước`;
    if (min < 24 * 60) return `${Math.round(min / 60)} giờ trước`;
    return new Date(t).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

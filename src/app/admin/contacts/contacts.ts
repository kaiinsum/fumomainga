import { Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiError, OrderApiService } from '../../services/order-api.service';
import { AdminToastService } from '../toast.service';
import { AdminInboxService } from '../inbox.service';

interface Contact {
  id: number;
  name: string;
  phone: string;
  email: string;
  message: string;
  status: 'new' | 'done';
  adminNote: string;
  createdAt: number;
  updatedAt: number;
}

type Tab = 'new' | 'done' | 'all';

/** Admin → Liên hệ: lời nhắn khách gửi từ trang Liên hệ (lưu trên Supabase). */
@Component({
  selector: 'app-admin-contacts',
  imports: [FormsModule, DatePipe],
  template: `
    <div class="adm-head">
      <h1>Lời nhắn từ khách</h1>
      @if (connected()) {
        <button class="btn ghost small" type="button" [disabled]="loading()" (click)="load()">↻ Tải lại</button>
      }
    </div>

    @if (!connected()) {
      @if (loading()) {
        <div class="adm-notice">⏳ Đang tải...</div>
      } @else if (needKey()) {
        <section class="adm-box narrow">
          <h2>Nhập mã quản trị</h2>
          <form class="box-body" (ngSubmit)="connect()">
            <p class="hint">Nhập giá trị <code>ADMIN_API_KEY</code> đã đặt trên Vercel (dùng chung với trang Đơn hàng).</p>
            <div class="field"><input name="key" type="password" [(ngModel)]="keyInput" aria-label="Mã quản trị" /></div>
            @if (error()) { <p class="err">{{ error() }}</p> }
            <button class="btn primary small" type="submit">Kết nối</button>
          </form>
        </section>
      } @else {
        <div class="adm-notice warn">
          {{ error() }} - xem hướng dẫn cài đặt ở trang <b>Đơn hàng</b>. Nếu vừa thêm tính năng Liên hệ, hãy chạy lại file
          <code>supabase/schema.sql</code> trong Supabase → SQL Editor để tạo bảng <code>contacts</code>.
          <button class="link" type="button" (click)="load()">Thử lại</button>
        </div>
      }
    } @else {
      <nav class="adm-tabs">
        @for (t of tabs(); track t.key) {
          <button type="button" [class.on]="tab() === t.key" (click)="tab.set(t.key)">
            {{ t.label }} <span class="count">({{ t.count }})</span>
          </button>
        }
      </nav>
      <div class="adm-toolbar">
        <span class="spacer"></span>
        <input type="search" placeholder="Tìm tên, SĐT, email, nội dung..." [ngModel]="search()" (ngModelChange)="search.set($event)" />
      </div>

      <div class="list">
        @for (c of rows(); track c.id) {
          <article class="adm-box item" [class.done]="c.status === 'done'">
            <header>
              <div>
                <b>{{ c.name }}</b>
                <span class="when">{{ c.createdAt | date: 'HH:mm dd/MM/yyyy' }}</span>
              </div>
              <span class="badge" [class.new]="c.status === 'new'">{{ c.status === 'new' ? 'Mới' : 'Đã xử lý' }}</span>
            </header>
            <p class="msg">{{ c.message }}</p>
            <div class="contact-links">
              <a [href]="'tel:' + c.phone">📞 {{ c.phone }}</a>
              <a [href]="'https://zalo.me/' + c.phone" target="_blank" rel="noopener">💬 Zalo</a>
              @if (c.email) { <a [href]="'mailto:' + c.email + '?subject=' + replySubject">✉️ {{ c.email }}</a> }
            </div>
            <div class="note-row">
              <input [ngModel]="c.adminNote" (change)="saveNote(c, $any($event.target).value)" placeholder="Ghi chú nội bộ (VD: đã gọi lại, hẹn chiều mai...)" />
              <button class="btn small" [class.primary]="c.status === 'new'" [class.ghost]="c.status === 'done'" type="button" (click)="toggle(c)">
                {{ c.status === 'new' ? '✓ Đánh dấu đã xử lý' : '↺ Chuyển về mới' }}
              </button>
              <button class="mini del" type="button" (click)="remove(c)">Xoá</button>
            </div>
          </article>
        } @empty {
          <p class="empty-msg">{{ loading() ? 'Đang tải...' : 'Chưa có lời nhắn nào.' }}</p>
        }
      </div>
    }
  `,
  styles: `
    .narrow { max-width: 560px; }
    .hint { color: #646970; font-size: .85rem; margin: 0; }
    .err { color: var(--error, #b32d2e); font-weight: 700; margin: 0; }
    .link { background: none; border: none; padding: 0; margin-left: 6px; font: inherit; color: var(--primary-dark); text-decoration: underline; cursor: pointer; }
    .list { display: grid; gap: 12px; }
    .item { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; border-left: 4px solid var(--primary); }
    .item.done { border-left-color: #c3c4c7; opacity: .8; }
    .item header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .when { margin-left: 10px; color: #646970; font-size: .82rem; }
    .badge { font-size: .75rem; font-weight: 800; padding: 3px 10px; border-radius: 999px; background: #f0f0f1; color: #50575e; }
    .badge.new { background: var(--primary); color: var(--on-primary); }
    .msg { margin: 0; white-space: pre-wrap; line-height: 1.55; }
    .contact-links { display: flex; gap: 14px; flex-wrap: wrap; font-size: .88rem; font-weight: 700; }
    .contact-links a { color: var(--primary-dark); }
    .note-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .note-row input { flex: 1; min-width: 200px; font: inherit; padding: 6px 10px; border: 1px solid #c3c4c7; border-radius: 8px; }
    .mini { font: inherit; font-size: .8rem; padding: 4px 10px; border: 1px solid #c3c4c7; border-radius: 6px; background: #fff; cursor: pointer; }
    .mini.del { color: var(--primary-ink); }
    .empty-msg { color: #646970; text-align: center; padding: 32px; }
  `,
})
export class AdminContacts {
  private readonly api = inject(OrderApiService);
  private readonly toast = inject(AdminToastService);

  readonly replySubject = encodeURIComponent('Phản hồi từ Fumo Mai Nga');
  readonly contacts = signal<Contact[]>([]);
  private readonly inbox = inject(AdminInboxService);
  private readonly syncBadge = effect(() => {
    const list = this.contacts();
    if (this.connected()) this.inbox.setMessages(list);
  });
  readonly connected = signal(false);
  readonly loading = signal(false);
  readonly needKey = signal(false);
  readonly error = signal('');
  readonly tab = signal<Tab>('new');
  readonly search = signal('');
  keyInput = '';

  readonly tabs = computed(() => {
    const all = this.contacts();
    return [
      { key: 'new' as Tab, label: 'Mới', count: all.filter((c) => c.status === 'new').length },
      { key: 'done' as Tab, label: 'Đã xử lý', count: all.filter((c) => c.status === 'done').length },
      { key: 'all' as Tab, label: 'Tất cả', count: all.length },
    ];
  });

  readonly rows = computed(() => {
    const term = this.search().trim().toLowerCase();
    const tab = this.tab();
    return this.contacts().filter(
      (c) => (tab === 'all' || c.status === tab) && (!term || [c.name, c.phone, c.email, c.message].some((v) => v.toLowerCase().includes(term))),
    );
  });

  constructor() {
    void this.load();
  }

  async connect(): Promise<void> {
    this.api.setAdminKey(this.keyInput);
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.contacts.set((await this.api.call<{ contacts: Contact[] }>('GET', '/api/contacts', undefined, true)).contacts);
      this.connected.set(true);
      this.needKey.set(false);
    } catch (e) {
      this.connected.set(false);
      const status = e instanceof ApiError ? e.status : 0;
      this.needKey.set(status === 401);
      this.error.set(status === 401 && !this.api.adminKey() ? '' : e instanceof Error ? e.message : 'Không tải được.');
    } finally {
      this.loading.set(false);
    }
  }

  private async patch(c: Contact, body: Partial<Pick<Contact, 'status' | 'adminNote'>>, okMsg: string): Promise<void> {
    try {
      const { contact } = await this.api.call<{ contact: Contact }>('PUT', `/api/contacts/${c.id}`, body, true);
      this.contacts.update((list) => list.map((x) => (x.id === c.id ? contact : x)));
      this.toast.ok(okMsg);
    } catch (e) {
      this.toast.err(e instanceof Error ? e.message : 'Không lưu được.');
    }
  }

  toggle(c: Contact): void {
    void this.patch(c, { status: c.status === 'new' ? 'done' : 'new' }, c.status === 'new' ? 'Đã đánh dấu đã xử lý' : 'Đã chuyển về mới');
  }

  saveNote(c: Contact, note: string): void {
    if (note === c.adminNote) return;
    void this.patch(c, { adminNote: note }, 'Đã lưu ghi chú');
  }

  async remove(c: Contact): Promise<void> {
    if (!confirm(`Xoá lời nhắn của ${c.name}?`)) return;
    try {
      await this.api.call('DELETE', `/api/contacts/${c.id}`, undefined, true);
      this.contacts.update((list) => list.filter((x) => x.id !== c.id));
      this.toast.ok('Đã xoá lời nhắn');
    } catch (e) {
      this.toast.err(e instanceof Error ? e.message : 'Không xoá được.');
    }
  }
}

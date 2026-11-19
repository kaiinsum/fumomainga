import { Injectable, inject, signal } from '@angular/core';
import { OrderApiService } from '../services/order-api.service';

const POLL_MS = 60_000;
const SEEN_KEY = 'fumo.admin.notify.seen';

/** Một mục trong chuông thông báo admin. */
export interface AdminNotice {
  /** 'o:<mã đơn>' hoặc 'c:<id lời nhắn>'. */
  key: string;
  kind: 'order' | 'contact' | 'storage';
  title: string;
  content: string;
  createdAt: number;
  link: string;
}

/**
 * Đơn hàng chờ duyệt + lời nhắn (Liên hệ) chưa xử lý: đếm số trên menu admin và hiện trong chuông thông báo.
 * Tự tải lại mỗi phút khi đang mở trang quản trị; có mục mới thì báo bằng `onNew`.
 * Lỗi (chưa có mã quản trị, mất mạng...) thì im lặng bỏ qua.
 */
@Injectable({ providedIn: 'root' })
export class AdminInboxService {
  private readonly api = inject(OrderApiService);
  private timer?: ReturnType<typeof setInterval>;

  readonly newMessages = signal(0);
  readonly pendingOrders = signal(0);
  /** Vài lời nhắn mới nhất để hiện trên Bảng tin. */
  readonly latest = signal<{ id: number; name: string; message: string; createdAt: number }[]>([]);
  /** Danh sách cho chuông thông báo (mới nhất trước). */
  readonly notices = signal<AdminNotice[]>([]);
  /** Khoá các mục admin đã xem trong chuông. */
  readonly seen = signal<Set<string>>(readSeen());
  /** Gọi khi có đơn / lời nhắn mới xuất hiện sau lần tải đầu tiên. */
  onNew?: (items: AdminNotice[]) => void;

  private orders: AdminNotice[] = [];
  /** Cảnh báo dung lượng (kiểm tra mỗi ~10 phút). */
  private storageNotice: AdminNotice[] = [];
  private storageCheckedAt = 0;
  private contacts: AdminNotice[] = [];
  /** Khoá đã biết (để phát hiện mục mới); null = chưa tải lần nào. */
  private known: Set<string> | null = null;
  private refreshing = false;

  start(): void {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.refresh();
    }, POLL_MS);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async refresh(): Promise<void> {
    if (!this.api.adminKey()) return;
    this.refreshing = true;
    await Promise.all([
      this.api
        .call<{ contacts: { id: number; name: string; phone?: string; message: string; status: string; createdAt: number }[] }>('GET', '/api/contacts', undefined, true)
        .then(({ contacts }) => this.setMessages(contacts))
        .catch(() => undefined),
      this.api
        .list()
        .then(({ orders }) => this.setOrders(orders))
        .catch(() => undefined),
      this.checkStorage(),
    ]);
    this.refreshing = false;
    this.publish();
  }

  /** Trang Liên hệ / Đơn hàng báo số mới ngay khi tải xong, không cần đợi lượt tải kế tiếp. */
  setMessages(list: { id?: number; name?: string; message?: string; status: string; createdAt?: number }[]): void {
    const fresh = list.filter((c) => c.status === 'new').sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    this.newMessages.set(fresh.length);
    if (fresh.every((c) => c.id !== undefined)) {
      this.latest.set(fresh.slice(0, 3).map((c) => ({ id: c.id!, name: c.name ?? '', message: c.message ?? '', createdAt: c.createdAt ?? 0 })));
      this.contacts = fresh.slice(0, 30).map((c) => ({
        key: `c:${c.id}`,
        kind: 'contact',
        title: `Lời nhắn từ ${c.name || 'khách'}`,
        content: (c.message ?? '').replace(/\s+/g, ' ').slice(0, 140),
        createdAt: c.createdAt ?? 0,
        link: '/admin/lien-he',
      }));
    }
    // Gọi từ trang Liên hệ (sau lần tải đầu) → cập nhật chuông luôn.
    if (this.known && !this.refreshing) this.publish();
  }

  setOrders(list: { code?: string; status: string; total?: number; createdAt?: number; customer?: { name?: string } }[]): void {
    const pending = list.filter((o) => o.status === 'pending').sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    this.pendingOrders.set(pending.length);
    if (pending.every((o) => o.code)) {
      this.orders = pending.slice(0, 30).map((o) => ({
        key: `o:${o.code}`,
        kind: 'order',
        title: `Đơn ${o.code} chờ duyệt`,
        content: `${o.customer?.name || 'Khách'} · ${(o.total ?? 0).toLocaleString('vi-VN')} đ`,
        createdAt: o.createdAt ?? 0,
        link: '/admin/don-hang',
      }));
    }
    if (this.known && !this.refreshing) this.publish();
  }

  /** Bộ nhớ cơ sở dữ liệu ≥ 70% → thêm cảnh báo vào chuông (mỗi mức chỉ báo 1 lần mỗi ngày). */
  private async checkStorage(): Promise<void> {
    if (Date.now() - this.storageCheckedAt < 10 * 60_000) return;
    this.storageCheckedAt = Date.now();
    try {
      const s = await this.api.call<{ pct: number; level: 'ok' | 'warn' | 'danger'; dbBytes: number; limitBytes: number }>(
        'GET',
        '/api/analytics?storage=1',
        undefined,
        true,
      );
      const mb = (b: number) => `${(b / 1024 / 1024).toFixed(0)}MB`;
      const day = new Date().toISOString().slice(0, 10);
      this.storageNotice =
        s.level === 'ok'
          ? []
          : [
              {
                key: `s:${s.level}:${day}`,
                kind: 'storage',
                title: s.level === 'danger' ? `🚨 Bộ nhớ sắp đầy (${s.pct}%)` : `⚠ Bộ nhớ đang đầy dần (${s.pct}%)`,
                content: `Đã dùng ${mb(s.dbBytes)} / ${mb(s.limitBytes)} — bấm để dọn dữ liệu cũ không dùng.`,
                createdAt: Date.now(),
                link: '/admin/thong-ke?don=1',
              },
            ];
    } catch {
      /* chưa chạy schema mới / không phải Supabase → bỏ qua */
    }
  }

  /** Đánh dấu đã xem tất cả mục đang có trong chuông. */
  markAllSeen(): void {
    const keys = new Set(this.notices().map((n) => n.key));
    this.seen.set(keys);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...keys]));
    } catch {
      /* bỏ qua */
    }
  }

  private publish(): void {
    const all = [...this.storageNotice, ...[...this.orders, ...this.contacts].sort((a, b) => b.createdAt - a.createdAt)];
    this.notices.set(all);
    const keys = new Set(all.map((n) => n.key));
    if (this.known) {
      const added = all.filter((n) => !this.known!.has(n.key));
      if (added.length) this.onNew?.(added);
    }
    this.known = keys;
  }
}

function readSeen(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

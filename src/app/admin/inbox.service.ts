import { Injectable, inject, signal } from '@angular/core';
import { OrderApiService } from '../services/order-api.service';

const POLL_MS = 60_000;

/**
 * Đếm lời nhắn (Liên hệ) chưa xử lý + đơn hàng chờ duyệt để hiện số trên menu admin.
 * Tự tải lại mỗi phút khi đang mở trang quản trị. Lỗi (chưa có mã quản trị, mất mạng...) thì im lặng bỏ qua.
 */
@Injectable({ providedIn: 'root' })
export class AdminInboxService {
  private readonly api = inject(OrderApiService);
  private timer?: ReturnType<typeof setInterval>;

  readonly newMessages = signal(0);
  readonly pendingOrders = signal(0);
  /** Vài lời nhắn mới nhất để hiện trên Bảng tin. */
  readonly latest = signal<{ id: number; name: string; message: string; createdAt: number }[]>([]);

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
    await Promise.all([
      this.api
        .call<{ contacts: { id: number; name: string; message: string; status: string; createdAt: number }[] }>('GET', '/api/contacts', undefined, true)
        .then(({ contacts }) => {
          const fresh = contacts.filter((c) => c.status === 'new').sort((a, b) => b.createdAt - a.createdAt);
          this.newMessages.set(fresh.length);
          this.latest.set(fresh.slice(0, 3).map(({ id, name, message, createdAt }) => ({ id, name, message, createdAt })));
        })
        .catch(() => undefined),
      this.api
        .list()
        .then(({ orders }) => this.pendingOrders.set(orders.filter((o) => o.status === 'pending').length))
        .catch(() => undefined),
    ]);
  }

  /** Trang Liên hệ / Đơn hàng báo số mới ngay khi tải xong, không cần đợi lượt tải kế tiếp. */
  setMessages(list: { status: string }[]): void {
    this.newMessages.set(list.filter((c) => c.status === 'new').length);
  }

  setOrders(list: { status: string }[]): void {
    this.pendingOrders.set(list.filter((o) => o.status === 'pending').length);
  }
}

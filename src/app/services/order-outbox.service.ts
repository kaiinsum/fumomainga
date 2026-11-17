import { Injectable, inject, signal } from '@angular/core';
import { Customer, OrderItem } from '../models/order';
import { ApiError, OrderApiService } from './order-api.service';

/** Đơn đã hiện QR cho khách nhưng chưa gửi được lên máy chủ (mạng yếu, khách chuyển app...). */
export interface OutboxOrder {
  code: string;
  customer: Customer;
  items: OrderItem[];
  tries: number;
  createdAt: number;
}

const KEY = 'fumo.order.outbox.v1';
const RETRY_MS = 20_000;

/**
 * "Hộp thư chờ" đơn hàng trên máy khách: tự gửi lại khi có mạng, khi quay lại tab,
 * hoặc khi khách mở lại website — để không mất đơn nào.
 */
@Injectable({ providedIn: 'root' })
export class OrderOutboxService {
  private readonly api = inject(OrderApiService);
  readonly pending = signal<OutboxOrder[]>(this.read());
  private timer?: ReturnType<typeof setInterval>;
  private flushing = false;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    addEventListener('online', () => void this.flush());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void this.flush();
    });
    void this.flush();
  }

  enqueue(o: Omit<OutboxOrder, 'tries' | 'createdAt'>): void {
    this.write([...this.pending().filter((x) => x.code !== o.code), { ...o, tries: 0, createdAt: Date.now() }]);
    this.schedule();
  }

  has(code: string): boolean {
    return this.pending().some((o) => o.code === code);
  }

  /** Gửi lại mọi đơn đang chờ. Trả về true nếu không còn đơn nào chờ. */
  async flush(): Promise<boolean> {
    if (this.flushing || !this.pending().length) return !this.pending().length;
    this.flushing = true;
    try {
      for (const o of [...this.pending()]) {
        try {
          await this.api.create(o.customer, o.items, o.code);
          this.remove(o.code);
        } catch (e) {
          const status = e instanceof ApiError ? e.status : 0;
          // Lỗi dữ liệu (400) gửi lại cũng không được → bỏ, tránh thử mãi. Lỗi khác (mạng, 404, 429, 5xx) → thử lại sau.
          if (status === 400 || status === 422) this.remove(o.code);
          else this.write(this.pending().map((x) => (x.code === o.code ? { ...x, tries: x.tries + 1 } : x)));
        }
      }
    } finally {
      this.flushing = false;
      this.schedule();
    }
    return !this.pending().length;
  }

  private schedule(): void {
    clearInterval(this.timer);
    if (this.pending().length) this.timer = setInterval(() => void this.flush(), RETRY_MS);
  }

  private remove(code: string): void {
    this.write(this.pending().filter((o) => o.code !== code));
  }

  private write(list: OutboxOrder[]): void {
    this.pending.set(list);
    try {
      if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
      else localStorage.removeItem(KEY);
    } catch {
      /* bỏ qua */
    }
  }

  private read(): OutboxOrder[] {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
}

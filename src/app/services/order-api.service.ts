import { Injectable, signal } from '@angular/core';
import { Customer, Order, OrderItem, OrderStatus, PublicOrder } from '../models/order';

const ADMIN_KEY = 'fumo.admin.apiKey';

/** Lỗi API kèm mã HTTP (401: sai mã quản trị, 503: máy chủ chưa cấu hình...). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Gọi các API trên máy chủ (Vercel Functions trong thư mục /api) — đơn hàng và dùng chung mã quản trị. */
@Injectable({ providedIn: 'root' })
export class OrderApiService {
  /** Mã quản trị (ADMIN_API_KEY) admin nhập một lần, nhớ trên máy admin. */
  readonly adminKey = signal(this.readKey());

  setAdminKey(key: string): void {
    this.adminKey.set(key.trim());
    try {
      if (key.trim()) localStorage.setItem(ADMIN_KEY, key.trim());
      else localStorage.removeItem(ADMIN_KEY);
    } catch {
      /* bỏ qua */
    }
  }

  // ---------- Khách ----------
  /**
   * Đặt hàng. keepalive: yêu cầu vẫn chạy tiếp nếu khách chuyển sang app ngân hàng / đóng tab;
   * quá 15 giây thì báo lỗi để đưa vào hộp thư chờ gửi lại.
   */
  create(customer: Customer, items: OrderItem[], code?: string): Promise<{ code: string; total: number; createdAt: number }> {
    return this.call('POST', '/api/orders', { customer, items, code }, false, { keepalive: true, timeoutMs: 30000 });
  }

  lookup(code: string, phone: string): Promise<{ order: PublicOrder }> {
    return this.call('POST', '/api/orders/lookup', { code, phone });
  }

  confirmPaid(code: string, phone: string): Promise<{ ok: boolean }> {
    return this.call('POST', '/api/orders/confirm', { code, phone });
  }

  // ---------- Admin ----------
  list(): Promise<{ orders: Order[] }> {
    return this.call('GET', '/api/orders', undefined, true);
  }

  adminCreate(data: { customer: Customer; items: OrderItem[]; status: OrderStatus; adminNote: string }): Promise<{ code: string }> {
    return this.call('POST', '/api/orders', data, true);
  }

  update(code: string, patch: Partial<Pick<Order, 'status' | 'customer' | 'items' | 'adminNote'>>): Promise<{ order: Order }> {
    return this.call('PUT', `/api/orders/${encodeURIComponent(code)}`, patch, true);
  }

  remove(code: string): Promise<{ ok: boolean }> {
    return this.call('DELETE', `/api/orders/${encodeURIComponent(code)}`, undefined, true);
  }

  /** Gọi API của site; admin = true thì gửi kèm mã quản trị. Dùng chung cho các API admin khác. */
  async call<T>(method: string, url: string, body?: unknown, admin = false, opts: { keepalive?: boolean; timeoutMs?: number } = {}): Promise<T> {
    let res: Response;
    const ctrl = new AbortController();
    const timer = opts.timeoutMs ? setTimeout(() => ctrl.abort(), opts.timeoutMs) : undefined;
    try {
      res = await fetch(url, {
        method,
        keepalive: opts.keepalive,
        signal: ctrl.signal,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(admin ? { 'x-admin-key': this.adminKey() } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.', 0);
    } finally {
      clearTimeout(timer);
    }
    const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (admin && res.status === 401 && this.adminKey().startsWith('t1.')) {
      // Phiên đăng nhập cũ (mật khẩu đã đổi ở máy khác / hết hạn) → xoá và đưa về trang đăng nhập.
      this.setAdminKey('');
      dispatchEvent(new Event('fumo:admin-expired'));
    }
    if (!res.ok || !data) {
      const fallback = res.status === 404 && !data ? 'Máy chủ đơn hàng chưa sẵn sàng (chỉ chạy khi deploy trên Vercel).' : 'Có lỗi xảy ra, vui lòng thử lại.';
      throw new ApiError(data?.error || fallback, res.status);
    }
    return data;
  }

  private readKey(): string {
    try {
      return localStorage.getItem(ADMIN_KEY) ?? '';
    } catch {
      return '';
    }
  }
}

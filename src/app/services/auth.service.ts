import { Injectable, inject, signal } from '@angular/core';
import { STORAGE_KEYS } from '../core/storage';
import { ApiError, OrderApiService } from './order-api.service';

const SESSION_KEY = 'fumo.admin.session';
/** Phiên hết hạn sau 2 giờ không thao tác (không chuyển trang trong admin). */
const SESSION_TTL = 2 * 60 * 60 * 1000;
export const DEFAULT_ADMIN_PASSWORD = 'admin123';

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Máy chủ không có / chưa cấu hình API (chạy thử trên máy, chưa đặt ADMIN_API_KEY) → kiểm tra mật khẩu trên trình duyệt. */
const offline = (e: unknown) => e instanceof ApiError && (e.status === 0 || e.status === 404 || e.status === 503);

/**
 * Đăng nhập admin. Có máy chủ (Vercel): mật khẩu kiểm tra trên máy chủ → mọi máy dùng chung một mật khẩu,
 * đổi mật khẩu là mật khẩu cũ hết dùng được ở mọi nơi. Không có máy chủ: kiểm tra trên trình duyệt (bản chạy thử).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(OrderApiService);
  readonly loggedIn = signal(this.sessionValid());
  readonly usingDefaultPassword = signal(!this.read(localStorage, STORAGE_KEYS.adminPass));

  constructor() {
    addEventListener('fumo:admin-expired', () => {
      if (!this.loggedIn()) return;
      this.logout();
      location.assign('/admin/dang-nhap?next=' + encodeURIComponent(location.pathname));
    });
  }

  /** Trả về '' nếu đúng, ngược lại là lời báo lỗi. */
  async login(password: string): Promise<string> {
    try {
      const { token } = await this.api.call<{ token: string }>('POST', '/api/admin/login', { password }, false, { timeoutMs: 15000 });
      // Phiên đăng nhập máy chủ dùng luôn làm "mã quản trị" cho trang Đơn hàng, Trợ lý AI...
      this.api.setAdminKey(token);
      this.write(localStorage, STORAGE_KEYS.adminPass, await sha256(password));
    } catch (e) {
      if (!offline(e)) return e instanceof ApiError && e.status === 401 ? 'Mật khẩu không đúng.' : e instanceof Error ? e.message : 'Không đăng nhập được.';
      if ((await sha256(password)) !== (await this.currentHash())) return 'Mật khẩu không đúng.';
    }
    this.touch();
    this.loggedIn.set(true);
    return '';
  }

  logout(): void {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* bỏ qua */
    }
    this.loggedIn.set(false);
  }

  /** Dùng trong guard: phiên còn hạn thì gia hạn thêm, hết hạn thì đăng xuất. */
  check(): boolean {
    if (!this.sessionValid()) {
      this.logout();
      return false;
    }
    this.touch();
    return true;
  }

  private sessionValid(): boolean {
    return Number(this.read(sessionStorage, SESSION_KEY)) > Date.now();
  }

  private touch(): void {
    this.write(sessionStorage, SESSION_KEY, String(Date.now() + SESSION_TTL));
  }

  /** Đổi mật khẩu trên máy chủ (áp dụng cho mọi máy). Trả về '' nếu thành công, ngược lại là lời báo lỗi. */
  async changePassword(oldPassword: string, newPassword: string): Promise<{ error: string; localOnly?: boolean }> {
    try {
      const { token } = await this.api.call<{ token: string }>('PUT', '/api/admin/password', { oldPassword, newPassword }, true, { timeoutMs: 15000 });
      this.api.setAdminKey(token);
    } catch (e) {
      if (!offline(e)) return { error: e instanceof Error ? e.message : 'Không đổi được mật khẩu.' };
      // Không có máy chủ: chỉ đổi trên trình duyệt này.
      if ((await sha256(oldPassword)) !== (await this.currentHash())) return { error: 'Mật khẩu hiện tại không đúng.' };
      this.write(localStorage, STORAGE_KEYS.adminPass, await sha256(newPassword));
      this.usingDefaultPassword.set(false);
      return { error: '', localOnly: true };
    }
    this.write(localStorage, STORAGE_KEYS.adminPass, await sha256(newPassword));
    this.usingDefaultPassword.set(false);
    return { error: '' };
  }

  private async currentHash(): Promise<string> {
    return this.read(localStorage, STORAGE_KEYS.adminPass) ?? (await sha256(DEFAULT_ADMIN_PASSWORD));
  }

  private read(store: Storage, key: string): string | null {
    try {
      return store.getItem(key);
    } catch {
      return null;
    }
  }

  private write(store: Storage, key: string, value: string): void {
    try {
      store.setItem(key, value);
    } catch {
      /* bỏ qua */
    }
  }
}

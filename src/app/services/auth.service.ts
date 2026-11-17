import { Injectable, signal } from '@angular/core';
import { STORAGE_KEYS } from '../core/storage';

const SESSION_KEY = 'fumo.admin.session';
export const DEFAULT_ADMIN_PASSWORD = 'admin123';

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Đăng nhập admin phía trình duyệt.
 * LƯU Ý: chỉ là "khoá cửa" cho bản demo không có máy chủ — không phải bảo mật thật.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly loggedIn = signal(this.read(sessionStorage, SESSION_KEY) === '1');
  readonly usingDefaultPassword = signal(!this.read(localStorage, STORAGE_KEYS.adminPass));

  async login(password: string): Promise<boolean> {
    const ok = (await sha256(password)) === (await this.currentHash());
    if (ok) {
      this.write(sessionStorage, SESSION_KEY, '1');
      this.loggedIn.set(true);
    }
    return ok;
  }

  logout(): void {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* bỏ qua */
    }
    this.loggedIn.set(false);
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
    if ((await sha256(oldPassword)) !== (await this.currentHash())) return false;
    this.write(localStorage, STORAGE_KEYS.adminPass, await sha256(newPassword));
    this.usingDefaultPassword.set(false);
    return true;
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

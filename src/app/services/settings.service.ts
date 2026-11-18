import { Injectable, effect, inject, signal } from '@angular/core';
import { STORAGE_KEYS, loadJson, saveJson } from '../core/storage';
import { DEFAULT_SETTINGS, FONT_OPTIONS, SiteSettings, googleFontUrl } from '../models/site-settings';
import { OrderApiService } from './order-api.service';

const FONT_LINK_ID = 'site-font';

/** Các giá trị mặc định của phiên bản trước -> chuyển sang bảng màu một tông #60B5FF. */
function migrate(s: SiteSettings): SiteSettings {
  const next = { ...s };
  if (next.primaryColor.toLowerCase() === '#ff6fa3') next.primaryColor = DEFAULT_SETTINGS.primaryColor;
  // Nền trùng màu chủ đạo sẽ làm nút "biến mất" -> dùng sắc nhạt của màu chủ đạo.
  if (next.backgroundColor.toLowerCase() === next.primaryColor.toLowerCase()) {
    next.backgroundColor = DEFAULT_SETTINGS.backgroundColor;
  }
  return next;
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly _settings = signal<SiteSettings>(
    migrate({
      ...DEFAULT_SETTINGS,
      ...loadJson<Partial<SiteSettings>>(STORAGE_KEYS.settings, () => ({})),
    }),
  );

  readonly settings = this._settings.asReadonly();
  private readonly api = inject(OrderApiService);

  /** Xong khi đã thử lấy cài đặt từ máy chủ (thành công hay không). */
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.loadRemote();
    // Áp dụng màu chủ đạo, màu nền và font cho toàn site.
    effect(() => {
      const s = this._settings();
      const root = document.documentElement.style;
      root.setProperty('--primary', s.primaryColor);
      root.setProperty('--bg', s.backgroundColor);
      this.applyFont(s.fontFamily);
    });
  }

  /** Lấy cài đặt admin đã lưu trên máy chủ → mọi khách đều thấy giống nhau (link mạng xã hội, liên hệ, màu...). */
  private async loadRemote(): Promise<void> {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) return;
      const data = (await res.json()) as { settings: Partial<SiteSettings> | null };
      if (!data?.settings) return;
      const next = migrate({ ...DEFAULT_SETTINGS, ...data.settings });
      this._settings.set(next);
      try {
        saveJson(STORAGE_KEYS.settings, next);
      } catch {
        /* bỏ qua */
      }
    } catch {
      /* chưa có máy chủ (chạy thử ở máy) → dùng cài đặt trong trình duyệt */
    }
  }

  /** Lưu trên máy này ngay, rồi gửi lên máy chủ cho mọi khách (cần mã quản trị). */
  save(next: SiteSettings): void {
    saveJson(STORAGE_KEYS.settings, next);
    this._settings.set(structuredClone(next));
  }

  /** Gửi cài đặt lên máy chủ. Trả về thông báo lỗi (nếu có) để trang Cài đặt hiển thị. */
  async publish(next: SiteSettings): Promise<string> {
    try {
      await this.api.call('PUT', '/api/settings', { settings: next }, true);
      return '';
    } catch (e) {
      return e instanceof Error ? e.message : 'Không gửi được lên máy chủ.';
    }
  }

  reset(): void {
    this.save(structuredClone(DEFAULT_SETTINGS));
  }

  /** Nạp font từ Google Fonts (dùng lại thẻ <link> có sẵn trong index.html) và đặt biến --font. */
  applyFont(name: string): void {
    const font = FONT_OPTIONS.find((f) => f.name === name) ?? FONT_OPTIONS[0];
    const href = googleFontUrl(font);
    let link = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = FONT_LINK_ID;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
    document.documentElement.style.setProperty('--font', `'${font.name}'`);
  }
}

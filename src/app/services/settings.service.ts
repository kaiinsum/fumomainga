import { Injectable, effect, signal } from '@angular/core';
import { STORAGE_KEYS, loadJson, saveJson } from '../core/storage';
import { DEFAULT_SETTINGS, FONT_OPTIONS, SiteSettings, googleFontUrl } from '../models/site-settings';

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

  constructor() {
    // Áp dụng màu chủ đạo, màu nền và font cho toàn site.
    effect(() => {
      const s = this._settings();
      const root = document.documentElement.style;
      root.setProperty('--primary', s.primaryColor);
      root.setProperty('--bg', s.backgroundColor);
      this.applyFont(s.fontFamily);
    });
  }

  save(next: SiteSettings): void {
    saveJson(STORAGE_KEYS.settings, next);
    this._settings.set(structuredClone(next));
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

import { Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'fumo.theme';
const MONO_FONT_ID = 'mono-font';
/** Font monospace có bộ ký tự tiếng Việt (Fira Code thì không có). */
const MONO_FONT_URL = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&display=swap';

/**
 * Chế độ sáng / tối cho trang công khai.
 * Mặc định theo cài đặt hệ điều hành; lựa chọn của khách được nhớ trong trình duyệt.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.initial());

  constructor() {
    if (this.theme() === 'dark') this.loadMonoFont();
  }

  toggle(): void {
    this.set(this.theme() === 'dark' ? 'light' : 'dark');
  }

  set(theme: Theme): void {
    if (theme === 'dark') this.loadMonoFont();
    this.theme.set(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* bỏ qua */
    }
  }

  private initial(): Theme {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      /* bỏ qua */
    }
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private loadMonoFont(): void {
    if (document.getElementById(MONO_FONT_ID)) return;
    const link = document.createElement('link');
    link.id = MONO_FONT_ID;
    link.rel = 'stylesheet';
    link.href = MONO_FONT_URL;
    document.head.appendChild(link);
  }
}

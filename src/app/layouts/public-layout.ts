import { Component, OnDestroy, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from '../components/header/header';
import { FooterComponent } from '../components/footer/footer';
import { ThemeService } from '../services/theme.service';
import { SkyBackgroundComponent } from '../components/sky-bg/sky-bg';
import { FloatBubblesComponent } from '../components/float-bubbles/float-bubbles';

@Component({
  selector: 'app-public-layout',
  imports: [RouterOutlet, HeaderComponent, FooterComponent, SkyBackgroundComponent, FloatBubblesComponent],
  // Chế độ tối chỉ áp dụng cho trang công khai (trang admin giữ giao diện sáng).
  host: { '[class.dark]': 'theme.theme() === "dark"' },
  template: `
    <app-sky-bg [theme]="theme.theme()" />
    <app-header />
    <main class="main">
      <router-outlet />
    </main>
    <app-footer />
    <app-float-bubbles />
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 100vh; background: var(--bg); color: var(--text);
      transition: background-color .4s ease, color .4s ease; }
    .main { flex: 1; padding-top: var(--header-h); }
    /* Nội dung nằm trên lớp nền động. */
    .main, app-footer { position: relative; z-index: 1; }
  `,
})
export class PublicLayout implements OnDestroy {
  readonly theme = inject(ThemeService);

  constructor() {
    // Thanh cuộn, ô nhập mặc định của trình duyệt theo đúng chế độ sáng/tối.
    // Nền body cũng tối để khi cuộn quá mép trang không lộ nền sáng.
    effect(() => {
      const dark = this.theme.theme() === 'dark';
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
      document.body.style.background = dark ? 'color-mix(in srgb, #ff2d55 5%, #05080c)' : '';
    });
  }

  ngOnDestroy(): void {
    document.documentElement.style.colorScheme = '';
    document.body.style.background = '';
  }
}

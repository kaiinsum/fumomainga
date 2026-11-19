import { Component, OnDestroy, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from '../components/header/header';
import { FooterComponent } from '../components/footer/footer';
import { ThemeService } from '../services/theme.service';
import { OrderOutboxService } from '../services/order-outbox.service';
import { SkyBackgroundComponent } from '../components/sky-bg/sky-bg';
import { FloatBubblesComponent } from '../components/float-bubbles/float-bubbles';
import { SeasonFxComponent } from '../components/season/season-fx';
import { SeasonPopupComponent } from '../components/season/season-popup';
import { SeasonService } from '../services/season.service';
import { AnnounceToastComponent } from '../components/announce-toast/announce-toast';
import { AnnounceModalComponent } from '../components/announce-toast/announce-modal';

@Component({
  selector: 'app-public-layout',
  imports: [RouterOutlet, HeaderComponent, FooterComponent, SkyBackgroundComponent, FloatBubblesComponent, SeasonFxComponent, SeasonPopupComponent, AnnounceToastComponent, AnnounceModalComponent],
  // Chế độ tối chỉ áp dụng cho trang công khai (trang admin giữ giao diện sáng).
  host: { '[class.dark]': 'theme.theme() === "dark"' },
  template: `
    <app-sky-bg [theme]="theme.theme()" />
    <app-season-fx />
    <app-header />
    <main class="main">
      <router-outlet />
    </main>
    <app-footer />
    <app-float-bubbles />
    <app-season-popup />
    <app-announce-toast />
    <app-announce-modal />
  `,
  styles: `
    /* isolation: tạo lớp xếp chồng riêng để nền động (z-index -1) nằm trên nền trang nhưng dưới mọi nội dung. */
    :host { display: flex; flex-direction: column; min-height: 100vh; background: var(--bg); color: var(--text); position: relative; isolation: isolate;
      transition: background-color .4s ease, color .4s ease; }
    .main { flex: 1; padding-top: var(--header-h); }

  `,
})
export class PublicLayout implements OnDestroy {
  readonly theme = inject(ThemeService);

  constructor() {
    // Gửi lại các đơn chưa lưu được ở lần trước (mạng yếu / khách chuyển app ngân hàng).
    inject(OrderOutboxService).start();
    // Có chủ đề dịp lễ → hiện thiệp chào lần đầu vào web (mỗi phiên 1 lần, trừ khi khách chọn không hiện lại).
    const season = inject(SeasonService);
    effect(() => {
      if (season.active()) setTimeout(() => season.maybeShow(), 600);
    });
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

import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CategoryService } from '../../services/category.service';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-footer',
  imports: [RouterLink],
  template: `
    @let s = settings();
    <footer class="footer">
      <div class="container grid">
        <div>
          <h3>{{ s.logoEmoji }} <span>{{ s.shopName }}</span></h3>
          <p>{{ s.footerText }}</p>
        </div>
        <div>
          <h4>Danh mục</h4>
          @for (c of categories(); track c) {
            <a routerLink="/san-pham" [queryParams]="{ danhMuc: c }">{{ c }}</a>
          }
        </div>
        <div>
          <h4>Thông tin</h4>
          <a routerLink="/tin-tuc">Tin tức</a>
          <a routerLink="/gioi-thieu">Giới thiệu</a>
          <a routerLink="/lien-he">Liên hệ</a>
          <a routerLink="/gio-hang">Giỏ hàng</a>
          <a routerLink="/tra-cuu-don-hang">📦 Tra cứu đơn hàng</a>
          <a routerLink="/mini-game">🎮 Mini game</a>
          @if (s.contactPhone) { <p class="contact">📞 {{ s.contactPhone }}</p> }
        </div>
      </div>
      <p class="copy">© {{ year }} {{ s.shopName }}.</p>
    </footer>
  `,
  styles: `
    .footer { background: var(--footer-bg); color: #fff; padding: 48px 0 20px; margin-top: 40px; }
    .grid { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 32px; }
    h3 span { color: var(--primary); }
    h4 { margin: 0 0 12px; color: #fff; }
    a { display: block; color: rgba(255, 255, 255, .78); padding: 3px 0; transition: color .2s; }
    a:hover { color: var(--primary); }
    p { color: rgba(255, 255, 255, .78); margin: 0; }
    .contact { margin-top: 8px; }
    .copy { text-align: center; margin-top: 32px; font-size: .85rem; opacity: .7; }
    @media (max-width: 700px) { .grid { grid-template-columns: 1fr; gap: 20px; } }
  `,
})
export class FooterComponent {
  readonly settings = inject(SettingsService).settings;
  readonly categories = inject(CategoryService).names;
  readonly year = new Date().getFullYear();
}

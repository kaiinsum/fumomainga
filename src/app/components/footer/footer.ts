import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CategoryService } from '../../services/category.service';
import { SettingsService } from '../../services/settings.service';
import { SeasonService } from '../../services/season.service';

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
          <a routerLink="/chinh-sach">Chính sách</a>
          <a routerLink="/gio-hang">Giỏ hàng</a>
          <a routerLink="/tra-cuu-don-hang">📦 Tra cứu đơn hàng</a>
          <a routerLink="/mini-game">🎮 Mini game</a>
          @if (s.contactPhone) { <p class="contact">📞 {{ s.contactPhone }}</p> }
        </div>
      </div>
      @if (season.active(); as se) {
        <p class="season"><button type="button" (click)="season.open()">{{ se.icon }} Xem lại lời chúc {{ se.name }}</button></p>
      }
      <p class="copy">© {{ year }} {{ s.shopName }} - Designed San Nii.</p>
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
    .season { text-align: center; margin-top: 28px; }
    .season button { font: inherit; font-weight: 700; font-size: .9rem; color: #fff; cursor: pointer; padding: 8px 18px; border-radius: 999px;
      border: 1.5px solid rgba(255, 255, 255, .35); background: rgba(255, 255, 255, .08); transition: background .2s, border-color .2s; }
    .season button:hover { background: rgba(255, 255, 255, .16); border-color: var(--primary); }
    .copy { text-align: center; margin-top: 32px; font-size: .85rem; opacity: .7; }
    @media (max-width: 700px) { .grid { grid-template-columns: 1fr; gap: 20px; } }
  `,
})
export class FooterComponent {
  readonly settings = inject(SettingsService).settings;
  readonly categories = inject(CategoryService).names;
  readonly year = new Date().getFullYear();
  readonly season = inject(SeasonService);
}

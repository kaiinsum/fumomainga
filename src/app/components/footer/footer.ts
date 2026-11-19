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
          @if (s.facebookUrl || s.tiktokUrl || s.shopeeUrl) {
            <div class="social">
              @if (s.facebookUrl) {
                <a class="soc fb" [href]="s.facebookUrl" target="_blank" rel="noopener" title="Facebook" aria-label="Facebook">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 21v-7.5h2.53l.38-2.94H13.5V8.69c0-.85.24-1.43 1.46-1.43h1.56V4.63a20.9 20.9 0 0 0-2.27-.12c-2.25 0-3.79 1.37-3.79 3.9v2.15H7.92v2.94h2.54V21h3.04Z"/></svg>
                </a>
              }
              @if (s.tiktokUrl) {
                <a class="soc tt" [href]="s.tiktokUrl" target="_blank" rel="noopener" title="TikTok" aria-label="TikTok">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.6 2.6 0 0 1-2.6-2.6 2.6 2.6 0 0 1 3.4-2.47V9.67a5.7 5.7 0 0 0-.8-.06 5.69 5.69 0 0 0-5.69 5.69A5.69 5.69 0 0 0 9.86 21a5.69 5.69 0 0 0 5.69-5.69V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.28 4.28 0 0 1-3.25-1.48Z"/></svg>
                </a>
              }
              @if (s.shopeeUrl) {
                <a class="soc sp" [href]="s.shopeeUrl" target="_blank" rel="noopener" title="Shopee" aria-label="Shopee">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5a4.25 4.25 0 0 0-4.2 3.75H4.6a.9.9 0 0 0-.9.96l.95 13.1A1.9 1.9 0 0 0 6.55 22h10.9a1.9 1.9 0 0 0 1.9-1.69l.95-13.1a.9.9 0 0 0-.9-.96h-3.2A4.25 4.25 0 0 0 12 2.5Zm0 1.6a2.65 2.65 0 0 1 2.58 2.15H9.42A2.65 2.65 0 0 1 12 4.1Z"/></svg>
                </a>
              }
            </div>
          }
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
        </div>
        <div class="contact">
          <h4>Liên hệ</h4>
          @if (s.contactAddress) { <p><span aria-hidden="true">📍</span> {{ s.contactAddress }}</p> }
          @if (s.contactPhone) { <p><span aria-hidden="true">📞</span> <a class="inline" [href]="'tel:' + s.contactPhone.replace(/\s+/g, '')">{{ s.contactPhone }}</a></p> }
          @if (s.contactEmail) { <p><span aria-hidden="true">✉️</span> <a class="inline" [href]="'mailto:' + s.contactEmail">{{ s.contactEmail }}</a></p> }
          @if (s.contactHours) { <p><span aria-hidden="true">🕒</span> {{ s.contactHours }}</p> }
          <a routerLink="/lien-he" class="more">Gửi lời nhắn cho shop →</a>
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
    .grid { display: grid; grid-template-columns: 1.6fr 1fr 1fr 1.4fr; gap: 32px; }
    .social { display: flex; gap: 10px; margin-top: 14px; }
    .soc { width: 36px; height: 36px; padding: 0; display: grid; place-items: center; border-radius: 50%; color: #fff;
      background: rgba(255, 255, 255, .1); transition: transform .2s, background .2s; }
    .soc svg { width: 19px; height: 19px; }
    .soc:hover { transform: translateY(-2px); color: #fff; }
    .soc.fb:hover { background: #1877f2; }
    .soc.tt:hover { background: #111; box-shadow: -2px -2px 0 #25f4ee inset, 2px 2px 0 #fe2c55 inset; }
    .soc.sp:hover { background: #ee4d2d; }
    .contact p { display: flex; gap: 8px; margin: 0 0 8px; line-height: 1.5; }
    .contact a.inline { display: inline; padding: 0; }
    .contact .more { margin-top: 4px; font-weight: 700; }
    h3 span { color: var(--primary); }
    h4 { margin: 0 0 12px; color: #fff; }
    a { display: block; color: rgba(255, 255, 255, .78); padding: 3px 0; transition: color .2s; }
    a:hover { color: var(--primary); }
    p { color: rgba(255, 255, 255, .78); margin: 0; }
    .season { text-align: center; margin-top: 28px; }
    .season button { font: inherit; font-weight: 700; font-size: .9rem; color: #fff; cursor: pointer; padding: 8px 18px; border-radius: 999px;
      border: 1.5px solid rgba(255, 255, 255, .35); background: rgba(255, 255, 255, .08); transition: background .2s, border-color .2s; }
    .season button:hover { background: rgba(255, 255, 255, .16); border-color: var(--primary); }
    .copy { text-align: center; margin-top: 32px; font-size: .85rem; opacity: .7; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 600px) { .grid { grid-template-columns: 1fr; gap: 20px; } }
  `,
})
export class FooterComponent {
  readonly settings = inject(SettingsService).settings;
  readonly categories = inject(CategoryService).names;
  readonly year = new Date().getFullYear();
  readonly season = inject(SeasonService);
}

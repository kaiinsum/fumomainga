import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ReviewBrief, VoucherInfo } from '../models/order';
import { OrderApiService } from '../services/order-api.service';
import { SettingsService } from '../services/settings.service';

export interface ReviewSent {
  productId: string;
  review: ReviewBrief;
  voucher: VoucherInfo | null;
}

/**
 * Form đánh giá 1 sản phẩm đã mua: số sao + nội dung (chỉ chữ).
 * Không truyền `code`/`phone` → khách tự nhập mã đơn + SĐT (dùng ở trang sản phẩm).
 */
@Component({
  selector: 'app-review-form',
  imports: [FormsModule],
  template: `
    <form class="rf" (ngSubmit)="send()" novalidate>
      @if (!code()) {
        <div class="ids">
          <div class="field">
            <label [attr.for]="uid + '-code'">Mã đơn hàng</label>
            <input [id]="uid + '-code'" name="code" [(ngModel)]="ownCode" placeholder="FM......" maxlength="20" autocomplete="off" />
          </div>
          <div class="field">
            <label [attr.for]="uid + '-phone'">Số điện thoại đặt hàng</label>
            <input [id]="uid + '-phone'" name="phone" type="tel" [(ngModel)]="ownPhone" maxlength="20" autocomplete="tel" />
          </div>
        </div>
      }
      <div class="stars" role="radiogroup" aria-label="Số sao">
        @for (s of [1, 2, 3, 4, 5]; track s) {
          <button type="button" role="radio" [attr.aria-checked]="rating() === s" [class.on]="s <= (hover() || rating())"
            (mouseenter)="hover.set(s)" (mouseleave)="hover.set(0)" (click)="rating.set(s)" [attr.aria-label]="s + ' sao'">★</button>
        }
        <span class="lbl">{{ labels[(hover() || rating()) - 1] }}</span>
      </div>
      <textarea name="text" [(ngModel)]="text" rows="3" maxlength="1000" placeholder="Bé fumo có xinh không, đóng gói, giao hàng thế nào…"></textarea>
      <small class="muted">{{ text.trim().length }}/1000 · tối thiểu 10 ký tự</small>
      <p class="note">
        💌 Shop đang trong quá trình phát triển, chưa đủ kinh phí đầu tư nên hiện chỉ nhận đánh giá bằng chữ.
        Bạn có thể gửi đánh giá kèm <b>ảnh hoặc video</b> qua
        @if (s().facebookUrl) { <a [href]="s().facebookUrl" target="_blank" rel="noopener">Facebook</a> } @else { Facebook }
        hoặc
        @if (s().tiktokUrl) { <a [href]="s().tiktokUrl" target="_blank" rel="noopener">TikTok</a> } @else { TikTok }
        và tag tụi mình vào nhé!
      </p>
      @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
      <button class="btn primary" type="submit" [disabled]="busy()">{{ busy() ? 'Đang gửi…' : '⭐ Gửi đánh giá' }}</button>
    </form>
  `,
  styles: `
    .rf { display: flex; flex-direction: column; gap: 10px; }
    .ids { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field label { font-weight: 700; font-size: .88rem; }
    .stars { display: flex; align-items: center; gap: 2px; }
    .stars button { border: 0; background: none; padding: 0 2px; font-size: 1.9rem; line-height: 1; cursor: pointer; color: var(--border); transition: transform .12s, color .12s; }
    .stars button.on { color: #ffb400; }
    .stars button:hover { transform: scale(1.15); }
    .lbl { margin-left: 8px; color: var(--muted); font-size: .85rem; font-weight: 700; }
    textarea { width: 100%; font: inherit; padding: 12px; border-radius: 12px; border: 2px solid var(--border); background: var(--surface); color: var(--text); resize: vertical; }
    textarea:focus { outline: none; border-color: var(--primary); }
    .muted { color: var(--muted); }
    .note { margin: 0; padding: 10px 14px; border-radius: 12px; background: var(--surface-2); font-size: .88rem; line-height: 1.55; }
    .note a { color: var(--primary-dark); font-weight: 800; text-decoration: underline; }
    .err { margin: 0; color: var(--error, #b32d2e); font-weight: 700; }
    .rf > .btn { align-self: flex-start; }
    @media (max-width: 560px) { .ids { grid-template-columns: 1fr; } }
  `,
})
export class ReviewFormComponent {
  readonly productId = input.required<string>();
  /** Có sẵn (trang tra cứu đơn) thì ẩn ô nhập mã đơn / SĐT. */
  readonly code = input('');
  readonly phone = input('');
  readonly sent = output<ReviewSent>();

  private readonly api = inject(OrderApiService);
  readonly s = inject(SettingsService).settings;
  readonly uid = 'rf' + Math.random().toString(36).slice(2, 8);
  readonly labels = ['Tệ', 'Chưa ưng', 'Tạm ổn', 'Hài lòng', 'Tuyệt vời!'];
  readonly rating = signal(5);
  readonly hover = signal(0);
  readonly busy = signal(false);
  readonly error = signal('');
  ownCode = '';
  ownPhone = '';
  text = '';

  async send(): Promise<void> {
    this.error.set('');
    const code = (this.code() || this.ownCode).trim();
    const phone = this.phone() || this.ownPhone;
    if (!code || (phone.match(/\d/g) ?? []).length < 9) return this.error.set('Vui lòng nhập mã đơn và số điện thoại đã dùng khi đặt hàng.');
    if (this.text.trim().length < 10) return this.error.set('Bạn viết thêm chút nữa nhé (tối thiểu 10 ký tự).');
    this.busy.set(true);
    try {
      const r = await this.api.sendReview(code, phone, this.productId(), this.rating(), this.text.trim());
      this.sent.emit({ productId: this.productId(), ...r });
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Không gửi được đánh giá.');
    } finally {
      this.busy.set(false);
    }
  }
}

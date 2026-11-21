import { Component, OnInit, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FeedbackDone, FeedbackInfo, ORDER_STATUS_LABEL, OrderStatus, PublicOrder } from '../../models/order';
import { SettingsService } from '../../services/settings.service';
import { OrderApiService } from '../../services/order-api.service';
import { VndPipe } from '../../shared/vnd.pipe';

/** Các bước hiển thị trên dòng thời gian (đơn huỷ hiển thị riêng). */
const STEPS: OrderStatus[] = ['pending', 'paid', 'shipping', 'done'];

@Component({
  selector: 'app-order-lookup',
  imports: [FormsModule, RouterLink, DatePipe, VndPipe],
  template: `
    <div class="container wrap">
      <nav class="crumbs"><a routerLink="/">Trang chủ</a> / <span>Tra cứu đơn hàng</span></nav>
      <h1>Tra cứu <span class="hl">đơn hàng</span></h1>
      <p class="muted">Nhập mã đơn (ví dụ <code>FMABC123</code>) và số điện thoại bạn dùng khi đặt hàng. Đơn đã thanh toán có thể <b>đánh giá để nhận voucher</b> 🎁</p>

      <form class="search card-surface" (ngSubmit)="search()">
        <div class="field">
          <label for="l-code">Mã đơn hàng</label>
          <input id="l-code" name="code" [(ngModel)]="code" placeholder="FM......" maxlength="20" autocomplete="off" />
        </div>
        <div class="field">
          <label for="l-phone">Số điện thoại</label>
          <input id="l-phone" name="phone" type="tel" [(ngModel)]="phone" maxlength="20" autocomplete="tel" />
        </div>
        <button class="btn primary" type="submit" [disabled]="busy()">{{ busy() ? 'Đang tìm...' : '🔎 Tra cứu' }}</button>
      </form>

      @if (error()) { <p class="err">{{ error() }}</p> }

      @if (order(); as o) {
        <section class="result card-surface">
          <header>
            <div>
              <small class="muted">Mã đơn</small>
              <strong class="code">{{ o.code }}</strong>
            </div>
            <span class="status" [class]="'status s-' + o.status">{{ label[o.status] }}</span>
          </header>

          @if (o.status === 'cancelled') {
            <p class="cancel">Đơn hàng đã bị huỷ. Nếu bạn đã chuyển khoản, vui lòng liên hệ shop để được hỗ trợ.</p>
          } @else {
            <ol class="steps">
              @for (st of steps; track st; let i = $index) {
                <li [class.on]="i <= stepIndex(o.status)" [class.now]="st === o.status">
                  <span class="dot">{{ i < stepIndex(o.status) ? '✓' : i + 1 }}</span>
                  {{ label[st] }}
                </li>
              }
            </ol>
          }

          @if (o.status === 'pending') {
            <p class="muted small">
              {{ o.paidClaimAt ? 'Bạn đã báo chuyển khoản lúc ' + (o.paidClaimAt | date: 'HH:mm dd/MM/yyyy') + ' - shop đang kiểm tra.' : 'Shop chưa nhận được xác nhận chuyển khoản cho đơn này.' }}
            </p>
          }

          <table>
            <tbody>
              @for (it of o.items; track $index) {
                <tr><td>{{ it.name }} × {{ it.qty }}</td><td>{{ it.price * it.qty | vnd }}</td></tr>
              }
            </tbody>
            <tfoot><tr><td>Tổng cộng</td><td>{{ o.total | vnd }}</td></tr></tfoot>
          </table>
          <p class="muted small">
            Người nhận: {{ o.customer.name }} · {{ o.customer.phone }} · Đặt lúc {{ o.createdAt | date: 'HH:mm dd/MM/yyyy' }} ·
            Cập nhật {{ o.updatedAt | date: 'HH:mm dd/MM/yyyy' }}
          </p>
        </section>

        @if (fb(); as f) {
          @if (sent(); as v) {
            <section class="fb card-surface done" aria-live="polite">
              <h2>🎉 Cảm ơn bạn đã đánh giá!</h2>
              <p>Voucher của bạn: <b>{{ v.offer }}</b></p>
              <div class="voucher">
                <code>{{ v.voucher }}</code>
                <button type="button" class="btn ghost small" (click)="copy(v.voucher)">{{ copied() ? '✓ Đã chép' : '📋 Sao chép' }}</button>
              </div>
              <p class="muted small">
                {{ v.expiresAt ? 'Hạn dùng đến ' + (v.expiresAt | date: 'dd/MM/yyyy') + '. ' : '' }}Khi đặt đơn sau, hãy ghi mã này vào ô ghi chú hoặc nhắn cho shop để được áp dụng.
                @if (v.used) { <b> (Mã đã được sử dụng)</b> }
              </p>
              @if (v.text) { <blockquote>{{ '★'.repeat(v.rating) }} {{ v.text }}</blockquote> }
            </section>
          } @else if (f.allowed) {
            <form class="fb card-surface" (ngSubmit)="sendFeedback()">
              <h2>✍️ Đánh giá đơn hàng - nhận voucher</h2>
              <p class="offer">🎁 Đánh giá xong bạn nhận ngay voucher <b>{{ f.offer }}</b>.</p>
              <div class="stars" role="radiogroup" aria-label="Số sao">
                @for (s of [1, 2, 3, 4, 5]; track s) {
                  <button type="button" role="radio" [attr.aria-checked]="rating() === s" [class.on]="s <= (hover() || rating())"
                    (mouseenter)="hover.set(s)" (mouseleave)="hover.set(0)" (click)="rating.set(s)" [attr.aria-label]="s + ' sao'">★</button>
                }
                <span class="muted small">{{ rateLabel[(hover() || rating()) - 1] }}</span>
              </div>
              <textarea name="fbText" [(ngModel)]="fbText" rows="4" maxlength="1000" placeholder="Bé fumo có xinh không, đóng gói, giao hàng thế nào…"></textarea>
              <small class="muted">{{ fbText.trim().length }}/1000 · tối thiểu 10 ký tự</small>
              <p class="note">
                💌 Shop đang trong quá trình phát triển, chưa đủ kinh phí đầu tư nên hiện chỉ nhận đánh giá bằng chữ.
                Bạn có thể gửi đánh giá kèm <b>ảnh hoặc video</b> qua
                @if (social().facebookUrl) { <a [href]="social().facebookUrl" target="_blank" rel="noopener">Facebook</a> } @else { Facebook }
                hoặc
                @if (social().tiktokUrl) { <a [href]="social().tiktokUrl" target="_blank" rel="noopener">TikTok</a> } @else { TikTok }
                và tag tụi mình vào nhé!
              </p>
              @if (fbError()) { <p class="err">{{ fbError() }}</p> }
              <button class="btn primary" type="submit" [disabled]="fbBusy()">{{ fbBusy() ? 'Đang gửi…' : '🎁 Gửi đánh giá & nhận voucher' }}</button>
            </form>
          } @else if (f.enabled && o.status !== 'cancelled') {
            <p class="fb-wait muted small">✍️ Sau khi đơn được thanh toán, bạn có thể quay lại đây để đánh giá và nhận voucher <b>{{ f.offer }}</b>.</p>
          }
        }
      }
    </div>
  `,
  styles: `
    .wrap { max-width: 760px; padding-bottom: 56px; }
    .crumbs { padding: 24px 0 8px; color: var(--muted); font-size: .9rem; }
    .crumbs a:hover { color: var(--primary); }
    h1 { margin: 8px 0 4px; }
    .hl { color: var(--primary); }
    .muted { color: var(--muted); }
    .small { font-size: .85rem; }
    .err { color: var(--error, #b32d2e); font-weight: 700; }
    .search { display: grid; grid-template-columns: 1fr 1fr auto; gap: 12px; align-items: end; padding: 18px; margin: 16px 0; }
    .result { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
    .result header { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .result header div { display: flex; flex-direction: column; }
    .code { font-family: var(--font-mono, ui-monospace, monospace); font-size: 1.5rem; letter-spacing: .08em; color: var(--primary-dark); }
    .status { padding: 5px 14px; border-radius: 999px; font-weight: 800; font-size: .85rem; background: var(--surface-2); border: 1.5px solid var(--border); }
    .status.s-paid, .status.s-shipping { background: var(--primary-100); border-color: var(--primary-300); }
    .status.s-done { background: var(--primary); color: var(--on-primary); border-color: var(--primary); }
    .status.s-cancelled { color: var(--error, #b32d2e); border-color: currentColor; }
    .cancel { margin: 0; padding: 12px; border-radius: 12px; background: var(--surface-2); }
    .steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .steps li { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; font-size: .8rem; color: var(--muted); font-weight: 600; }
    .steps .dot { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; border: 2px solid var(--border); background: var(--surface); }
    .steps li.on { color: var(--text); }
    .steps li.on .dot { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
    .steps li.now .dot { box-shadow: 0 0 0 5px var(--primary-100); }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 8px 0; border-bottom: 1px dashed var(--border); }
    td:last-child { text-align: right; font-weight: 700; }
    tfoot td { border: none; font-weight: 800; font-size: 1.1rem; }
    tfoot td:last-child { color: var(--primary-dark); }
    .fb { margin-top: 16px; padding: 20px; display: flex; flex-direction: column; gap: 10px; }
    .fb h2 { margin: 0; font-size: 1.2rem; }
    .fb .offer { margin: 0; padding: 10px 14px; border-radius: 12px; background: var(--primary-100); border: 1.5px dashed var(--primary-300); }
    .stars { display: flex; align-items: center; gap: 2px; }
    .stars button { border: 0; background: none; padding: 0 2px; font-size: 2rem; line-height: 1; cursor: pointer; color: var(--border); transition: transform .12s, color .12s; }
    .stars button.on { color: #ffb400; }
    .stars button:hover { transform: scale(1.15); }
    .stars .small { margin-left: 8px; }
    .fb textarea { width: 100%; font: inherit; padding: 12px; border-radius: 12px; border: 2px solid var(--border); background: var(--surface); color: var(--text); resize: vertical; }
    .fb textarea:focus { outline: none; border-color: var(--primary); }
    .note { margin: 0; padding: 10px 14px; border-radius: 12px; background: var(--surface-2); font-size: .9rem; line-height: 1.55; }
    .note a { color: var(--primary-dark); font-weight: 800; text-decoration: underline; }
    .fb > .btn { align-self: flex-start; }
    .fb.done { text-align: center; align-items: center; }
    .fb.done p { margin: 0; }
    .voucher { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center; }
    .voucher code { font-size: 1.6rem; font-weight: 900; letter-spacing: .12em; padding: 8px 18px; border-radius: 12px; border: 2px dashed var(--primary); color: var(--primary-dark); background: var(--primary-100); }
    blockquote { margin: 4px 0 0; padding: 10px 14px; border-left: 4px solid var(--primary); background: var(--surface-2); border-radius: 0 10px 10px 0; text-align: left; white-space: pre-line; }
    .fb-wait { margin: 14px 0 0; text-align: center; }
    @media (max-width: 640px) {
      .search { grid-template-columns: 1fr; }
      .steps { grid-template-columns: 1fr 1fr; }
    }
  `,
})
export class OrderLookupPage implements OnInit {
  /** ?ma=FM... từ popup đặt hàng. */
  readonly ma = input<string>();
  private readonly api = inject(OrderApiService);

  readonly label = ORDER_STATUS_LABEL;
  readonly steps = STEPS;
  code = '';
  phone = '';
  readonly busy = signal(false);
  readonly error = signal('');
  readonly order = signal<PublicOrder | null>(null);

  ngOnInit(): void {
    this.code = this.ma() ?? '';
  }

  // ---------- Đánh giá nhận voucher ----------
  readonly social = inject(SettingsService).settings;
  readonly fb = signal<FeedbackInfo | null>(null);
  readonly sent = signal<FeedbackDone | null>(null);
  readonly rating = signal(5);
  readonly hover = signal(0);
  readonly rateLabel = ['Tệ', 'Chưa ưng', 'Tạm ổn', 'Hài lòng', 'Tuyệt vời!'];
  fbText = '';
  readonly fbBusy = signal(false);
  readonly fbError = signal('');
  readonly copied = signal(false);

  async sendFeedback(): Promise<void> {
    this.fbError.set('');
    if (this.fbText.trim().length < 10) return this.fbError.set('Bạn viết thêm chút nữa nhé (tối thiểu 10 ký tự).');
    this.fbBusy.set(true);
    try {
      const r = await this.api.sendFeedback(this.code, this.phone, this.rating(), this.fbText.trim());
      this.sent.set({ ...r, rating: this.rating(), text: this.fbText.trim(), used: false });
    } catch (e) {
      this.fbError.set(e instanceof Error ? e.message : 'Không gửi được đánh giá.');
    } finally {
      this.fbBusy.set(false);
    }
  }

  copy(v: string): void {
    void navigator.clipboard?.writeText(v).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    });
  }

  stepIndex(s: OrderStatus): number {
    return STEPS.indexOf(s);
  }

  async search(): Promise<void> {
    this.error.set('');
    this.order.set(null);
    if (!this.code.trim() || (this.phone.match(/\d/g) ?? []).length < 9) {
      return this.error.set('Vui lòng nhập mã đơn và số điện thoại đã dùng khi đặt hàng.');
    }
    this.busy.set(true);
    this.fb.set(null);
    this.sent.set(null);
    try {
      const r = await this.api.lookup(this.code, this.phone);
      this.order.set(r.order);
      this.fb.set(r.feedback ?? null);
      if (r.feedback?.done) this.sent.set(r.feedback.done);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Không tra cứu được.');
    } finally {
      this.busy.set(false);
    }
  }
}

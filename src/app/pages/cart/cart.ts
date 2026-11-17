import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Customer, EMPTY_CUSTOMER } from '../../models/order';
import { CartService } from '../../services/cart.service';
import { OrderApiService } from '../../services/order-api.service';
import { SettingsService } from '../../services/settings.service';
import { VndPipe } from '../../shared/vnd.pipe';

/** Đơn vừa tạo, đang hiện popup QR chờ duyệt (giữ qua F5 trong cùng tab). */
interface PendingPayment {
  code: string;
  total: number;
  phone: string;
  email: string;
}

const PENDING_KEY = 'fumo.checkout.pending';

@Component({
  selector: 'app-cart',
  imports: [FormsModule, RouterLink, VndPipe],
  template: `
    <div class="container wrap">
      <nav class="crumbs"><a routerLink="/">Trang chủ</a> / <span>Giỏ hàng</span></nav>

      @if (cart.items().length) {
        <!-- ===== Bước 1: giỏ hàng + thông tin nhận hàng ===== -->
        <h1 class="title">Giỏ hàng</h1>
        <div class="layout">
          <section class="lines card-surface">
            @for (l of cart.items(); track l.product.id) {
              <div class="line">
                <img [src]="l.product.images[0]" [alt]="l.product.name" />
                <div class="line-info">
                  <a [routerLink]="['/san-pham', l.product.id]">{{ l.product.name }}</a>
                  <small>{{ l.product.price | vnd }}{{ l.product.inStock ? '' : ' · Hết hàng — shop sẽ liên hệ' }}</small>
                </div>
                <div class="qty">
                  <button type="button" (click)="cart.setQty(l.product.id, l.qty - 1)" aria-label="Giảm">−</button>
                  <span>{{ l.qty }}</span>
                  <button type="button" (click)="cart.setQty(l.product.id, l.qty + 1)" aria-label="Tăng">+</button>
                </div>
                <strong class="sum">{{ l.product.price * l.qty | vnd }}</strong>
                <button class="del" type="button" (click)="cart.remove(l.product.id)" aria-label="Xoá">✕</button>
              </div>
            }
            <div class="total">Tạm tính <strong>{{ cart.total() | vnd }}</strong></div>
          </section>

          <form class="checkout card-surface" (ngSubmit)="submit()">
            <h2>Thông tin nhận hàng</h2>
            <div class="field">
              <label for="c-name">Họ tên *</label>
              <input id="c-name" name="name" [(ngModel)]="customer.name" autocomplete="name" maxlength="80" required />
            </div>
            <div class="field">
              <label for="c-phone">Số điện thoại *</label>
              <input id="c-phone" name="phone" type="tel" [(ngModel)]="customer.phone" autocomplete="tel" maxlength="20" required />
            </div>
            <div class="field">
              <label for="c-email">Email</label>
              <input id="c-email" name="email" type="email" [(ngModel)]="customer.email" autocomplete="email" maxlength="120" />
            </div>
            <div class="field">
              <label for="c-addr">Địa chỉ nhận hàng *</label>
              <textarea id="c-addr" name="address" rows="2" [(ngModel)]="customer.address" autocomplete="street-address" maxlength="300" required></textarea>
            </div>
            <div class="field">
              <label for="c-note">Ghi chú</label>
              <textarea id="c-note" name="note" rows="2" [(ngModel)]="customer.note" maxlength="500" placeholder="Giờ nhận hàng, gói quà..."></textarea>
            </div>
            @if (error()) { <p class="err">{{ error() }}</p> }
            <div class="pay-total">Tổng thanh toán <strong>{{ cart.total() | vnd }}</strong></div>
            <button class="btn primary full" type="submit" [disabled]="busy()">
              {{ busy() ? 'Đang tạo đơn...' : 'Đặt hàng & chuyển khoản →' }}
            </button>
            <small class="muted">Phí ship (nếu có) shop sẽ báo khi xác nhận đơn.</small>
          </form>
        </div>
      } @else {
        <div class="empty card-surface">
          <span>🛒</span>
          <h2>Giỏ hàng trống</h2>
          <p class="muted">Chọn vài bé fumo dễ thương rồi quay lại nhé!</p>
          <div class="row center">
            <a class="btn primary" routerLink="/san-pham">Xem sản phẩm</a>
            <a class="btn ghost" routerLink="/tra-cuu-don-hang">Tra cứu đơn hàng</a>
          </div>
        </div>
      }
    </div>

    @if (pending(); as d) {
      <!-- ===== Popup: mã QR chuyển khoản + chờ shop duyệt đơn ===== -->
      <div class="modal-backdrop">
        <div class="modal card-surface" role="dialog" aria-modal="true" aria-labelledby="done-title">
          <button class="close" type="button" (click)="finish()" aria-label="Đóng">✕</button>
          <h2 id="done-title">⏳ Đơn hàng đang chờ duyệt</h2>
          <p>Vui lòng chuyển khoản <b class="amount">{{ d.total | vnd }}</b> vào tài khoản bên dưới.</p>

          <img class="qr" src="img/qr-thanh-toan.jpg" alt="Mã QR chuyển khoản {{ s().bankAccountName }}" width="720" height="714" />
          <div class="bank-line">
            <span>{{ s().bankName }}</span>
            <span><b>{{ s().bankAccount }}</b> <button type="button" (click)="copy(s().bankAccount)">Sao chép</button></span>
            <span>{{ s().bankAccountName }}</span>
          </div>

          <div class="code-box">
            <small>Mã đơn hàng của bạn</small>
            <strong>{{ d.code }}</strong>
            <button type="button" (click)="copy(d.code)">Sao chép mã</button>
          </div>
          <p class="muted small">
            Sau khi nhận được tiền, shop sẽ duyệt đơn và thông báo cho bạn qua
            {{ d.email ? 'email ' + d.email + ' hoặc ' : '' }}số điện thoại {{ d.phone }}.
            Lưu lại mã đơn để tra cứu bằng mã đơn + số điện thoại.
          </p>

          @if (error()) { <p class="err">{{ error() }}</p> }
          @if (claimed()) {
            <p class="ok">✓ Đã báo shop — vui lòng chờ duyệt nhé!</p>
          } @else {
            <button class="btn primary full" type="button" [disabled]="busy()" (click)="confirmPaid()">
              {{ busy() ? 'Đang gửi...' : '✅ Tôi đã chuyển khoản' }}
            </button>
          }
          <div class="row center">
            <a class="btn ghost" routerLink="/tra-cuu-don-hang" [queryParams]="{ ma: d.code }" (click)="finish()">Tra cứu đơn hàng</a>
            <a class="btn ghost" routerLink="/san-pham" (click)="finish()">Tiếp tục mua sắm</a>
          </div>
        </div>
      </div>
    }

    @if (toast()) { <div class="toast">{{ toast() }}</div> }
  `,
  styles: `
    .wrap { padding-bottom: 56px; }
    .crumbs { padding: 24px 0 8px; color: var(--muted); font-size: .9rem; }
    .crumbs a:hover { color: var(--primary); }
    .title { margin: 8px 0 20px; }
    .muted { color: var(--muted); }
    .small { font-size: .85rem; }
    .err { color: var(--error, #b32d2e); font-weight: 700; margin: 0; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; }
    .row.center { justify-content: center; }
    .layout { display: grid; grid-template-columns: 1.4fr 1fr; gap: 24px; align-items: start; }
    .lines, .checkout { padding: 20px; }
    .line { display: grid; grid-template-columns: 64px 1fr auto auto 28px; gap: 12px; align-items: center; padding: 12px 0; border-bottom: 1px dashed var(--border); }
    .line img { width: 64px; height: 64px; border-radius: 12px; object-fit: cover; }
    .line-info { display: flex; flex-direction: column; min-width: 0; }
    .line-info a { font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .line-info small { color: var(--muted); }
    .qty { display: flex; align-items: center; border: 1.5px solid var(--border); border-radius: 999px; }
    .qty button { width: 30px; height: 30px; border: none; background: none; font: inherit; font-weight: 800; cursor: pointer; color: var(--primary-dark); }
    .qty span { min-width: 22px; text-align: center; font-weight: 700; }
    .sum { min-width: 90px; text-align: right; }
    .del { border: none; background: none; cursor: pointer; color: var(--muted); font-size: 1rem; }
    .del:hover { color: var(--error, #b32d2e); }
    .total, .pay-total { display: flex; justify-content: space-between; align-items: baseline; padding-top: 14px; font-weight: 700; }
    .total strong, .pay-total strong { font-size: 1.3rem; color: var(--primary-dark); }
    .checkout { display: flex; flex-direction: column; gap: 12px; position: sticky; top: calc(var(--header-h) + 16px); }
    .checkout h2 { margin: 0; font-size: 1.2rem; }
    .full { width: 100%; justify-content: center; }

    .bank-line button, .code-box button { font: inherit; font-size: .75rem; font-weight: 700; padding: 3px 10px; margin-left: 6px; border-radius: 999px; border: 1.5px solid var(--border); background: var(--surface); color: var(--primary-dark); cursor: pointer; }
    .code-box button { margin-left: 0; }
    .empty { text-align: center; padding: 56px 16px; margin-top: 12px; }
    .empty span { font-size: 3rem; }

    .modal-backdrop { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,.45); display: grid; place-items: center; padding: 16px; animation: fade .2s ease; }
    .modal { position: relative; width: min(460px, 100%); max-height: calc(100dvh - 32px); overflow-y: auto; padding: 24px 22px; text-align: center; display: flex; flex-direction: column; gap: 10px; animation: pop .35s cubic-bezier(.2,1.4,.4,1); }
    .close { position: absolute; top: 10px; right: 12px; border: none; background: none; font-size: 1.1rem; cursor: pointer; color: var(--muted); }
    .amount { color: var(--primary-dark); font-size: 1.15rem; }
    .qr { width: min(260px, 70vw); height: auto; margin: 0 auto; border-radius: 14px; background: #fff; box-shadow: var(--shadow); }
    .bank-line { display: flex; flex-direction: column; gap: 2px; font-size: .9rem; }
    .bank-line b { font-size: 1.05rem; letter-spacing: .03em; }
    .ok { margin: 0; font-weight: 800; color: var(--primary-dark); }
    .modal h2 { margin: 0; }
    .modal p { margin: 0; }
    .code-box { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 14px; border-radius: 14px; background: var(--surface-2); border: 2px dashed var(--primary-300); }
    .code-box strong { font-family: var(--font-mono, ui-monospace, monospace); font-size: 1.8rem; letter-spacing: .1em; color: var(--primary-dark); }
    .toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 120; background: var(--text); color: var(--surface); padding: 8px 16px; border-radius: 999px; font-weight: 700; font-size: .9rem; }
    @keyframes fade { from { opacity: 0; } }
    @keyframes pop { from { opacity: 0; transform: scale(.9) translateY(10px); } }
    @media (prefers-reduced-motion: reduce) { .modal, .modal-backdrop { animation: none; } }
    @media (max-width: 860px) {
      .layout { grid-template-columns: 1fr; }
      .checkout { position: static; }
      .line { grid-template-columns: 56px 1fr auto 24px; }
      .line img { width: 56px; height: 56px; }
      .sum { display: none; }
    }
  `,
})
export class CartPage {
  readonly cart = inject(CartService);
  private readonly api = inject(OrderApiService);
  readonly s = inject(SettingsService).settings;

  customer: Customer = { ...EMPTY_CUSTOMER };
  readonly busy = signal(false);
  readonly error = signal('');
  readonly toast = signal('');
  readonly pending = signal<PendingPayment | null>(this.readPending());
  /** Khách đã bấm "Tôi đã chuyển khoản" cho đơn đang hiện. */
  readonly claimed = signal(false);

  async submit(): Promise<void> {
    this.error.set('');
    const c = this.customer;
    if (c.name.trim().length < 2) return this.error.set('Vui lòng nhập họ tên.');
    if ((c.phone.match(/\d/g) ?? []).length < 9) return this.error.set('Vui lòng nhập số điện thoại hợp lệ.');
    if (c.address.trim().length < 5) return this.error.set('Vui lòng nhập địa chỉ nhận hàng.');
    this.busy.set(true);
    try {
      const res = await this.api.create(c, this.cart.orderItems());
      const pending: PendingPayment = { code: res.code, total: res.total, phone: c.phone.trim(), email: c.email.trim() };
      this.cart.clear();
      this.claimed.set(false);
      this.setPending(pending);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Không tạo được đơn hàng.');
    } finally {
      this.busy.set(false);
    }
  }

  async confirmPaid(): Promise<void> {
    const p = this.pending();
    if (!p) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.confirmPaid(p.code, p.phone);
      this.claimed.set(true);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Không gửi được xác nhận.');
    } finally {
      this.busy.set(false);
    }
  }

  /** Đóng popup (đơn vẫn được lưu, tra cứu được bằng mã đơn). */
  finish(): void {
    this.setPending(null);
    this.error.set('');
  }

  async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.flash('Đã sao chép');
    } catch {
      this.flash('Không sao chép được — hãy chép tay nhé');
    }
  }

  private flash(msg: string): void {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(''), 1600);
  }

  private setPending(p: PendingPayment | null): void {
    this.pending.set(p);
    try {
      if (p) sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
      else sessionStorage.removeItem(PENDING_KEY);
    } catch {
      /* bỏ qua */
    }
  }

  private readPending(): PendingPayment | null {
    try {
      const p = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null');
      return p && typeof p.code === 'string' ? p : null;
    } catch {
      return null;
    }
  }
}

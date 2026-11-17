import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Customer, EMPTY_CUSTOMER } from '../../models/order';
import { CartService } from '../../services/cart.service';
import { OrderApiService } from '../../services/order-api.service';
import { SettingsService } from '../../services/settings.service';
import { VndPipe } from '../../shared/vnd.pipe';
import { buildVietQr } from '../../shared/vietqr';

/** Đơn vừa tạo, đang chờ khách chuyển khoản (giữ qua F5 trong cùng tab). */
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
      <nav class="crumbs"><a routerLink="/">Trang chủ</a> / <span>{{ pending() ? 'Thanh toán' : 'Giỏ hàng' }}</span></nav>

      @if (pending(); as pay) {
        <!-- ===== Bước 2: chuyển khoản qua QR ===== -->
        <section class="pay card-surface">
          <div class="pay-qr">
            @if (qrUrl()) {
              <img [src]="qrUrl()" alt="Mã QR chuyển khoản" width="300" height="300" />
            } @else {
              <div class="qr-loading">Đang tạo mã QR...</div>
            }
            <small>Quét bằng app ngân hàng bất kỳ (NAPAS 247 / VietQR)</small>
          </div>

          <div class="pay-info">
            <span class="chip">Bước 2 / 2 · Thanh toán</span>
            <h1>Chuyển khoản để hoàn tất đơn</h1>
            <p class="muted">Mã QR đã điền sẵn số tiền và nội dung. Nếu chuyển tay, vui lòng ghi đúng <b>nội dung chuyển khoản</b>.</p>

            <dl class="bank">
              <div><dt>Ngân hàng</dt><dd>{{ s().bankName }}</dd></div>
              <div><dt>Chủ tài khoản</dt><dd>{{ s().bankAccountName }}</dd></div>
              <div>
                <dt>Số tài khoản</dt>
                <dd>{{ s().bankAccount }} <button type="button" (click)="copy(s().bankAccount)">Sao chép</button></dd>
              </div>
              <div>
                <dt>Số tiền</dt>
                <dd class="big">{{ pay.total | vnd }} <button type="button" (click)="copy(pay.total + '')">Sao chép</button></dd>
              </div>
              <div>
                <dt>Nội dung CK</dt>
                <dd class="big code">{{ pay.code }} <button type="button" (click)="copy(pay.code)">Sao chép</button></dd>
              </div>
            </dl>

            @if (error()) { <p class="err">{{ error() }}</p> }
            <div class="row">
              <button class="btn primary" type="button" [disabled]="busy()" (click)="confirmPaid()">
                {{ busy() ? 'Đang gửi...' : '✅ Tôi đã chuyển khoản' }}
              </button>
              <button class="btn ghost" type="button" (click)="cancelPending()">Đặt đơn khác</button>
            </div>
          </div>
        </section>
      } @else if (cart.items().length) {
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

    @if (done(); as d) {
      <!-- ===== Popup: chờ shop xác nhận ===== -->
      <div class="modal-backdrop" (click)="finish()">
        <div class="modal card-surface" role="dialog" aria-modal="true" aria-labelledby="done-title" (click)="$event.stopPropagation()">
          <span class="hourglass">⏳</span>
          <h2 id="done-title">Đang chờ xác nhận chuyển khoản</h2>
          <p>
            Cảm ơn bạn! Shop sẽ kiểm tra giao dịch và duyệt đơn, sau đó thông báo cho bạn qua
            <b>{{ d.email ? 'email ' + d.email + ' hoặc ' : '' }}số điện thoại {{ d.phone }}</b>.
          </p>
          <div class="code-box">
            <small>Mã đơn hàng của bạn</small>
            <strong>{{ d.code }}</strong>
            <button type="button" (click)="copy(d.code)">Sao chép mã</button>
          </div>
          <p class="muted small">Lưu lại mã đơn để tra cứu trạng thái bằng mã đơn + số điện thoại.</p>
          <div class="row center">
            <a class="btn primary" routerLink="/tra-cuu-don-hang" [queryParams]="{ ma: d.code }" (click)="finish()">Tra cứu đơn hàng</a>
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

    .pay { display: grid; grid-template-columns: auto 1fr; gap: 32px; padding: 28px; margin-top: 12px; align-items: center; }
    .pay-qr { display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .pay-qr img, .qr-loading { width: 300px; height: 300px; max-width: 70vw; max-height: 70vw; border-radius: 16px; background: #fff; padding: 10px; box-sizing: border-box; box-shadow: var(--shadow); }
    .qr-loading { display: grid; place-items: center; color: #666; }
    .pay-qr small { color: var(--muted); text-align: center; }
    .pay-info h1 { margin: 8px 0 6px; font-size: clamp(1.5rem, 3vw, 2rem); }
    .bank { margin: 16px 0; display: grid; gap: 8px; }
    .bank div { display: grid; grid-template-columns: 120px 1fr; gap: 10px; align-items: center; padding: 8px 12px; border-radius: 12px; background: var(--surface-2); }
    .bank dt { color: var(--muted); font-size: .85rem; }
    .bank dd { margin: 0; font-weight: 700; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .bank dd.big { font-size: 1.15rem; color: var(--primary-dark); }
    .bank dd.code { font-family: var(--font-mono, ui-monospace, monospace); letter-spacing: .06em; }
    .bank button, .code-box button { font: inherit; font-size: .75rem; font-weight: 700; padding: 3px 10px; border-radius: 999px; border: 1.5px solid var(--border); background: var(--surface); color: var(--primary-dark); cursor: pointer; }

    .empty { text-align: center; padding: 56px 16px; margin-top: 12px; }
    .empty span { font-size: 3rem; }

    .modal-backdrop { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,.45); display: grid; place-items: center; padding: 16px; animation: fade .2s ease; }
    .modal { width: min(460px, 100%); padding: 28px 24px; text-align: center; display: flex; flex-direction: column; gap: 10px; animation: pop .35s cubic-bezier(.2,1.4,.4,1); }
    .modal h2 { margin: 0; }
    .modal p { margin: 0; }
    .hourglass { font-size: 3rem; display: inline-block; animation: flip 2s ease-in-out infinite; }
    .code-box { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 14px; border-radius: 14px; background: var(--surface-2); border: 2px dashed var(--primary-300); }
    .code-box strong { font-family: var(--font-mono, ui-monospace, monospace); font-size: 1.8rem; letter-spacing: .1em; color: var(--primary-dark); }
    .toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 120; background: var(--text); color: var(--surface); padding: 8px 16px; border-radius: 999px; font-weight: 700; font-size: .9rem; }
    @keyframes fade { from { opacity: 0; } }
    @keyframes pop { from { opacity: 0; transform: scale(.9) translateY(10px); } }
    @keyframes flip { 0%, 40% { transform: rotate(0); } 50%, 90% { transform: rotate(180deg); } 100% { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .hourglass, .modal, .modal-backdrop { animation: none; } }
    @media (max-width: 860px) {
      .layout, .pay { grid-template-columns: 1fr; }
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
  readonly done = signal<PendingPayment | null>(null);
  readonly qrUrl = signal('');

  /** Nội dung VietQR: tài khoản shop + số tiền + mã đơn. */
  private readonly qrPayload = computed(() => {
    const p = this.pending();
    const s = this.s();
    return p ? buildVietQr({ bin: s.bankBin, account: s.bankAccount }, p.total, p.code) : '';
  });

  constructor() {
    if (this.pending()) void this.renderQr();
  }

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
      this.setPending(pending);
      void this.renderQr();
      scrollTo({ top: 0, behavior: 'smooth' });
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
      this.done.set(p);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Không gửi được xác nhận.');
    } finally {
      this.busy.set(false);
    }
  }

  /** Đóng popup: xoá đơn chờ khỏi trang thanh toán (mã đơn vẫn tra cứu được). */
  finish(): void {
    this.done.set(null);
    this.setPending(null);
  }

  cancelPending(): void {
    if (confirm('Rời trang thanh toán? Đơn đã tạo vẫn được lưu, bạn có thể tra cứu bằng mã đơn.')) this.setPending(null);
  }

  async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.flash('Đã sao chép');
    } catch {
      this.flash('Không sao chép được — hãy chép tay nhé');
    }
  }

  private async renderQr(): Promise<void> {
    this.qrUrl.set('');
    const payload = this.qrPayload();
    if (!payload) return;
    // qrcode là gói CommonJS: khi nạp động, các hàm nằm trong .default.
    type QrLib = typeof import('qrcode');
    const mod = (await import('qrcode')) as QrLib & { default?: QrLib };
    const qr = mod.default ?? mod;
    this.qrUrl.set(await qr.toDataURL(payload, { width: 600, margin: 1, errorCorrectionLevel: 'M' }));
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

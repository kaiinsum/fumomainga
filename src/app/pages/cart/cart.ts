import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Customer, EMPTY_CUSTOMER } from '../../models/order';
import { CartService } from '../../services/cart.service';
import { ApiError, OrderApiService } from '../../services/order-api.service';
import { OrderOutboxService } from '../../services/order-outbox.service';
import { SettingsService } from '../../services/settings.service';
import { VndPipe } from '../../shared/vnd.pipe';
import { PriceTagComponent } from '../../shared/price-tag';
import { FREE_SHIP_QTY, UpsellComponent } from './upsell';
import { emailError, emailSuggestion, isValidVnPhone, normalizePhone, phoneError } from '../../shared/validators';

/** Đơn vừa đặt, đang hiện popup QR chờ duyệt (giữ qua F5 trong cùng tab). Không gửi lên máy chủ. */
interface PendingPayment {
  code: string;
  total: number;
  phone: string;
  email: string;
  /** Nội dung đơn để khách sao chép gửi shop. */
  summary: string;
  /** Đã lưu lên máy chủ chưa (false = đang nằm trong hộp thư chờ gửi lại). */
  saved?: boolean;
}

/** Mã đơn FM + 6 ký tự ngẫu nhiên (bỏ ký tự dễ nhầm 0/O, 1/I/L). */
function newOrderCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return 'FM' + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

const PENDING_KEY = 'fumo.checkout.pending';

@Component({
  selector: 'app-cart',
  imports: [FormsModule, RouterLink, VndPipe, PriceTagComponent, UpsellComponent],
  template: `
    <div class="container wrap">
      <nav class="crumbs"><a routerLink="/">Trang chủ</a> / <span>Giỏ hàng</span></nav>

      @if (cart.items().length) {
        <!-- ===== Bước 1: giỏ hàng + thông tin nhận hàng ===== -->
        <h1 class="title">Giỏ hàng</h1>
        <div class="layout">
          <section class="lines card-surface">
            @for (l of cart.items(); track l.key) {
              <div class="line">
                <img [src]="l.variant?.image || l.product.images[0]" [alt]="l.product.name" />
                <div class="line-info">
                  <a [routerLink]="['/san-pham', l.product.slug || l.product.id]">{{ l.product.name }}</a>
                  @if (l.variant) { <span class="variant">{{ l.variant.name }}</span> }
                  <small><app-price-tag [product]="l.variant ?? l.product" />{{ l.product.inStock ? '' : ' · Hết hàng - shop sẽ liên hệ' }}</small>
                </div>
                <div class="qty">
                  <button type="button" (click)="cart.setQty(l.key, l.qty - 1)" aria-label="Giảm">−</button>
                  <span>{{ l.qty }}</span>
                  <button type="button" (click)="cart.setQty(l.key, l.qty + 1)" aria-label="Tăng">+</button>
                </div>
                <strong class="sum">{{ l.unit * l.qty | vnd }}</strong>
                <button class="del" type="button" (click)="cart.remove(l.key)" aria-label="Xoá">✕</button>
              </div>
            }
            <div class="total">Tạm tính <strong>{{ cart.total() | vnd }}</strong></div>
            <app-upsell #upsell />
          </section>

          <form class="checkout card-surface" (ngSubmit)="submit()">
            <h2>Thông tin nhận hàng</h2>
            <div class="field">
              <label for="c-name">Họ tên *</label>
              <input id="c-name" name="name" [(ngModel)]="customer.name" autocomplete="name" maxlength="80" required
                (blur)="touch('name')" [class.invalid]="!!fieldError('name')" />
              @if (fieldError('name')) { <small class="f-err">{{ fieldError('name') }}</small> }
            </div>
            <div class="field">
              <label for="c-phone">Số điện thoại *</label>
              <input id="c-phone" name="phone" type="tel" inputmode="tel" [(ngModel)]="customer.phone" autocomplete="tel" maxlength="20" required
                placeholder="VD: 0912 345 678" (blur)="touch('phone')" [class.invalid]="!!fieldError('phone')" [class.valid]="phoneOk()" />
              @if (fieldError('phone')) { <small class="f-err">{{ fieldError('phone') }}</small> }
            </div>
            <div class="field">
              <label for="c-email">Email</label>
              <input id="c-email" name="email" type="email" inputmode="email" [(ngModel)]="customer.email" autocomplete="email" maxlength="120"
                placeholder="ten@gmail.com (không bắt buộc)" (blur)="touch('email')" [class.invalid]="!!fieldError('email')" [class.valid]="emailOk()" />
              @if (fieldError('email')) {
                <small class="f-err">
                  {{ fieldError('email') }}
                  @if (emailFix()) { <button type="button" class="fix" (click)="customer.email = emailFix()">Sửa thành {{ emailFix() }}</button> }
                </small>
              }
            </div>
            <div class="field">
              <label for="c-addr">Địa chỉ nhận hàng *</label>
              <textarea id="c-addr" name="address" rows="2" [(ngModel)]="customer.address" autocomplete="street-address" maxlength="300" required
                (blur)="touch('address')" [class.invalid]="!!fieldError('address')"></textarea>
              @if (fieldError('address')) { <small class="f-err">{{ fieldError('address') }}</small> }
            </div>
            <div class="field">
              <label for="c-note">Ghi chú</label>
              <textarea id="c-note" name="note" rows="2" [(ngModel)]="customer.note" maxlength="500" placeholder="Giờ nhận hàng, gói quà..."></textarea>
            </div>
            @if (error()) { <p class="err">{{ error() }}</p> }
            <div class="pay-total">Tổng thanh toán <strong>{{ cart.total() | vnd }}</strong></div>
            <button class="btn primary full" type="submit" [disabled]="saving()">
              {{ saving() ? '⏳ Đang gửi đơn...' : 'Đặt hàng & chuyển khoản →' }}
            </button>
            <small class="muted">
              @if (cart.count() >= freeShipQty) { 🎉 Đơn từ {{ freeShipQty }} bé trở lên được <b>freeship</b>. } @else { Phí ship (nếu có) shop sẽ báo khi xác nhận đơn. Mua từ {{ freeShipQty }} bé được freeship. }
            </small>
          </form>
        </div>
      } @else {
        <div class="empty card-surface">
          <span>🛒</span>
          <h2>Giỏ hàng trống</h2>
          <p class="muted">Chọn vài bé fumo dễ thương rồi quay lại nhé!</p>
          <div class="row center">
            <a class="btn primary" routerLink="/san-pham">Xem sản phẩm</a>
            <a class="btn ghost" routerLink="/tra-cuu-don-hang">📦 Tra cứu đơn hàng</a>
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
          @if (d.saved !== false || !outbox.has(d.code)) {
            <p class="save-ok">✅ Shop đã nhận được đơn của bạn.</p>
          } @else {
            <p class="save-warn">
              ⚠️ Mạng yếu nên chưa gửi được đơn lên hệ thống - web sẽ tự gửi lại khi có mạng.
              <button type="button" class="retry" [disabled]="retrying()" (click)="retry()">{{ retrying() ? 'Đang gửi...' : 'Gửi lại ngay' }}</button>
            </p>
          }
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
          <div class="send-box">
            <b>📩 Gửi thông tin đơn cho shop</b>
            <small>Chuyển khoản xong, bấm sao chép rồi gửi kèm ảnh chụp giao dịch cho shop để được duyệt đơn.</small>
            <button class="btn primary full" type="button" (click)="copy(d.summary, 'Đã sao chép thông tin đơn')">📋 Sao chép thông tin đơn</button>
            @if (s().facebookUrl || zaloUrl()) {
              <div class="row center">
                @if (s().facebookUrl) { <a class="btn ghost small" [href]="s().facebookUrl" target="_blank" rel="noopener">Gửi qua Facebook</a> }
                @if (zaloUrl()) { <a class="btn ghost small" [href]="zaloUrl()" target="_blank" rel="noopener">Gửi qua Zalo</a> }
              </div>
            }
          </div>
          <p class="muted small">
            Sau khi nhận được tiền, shop sẽ duyệt đơn và thông báo cho bạn qua
            {{ d.email ? 'email ' + d.email + ' hoặc ' : '' }}số điện thoại {{ d.phone }}.
          </p>

          <div class="row center">
            <a class="btn ghost" routerLink="/tra-cuu-don-hang" [queryParams]="{ ma: d.code }" (click)="finish()">📦 Theo dõi đơn hàng</a>
            <a class="btn ghost" routerLink="/san-pham" (click)="finish()">Tiếp tục mua sắm</a>
          </div>
        </div>
      </div>
    }

    @if (toast()) { <div class="toast">{{ toast() }}</div> }
  `,
  styles: `
    .variant { display: inline-block; margin-left: 6px; padding: 1px 8px; border-radius: 999px; font-size: .75rem; font-weight: 800; background: var(--surface-2); color: var(--primary-dark); border: 1px solid var(--border); }
    .wrap { padding-bottom: 56px; }
    .crumbs { padding: 24px 0 8px; color: var(--muted); font-size: .9rem; }
    .crumbs a:hover { color: var(--primary); }
    .title { margin: 8px 0 20px; }
    .muted { color: var(--muted); }
    .small { font-size: .85rem; }
    .err { color: var(--error, #b32d2e); font-weight: 700; margin: 0; }
    .f-err { color: var(--error, #b32d2e); font-weight: 700; font-size: .8rem; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .fix { font: inherit; font-size: .75rem; padding: 2px 10px; border-radius: 999px; border: 1.5px solid currentColor; background: none; color: var(--primary-dark); cursor: pointer; }
    .checkout .field input.invalid, .checkout .field textarea.invalid { border-color: var(--error, #b32d2e); }
    .checkout .field input.valid { border-color: color-mix(in srgb, #2fbf71 70%, var(--border)); }
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
    .save-ok { margin: 0; font-weight: 800; color: #2a9d62; }
    .save-warn { margin: 0; padding: 10px 12px; border-radius: 12px; background: #fff4e0; color: #8a5a00; font-size: .88rem; font-weight: 700; }
    .retry { margin-left: 6px; font: inherit; font-size: .8rem; padding: 3px 12px; border-radius: 999px; border: 1.5px solid currentColor; background: #fff; color: inherit; cursor: pointer; }
    .send-box { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: 14px; background: var(--surface-2); }
    .send-box small { color: var(--muted); }
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
  readonly freeShipQty = FREE_SHIP_QTY;
  private readonly upsell = viewChild<UpsellComponent>('upsell');
  /** Đã mời mua thêm ở lần bấm thanh toán này chưa (chỉ hỏi 1 lần mỗi lần mở giỏ hàng). */
  private upsellAsked = false;
  readonly s = inject(SettingsService).settings;
  private readonly api = inject(OrderApiService);
  readonly outbox = inject(OrderOutboxService);
  readonly saving = signal(false);
  readonly retrying = signal(false);

  async retry(): Promise<void> {
    this.retrying.set(true);
    const done = await this.outbox.flush();
    this.retrying.set(false);
    this.flash(done ? 'Đã gửi đơn thành công' : 'Vẫn chưa gửi được - web sẽ tự thử lại');
  }

  customer: Customer = { ...EMPTY_CUSTOMER };
  readonly error = signal('');
  readonly toast = signal('');
  readonly pending = signal<PendingPayment | null>(this.readPending());
  /** Link Zalo theo số điện thoại liên hệ của shop. */
  readonly zaloUrl = computed(() => {
    const digits = this.s().contactPhone.replace(/\D/g, '');
    return digits.length >= 9 ? `https://zalo.me/${digits}` : '';
  });

  /** Ô đã rời khỏi ít nhất một lần (mới báo lỗi, tránh báo khi đang gõ dở). */
  readonly touched = signal(new Set<string>());

  touch(field: string): void {
    this.touched.update((t) => new Set(t).add(field));
  }

  fieldError(field: 'name' | 'phone' | 'email' | 'address'): string {
    if (!this.touched().has(field)) return '';
    const c = this.customer;
    if (field === 'name') return c.name.trim().length < 2 ? 'Vui lòng nhập họ tên.' : '';
    if (field === 'phone') return phoneError(c.phone);
    if (field === 'email') return emailError(c.email);
    return c.address.trim().length < 10 ? 'Vui lòng nhập địa chỉ đầy đủ (số nhà, đường, quận/huyện, tỉnh).' : '';
  }

  phoneOk(): boolean {
    return isValidVnPhone(this.customer.phone);
  }

  emailOk(): boolean {
    return !!this.customer.email.trim() && !emailError(this.customer.email);
  }

  emailFix(): string {
    return emailSuggestion(this.customer.email);
  }

  async submit(): Promise<void> {
    if (this.saving()) return;
    this.error.set('');
    const c = this.customer;
    this.touched.set(new Set(['name', 'phone', 'email', 'address']));
    const first = (['name', 'phone', 'email', 'address'] as const).map((f) => this.fieldError(f)).find(Boolean);
    if (first) {
      this.error.set('Vui lòng kiểm tra lại: ' + first);
      return;
    }
    // Lần đầu bấm thanh toán → mời mua thêm ("Rước thêm bé nữa nhé?"); khách chọn "thanh toán luôn" thì đi tiếp.
    if (!this.upsellAsked) {
      this.upsellAsked = true;
      this.upsell()?.openPopup(() => void this.submit());
      if (this.upsell()) return;
    }
    const code = newOrderCode();
    const total = this.cart.total();
    const vnd = (n: number) => n.toLocaleString('vi-VN') + 'đ';
    const summary = [
      `ĐƠN HÀNG ${code} - ${this.s().shopName}`,
      ...this.cart.items().map((l) => `• ${l.name} × ${l.qty} = ${vnd(l.unit * l.qty)}`),
      `Tổng: ${vnd(total)}`,
      `Người nhận: ${c.name.trim()}`,
      `SĐT: ${c.phone.trim()}`,
      ...(c.email.trim() ? [`Email: ${c.email.trim()}`] : []),
      `Địa chỉ: ${c.address.trim()}`,
      ...(c.note.trim() ? [`Ghi chú: ${c.note.trim()}`] : []),
    ].join('\n');
    const customer: Customer = {
      name: c.name.trim(),
      phone: normalizePhone(c.phone),
      email: c.email.trim().toLowerCase(),
      address: c.address.trim(),
      note: c.note.trim(),
    };
    const items = this.cart.orderItems();
    // Lưu đơn lên máy chủ TRƯỚC khi hiện QR: trên điện thoại khách sẽ chuyển sang app ngân hàng ngay,
    // nếu gửi ngầm thì trình duyệt có thể cắt ngang và đơn bị mất.
    this.saving.set(true);
    let saved = true;
    try {
      await this.api.create(customer, items, code);
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      if (status === 400 || status === 422) {
        // Dữ liệu bị máy chủ từ chối → báo ngay để khách sửa (không hiện QR cho đơn không hợp lệ).
        this.error.set(e instanceof Error ? e.message : 'Thông tin đặt hàng chưa hợp lệ.');
        this.saving.set(false);
        return;
      }
      // Mạng / máy chủ lỗi → vẫn cho khách thanh toán, đơn vào hộp thư chờ và tự gửi lại.
      saved = false;
      this.outbox.enqueue({ code, customer, items });
    }
    this.saving.set(false);
    this.cart.clear();
    this.setPending({ code, total, phone: customer.phone, email: customer.email, summary, saved });
  }

  /** Đóng popup. */
  finish(): void {
    this.setPending(null);
    this.error.set('');
  }

  async copy(text: string, done = 'Đã sao chép'): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.flash(done);
    } catch {
      this.flash('Không sao chép được - hãy chép tay nhé');
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
      return p && typeof p.code === 'string' && typeof p.summary === 'string' ? p : null;
    } catch {
      return null;
    }
  }
}

import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { animate } from 'animejs';
import { AnimateInDirective } from '../../shared/animate-in.directive';
import { SettingsService } from '../../services/settings.service';
import { OrderApiService } from '../../services/order-api.service';
import { emailSuggestion, emailValidator, normalizePhone, vnPhoneValidator } from '../../shared/validators';

@Component({
  selector: 'app-contact',
  imports: [ReactiveFormsModule, AnimateInDirective],
  template: `
    <section class="section">
      <div class="container grid">
        <div class="info" appAnimateIn="left">
          <h1>Liên hệ <span>với chúng tôi</span></h1>
          <p>Bạn cần tư vấn sản phẩm hoặc muốn hợp tác? Gửi lời nhắn, chúng tôi sẽ phản hồi sớm nhất.</p>
          @let st = s();
          <ul>
            @if (st.contactAddress) { <li><span>📍</span> {{ st.contactAddress }}</li> }
            @if (st.contactPhone) {
              <li><span>📞</span> <a [href]="tel()">{{ st.contactPhone }}</a></li>
            }
            @if (st.contactEmail) {
              <li><span>✉️</span> <a [href]="'mailto:' + st.contactEmail">{{ st.contactEmail }}</a></li>
            }
            @if (st.contactHours) { <li><span>🕘</span> {{ st.contactHours }}</li> }
          </ul>
        </div>

        <form class="card-surface form" [formGroup]="form" (ngSubmit)="send()" appAnimateIn="right" novalidate>
          @if (sent()) {
            <div class="done">
              <span class="heart">💖</span>
              <h3>Cảm ơn bạn!</h3>
              <p>Shop đã nhận được lời nhắn và sẽ liên hệ lại với bạn qua số điện thoại / email sớm nhất.</p>
              <button class="btn ghost" type="button" (click)="sent.set(false)">Gửi lời nhắn khác</button>
            </div>
          } @else {
            <div class="field">
              <label for="c-name">Họ tên</label>
              <input id="c-name" formControlName="name" />
              @if (form.controls.name.invalid && form.controls.name.touched) {
                <span class="error">Vui lòng nhập họ tên.</span>
              }
            </div>
            <div class="field">
              <label for="c-phone">Số điện thoại *</label>
              <input id="c-phone" type="tel" inputmode="tel" formControlName="phone" placeholder="VD: 0912 345 678" autocomplete="tel" />
              @if (form.controls.phone.touched && form.controls.phone.errors; as e) {
                <span class="error">{{ e['phone'] || 'Vui lòng nhập số điện thoại.' }}</span>
              }
            </div>
            <div class="field">
              <label for="c-email">Email</label>
              <input id="c-email" type="email" inputmode="email" formControlName="email" placeholder="ten@gmail.com (không bắt buộc)" autocomplete="email" />
              @if (form.controls.email.touched && form.controls.email.errors; as e) {
                <span class="error">
                  {{ e['email'] }}
                  @if (emailFix(); as fix) {
                    <button type="button" class="fix" (click)="form.controls.email.setValue(fix)">Sửa thành {{ fix }}</button>
                  }
                </span>
              }
            </div>
            <div class="field">
              <label for="c-msg">Lời nhắn</label>
              <textarea id="c-msg" formControlName="message"></textarea>
              @if (form.controls.message.invalid && form.controls.message.touched) {
                <span class="error">Lời nhắn tối thiểu 10 ký tự.</span>
              }
            </div>
            @if (error()) { <span class="error">{{ error() }}</span> }
            <button class="btn primary" type="submit" [disabled]="busy()">{{ busy() ? 'Đang gửi...' : 'Gửi lời nhắn' }}</button>
          }
        </form>
      </div>
    </section>
  `,
  styles: `
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: start; }
    h1 { font-size: clamp(2rem, 4vw, 2.8rem); }
    h1 span { color: var(--primary); }
    .info p { color: var(--muted); }
    ul { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 12px; }
    li { display: flex; gap: 12px; align-items: center; font-weight: 700; }
    li span { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 12px; background: var(--surface-2); }
    .form { padding: 28px; display: flex; flex-direction: column; gap: 16px; }
    .done { text-align: center; padding: 24px 0; }
    .heart { display: inline-block; font-size: 3.4rem; }
    .done p { color: var(--muted); }
    .fix { font: inherit; font-size: .75rem; margin-left: 6px; padding: 2px 10px; border-radius: 999px; border: 1.5px solid currentColor; background: none; color: var(--primary-dark); cursor: pointer; }
    @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
  `,
})
export class ContactPage {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  readonly sent = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  private readonly api = inject(OrderApiService);
  readonly s = inject(SettingsService).settings;
  readonly tel = computed(() => 'tel:' + this.s().contactPhone.replace(/[^\d+]/g, ''));

  readonly form = inject(NonNullableFormBuilder).group({
    name: ['', Validators.required],
    phone: ['', [Validators.required, vnPhoneValidator]],
    email: ['', [emailValidator]],
    message: ['', [Validators.required, Validators.minLength(10)]],
  });

  emailFix(): string {
    return emailSuggestion(this.form.controls.email.value);
  }

  async send(): Promise<void> {
    this.error.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      animate(this.host.querySelector('.form')!, { translateX: [0, -10, 8, -6, 4, 0], duration: 450, ease: 'inOutSine' });
      return;
    }
    const v = this.form.getRawValue();
    this.busy.set(true);
    try {
      // Lưu lời nhắn lên máy chủ (Supabase) để shop xem ở Admin → Liên hệ.
      await this.api.call('POST', '/api/contacts', {
        name: v.name.trim(),
        phone: normalizePhone(v.phone),
        email: v.email.trim().toLowerCase(),
        message: v.message.trim(),
      });
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Không gửi được lời nhắn, vui lòng thử lại hoặc gọi điện cho shop.');
      return;
    } finally {
      this.busy.set(false);
    }
    this.form.reset();
    this.sent.set(true);
    requestAnimationFrame(() => {
      const heart = this.host.querySelector('.heart');
      if (heart) animate(heart, { scale: [0, 1.3, 1], rotate: [-30, 0], duration: 900, ease: 'outElastic(1, .5)' });
    });
  }
}

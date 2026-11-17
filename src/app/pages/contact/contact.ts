import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { animate } from 'animejs';
import { AnimateInDirective } from '../../shared/animate-in.directive';
import { SettingsService } from '../../services/settings.service';

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
              <p>Lời nhắn đã được ghi nhận (bản demo — chưa gửi đi thật).</p>
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
              <label for="c-email">Email</label>
              <input id="c-email" type="email" formControlName="email" />
              @if (form.controls.email.invalid && form.controls.email.touched) {
                <span class="error">Email không hợp lệ.</span>
              }
            </div>
            <div class="field">
              <label for="c-msg">Lời nhắn</label>
              <textarea id="c-msg" formControlName="message"></textarea>
              @if (form.controls.message.invalid && form.controls.message.touched) {
                <span class="error">Lời nhắn tối thiểu 10 ký tự.</span>
              }
            </div>
            <button class="btn primary" type="submit">Gửi lời nhắn</button>
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
    @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
  `,
})
export class ContactPage {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  readonly sent = signal(false);
  readonly s = inject(SettingsService).settings;
  readonly tel = computed(() => 'tel:' + this.s().contactPhone.replace(/[^\d+]/g, ''));

  readonly form = inject(NonNullableFormBuilder).group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    message: ['', [Validators.required, Validators.minLength(10)]],
  });

  send(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      animate(this.host.querySelector('.form')!, { translateX: [0, -10, 8, -6, 4, 0], duration: 450, ease: 'inOutSine' });
      return;
    }
    this.form.reset();
    this.sent.set(true);
    requestAnimationFrame(() => {
      const heart = this.host.querySelector('.heart');
      if (heart) animate(heart, { scale: [0, 1.3, 1], rotate: [-30, 0], duration: 900, ease: 'outElastic(1, .5)' });
    });
  }
}

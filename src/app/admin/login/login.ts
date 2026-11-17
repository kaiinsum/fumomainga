import { AfterViewInit, Component, ElementRef, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { animate } from 'animejs';
import { AuthService } from '../../services/auth.service';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-admin-login',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="wrap">
      <form class="box" (ngSubmit)="submit()">
        <div class="logo">{{ settings().logoEmoji }}</div>
        <h1>{{ settings().shopName }}</h1>
        <p class="sub">Đăng nhập trang quản trị</p>

        <div class="field">
          <label for="pw">Mật khẩu</label>
          <input id="pw" type="password" name="pw" [(ngModel)]="password" autocomplete="current-password" autofocus />
        </div>
        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
        <button class="btn primary" type="submit" [disabled]="busy()">Đăng nhập</button>

      </form>
      <a routerLink="/" class="back">← Quay lại trang web</a>
    </div>
  `,
  styles: `
    .wrap { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 16px; padding: 16px; background: #f0f0f1; }
    .box { width: min(360px, 100%); background: #fff; padding: 32px 28px; border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,.08); display: flex; flex-direction: column; gap: 14px; text-align: center; }
    .logo { font-size: 3.4rem; line-height: 1; }
    h1 { margin: 0; font-size: 1.5rem; }
    .sub { margin: -10px 0 4px; color: var(--muted); }
    .field { text-align: left; }
    .error { color: var(--primary-ink); margin: 0; font-weight: 700; }
    .back { color: #50575e; font-size: .9rem; }
    .back:hover { color: var(--primary); }
  `,
})
export class AdminLogin implements AfterViewInit {
  /** Trang cần quay lại sau khi đăng nhập (query param ?next=). */
  readonly next = input<string>();

  readonly auth = inject(AuthService);
  readonly settings = inject(SettingsService).settings;
  private readonly router = inject(Router);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  password = '';
  readonly error = signal('');
  readonly busy = signal(false);

  ngAfterViewInit(): void {
    animate(this.host.querySelector('.box')!, { opacity: [0, 1], translateY: [30, 0], duration: 700, ease: 'outExpo' });
    animate(this.host.querySelector('.logo')!, {
      rotate: [-20, 0],
      scale: [0.3, 1],
      duration: 1000,
      delay: 150,
      ease: 'outElastic(1, .5)',
    });
  }

  async submit(): Promise<void> {
    this.busy.set(true);
    const ok = await this.auth.login(this.password);
    this.busy.set(false);
    if (ok) {
      const next = this.next();
      this.router.navigateByUrl(next?.startsWith('/admin') ? next : '/admin');
      return;
    }
    this.error.set('Mật khẩu không đúng.');
    animate(this.host.querySelector('.box')!, { translateX: [0, -12, 10, -8, 6, 0], duration: 450, ease: 'inOutSine' });
  }
}

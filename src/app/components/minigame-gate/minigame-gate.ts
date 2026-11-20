import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { resolveGames } from '../../models/minigames';
import { MinigameAccessService } from '../../services/minigame-access.service';
import { SettingsService } from '../../services/settings.service';

/**
 * Chốt chặn trong trang game: mở thẳng link (vd. /mini-game/fumo-ninja) mà hôm nay chưa được chơi
 * → hiện popup nhập code đè lên game. Kiểm tra lại mỗi khi cài đặt từ máy chủ về (lần đầu vào web máy chủ có thể chậm,
 * lúc đó trình duyệt chỉ có cài đặt mặc định) và khi sang ngày mới.
 * Game bị admin khoá / ẩn → popup báo khoá, chỉ có nút quay về trang Mini game.
 */
@Component({
  selector: 'app-minigame-gate',
  imports: [RouterLink],
  template: `
    @if (block(); as b) {
      <div class="veil" role="dialog" aria-modal="true" [attr.aria-label]="b.title + ' — cần mở khoá'">
        <div class="box">
          @if (b.kind === 'code') {
            <div class="lock" aria-hidden="true">🔑</div>
            <h2>{{ b.title }}</h2>
            <p>Trò này <b>hôm nay cần code</b> mới chơi được. Nhập code để mở tất cả trò chơi đến hết ngày nhé!</p>
            <form (submit)="$event.preventDefault(); submit()">
              <input #codeInput [value]="code()" (input)="code.set($any($event.target).value); err.set('')" placeholder="Nhập code" maxlength="12"
                autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Code mở khoá minigame" [class.bad]="!!err()" />
              <button class="btn primary" type="submit" [disabled]="checking() || !code().trim()">{{ checking() ? 'Đang kiểm tra…' : '🔓 Mở khoá' }}</button>
            </form>
            @if (err()) { <p class="err" role="alert">⚠ {{ err() }}</p> }
            <a class="back" routerLink="/mini-game">← Chọn trò miễn phí hôm nay</a>
          } @else {
            <div class="lock" aria-hidden="true">🔒</div>
            <h2>{{ b.title }}</h2>
            <p>{{ b.msg }}</p>
            <a class="btn primary" routerLink="/mini-game">← Về trang Mini game</a>
          }
        </div>
      </div>
    }
  `,
  styles: `
    .veil { position: fixed; inset: 0; z-index: 2000; display: grid; place-items: center; padding: 16px;
      background: rgba(10, 14, 30, .55); backdrop-filter: blur(6px); animation: fade .25s ease both; }
    .box { width: min(400px, 100%); padding: 24px 22px; border-radius: 22px; text-align: center; background: var(--surface); color: var(--text);
      border: 2px solid var(--primary); box-shadow: 0 24px 60px -18px color-mix(in srgb, var(--primary) 70%, transparent);
      display: flex; flex-direction: column; gap: 10px; animation: pop .4s cubic-bezier(.2, 1.4, .4, 1) both; }
    .lock { font-size: 2.6rem; line-height: 1; }
    h2 { margin: 0; font-size: 1.3rem; }
    p { margin: 0; color: var(--muted); }
    form { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
    input { flex: 1 1 150px; min-width: 0; font: 800 1.05rem ui-monospace, Consolas, monospace; letter-spacing: .18em; text-transform: uppercase;
      padding: 10px 12px; border-radius: 12px; border: 2px solid var(--border); background: var(--surface-2); color: var(--text); text-align: center; }
    input:focus { outline: none; border-color: var(--primary); }
    input.bad { border-color: #d63638; }
    .err { color: #d63638; font-weight: 700; font-size: .9rem; }
    .back { font-weight: 700; font-size: .9rem; color: var(--primary-dark); }
    @keyframes fade { from { opacity: 0; } }
    @keyframes pop { from { opacity: 0; transform: scale(.85) translateY(10px); } }
  `,
})
export class MinigameGateComponent {
  private readonly router = inject(Router);
  private readonly settingsSvc = inject(SettingsService);
  private readonly access = inject(MinigameAccessService);
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('codeInput');

  private readonly path = signal(this.router.url.split(/[?#]/)[0]);
  readonly code = signal('');
  readonly err = signal('');
  readonly checking = signal(false);

  /** Trò đang mở (theo đường dẫn) và lý do bị chặn, null = được chơi. */
  readonly block = computed<{ kind: 'code' | 'locked'; title: string; msg: string } | null>(() => {
    const path = this.path();
    if (!/^\/mini-game\/./.test(path)) return null;
    const game = resolveGames(this.settingsSvc.settings().minigames).find((g) => g.path === path);
    if (!game) return null;
    if (game.status === 'hidden') return { kind: 'locked', title: game.title, msg: 'Trò này hiện không mở cho người chơi.' };
    if (game.status !== 'open') return { kind: 'locked', title: game.title, msg: 'Trò này đang tạm khoá' + (game.lockMsg ? ' — ' + game.lockMsg : '.') };
    if (!this.access.canPlay(game.id)) return { kind: 'code', title: game.title, msg: '' };
    return null;
  });

  constructor() {
    const sub = this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      this.path.set((e as NavigationEnd).urlAfterRedirects.split(/[?#]/)[0]);
    });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());

    // Popup đang mở → chặn phím tắt của game phía sau (vẫn gõ được vào ô code).
    const swallow = (e: KeyboardEvent) => {
      if (this.block()) e.stopPropagation();
    };
    addEventListener('keydown', swallow, true);
    addEventListener('keyup', swallow, true);
    inject(DestroyRef).onDestroy(() => {
      removeEventListener('keydown', swallow, true);
      removeEventListener('keyup', swallow, true);
    });

    // Mở popup → khoá cuộn trang, đưa con trỏ vào ô code.
    effect(() => {
      const b = this.block();
      document.documentElement.style.overflow = b ? 'hidden' : '';
      if (b?.kind === 'code') setTimeout(() => this.input()?.nativeElement.focus(), 50);
    });
  }

  async submit(): Promise<void> {
    if (!this.code().trim() || this.checking()) return;
    this.checking.set(true);
    const e = await this.access.unlock(this.code());
    this.checking.set(false);
    this.err.set(e);
    if (!e) this.code.set('');
  }
}

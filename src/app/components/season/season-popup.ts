import { Component, effect, inject, signal } from '@angular/core';
import { SEASON_ART } from '../../models/seasons';
import { SeasonService } from '../../services/season.service';
import { IconComponent } from '../../shared/icon';

/** Thiệp chào theo chủ đề: hiện lần đầu vào web, nền phía sau làm mờ. Mở lại bằng nút ở chân trang. */
@Component({
  imports: [IconComponent],
  selector: 'app-season-popup',
  template: `
    @if (svc.popupOpen() && svc.active(); as s) {
      <div class="backdrop" (click)="close()" role="presentation">
        <div class="card" role="dialog" aria-modal="true" [attr.aria-label]="s.title" (click)="$event.stopPropagation()"
          [style.--c1]="s.colors[0]" [style.--c2]="s.colors[1]">
          <button type="button" class="x" (click)="close()" aria-label="Đóng">✕</button>
          <div class="art" aria-hidden="true">
            @if (s.art) { <img [src]="art[s.art]" alt="" /> } @else { <span><app-icon [icon]="s.icon" /></span> }
          </div>
          <span class="chip"><app-icon [icon]="s.icon" /> {{ s.name }} · {{ dates() }}</span>
          <h2>{{ s.title }}</h2>
          <p>{{ s.message }}</p>
          <label class="hide">
            <input type="checkbox" [checked]="dontShow()" (change)="dontShow.set($any($event.target).checked)" />
            Không hiện lại lần sau
          </label>
          <button type="button" class="btn primary go" (click)="close()">Vào shop thôi ✨</button>
          <small class="hint">Muốn xem lại? Kéo xuống cuối trang, bấm nút "<app-icon [icon]="s.icon" /> Xem lại lời chúc".</small>
        </div>
      </div>
    }
  `,
  styles: `
    .backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 16px;
      background: rgba(10, 10, 20, .35); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); animation: fade .3s ease; }
    :host-context(html.lite) .backdrop { backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); background: rgba(10, 10, 20, .5); }
    .card { position: relative; width: min(440px, 100%); max-height: calc(100dvh - 32px); overflow-y: auto; text-align: center;
      padding: 28px 24px 20px; border-radius: 24px; background: var(--surface); color: var(--text);
      border: 2px solid color-mix(in srgb, var(--c1) 60%, transparent);
      box-shadow: 0 0 0 6px color-mix(in srgb, var(--c2) 22%, transparent), 0 30px 70px rgba(0,0,0,.35);
      background-image: radial-gradient(circle at 50% 0, color-mix(in srgb, var(--c2) 28%, transparent), transparent 60%);
      animation: pop .45s cubic-bezier(.2, 1.4, .4, 1); }
    .x { position: absolute; top: 10px; right: 12px; width: 34px; height: 34px; border-radius: 50%; border: 0; cursor: pointer;
      background: var(--surface-2); color: var(--muted); font-size: 1rem; }
    .x:hover { color: var(--text); }
    .art { width: 120px; height: 120px; margin: 0 auto 10px; display: grid; place-items: center; border-radius: 50%;
      background: radial-gradient(circle, color-mix(in srgb, var(--c2) 55%, transparent), transparent 70%); animation: bob 2.6s ease-in-out infinite; }
    .art span { font-size: 4.6rem; line-height: 1; filter: drop-shadow(0 8px 14px rgba(0,0,0,.25)); }
    .art img { width: 96px; height: 96px; object-fit: contain; filter: drop-shadow(0 8px 14px rgba(0,0,0,.25)); }
    .chip { display: inline-block; font-size: .78rem; font-weight: 800; padding: 4px 12px; border-radius: 999px;
      background: color-mix(in srgb, var(--c1) 14%, transparent); color: var(--c1); }
    h2 { margin: 10px 0 8px; font-size: clamp(1.4rem, 5vw, 1.8rem);
      background: linear-gradient(90deg, var(--c1), color-mix(in srgb, var(--c2) 70%, var(--c1))); -webkit-background-clip: text; background-clip: text; color: transparent; }
    p { margin: 0 0 16px; color: var(--muted); line-height: 1.6; }
    .hide { display: inline-flex; align-items: center; gap: 8px; font-size: .9rem; font-weight: 600; cursor: pointer; margin-bottom: 14px; }
    .hide input { width: 18px; height: 18px; accent-color: var(--c1); }
    .go { display: block; width: 100%; font-size: 1.05rem; padding: 12px; }
    .hint { display: block; margin-top: 10px; color: var(--muted); font-size: .75rem; }
    @keyframes fade { from { opacity: 0; } }
    @keyframes pop { from { opacity: 0; transform: scale(.85) translateY(20px); } }
    @keyframes bob { 0%, 100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-8px) rotate(3deg); } }
    @media (prefers-reduced-motion: reduce) { .backdrop, .card, .art { animation: none; } }
  `,
})
export class SeasonPopupComponent {
  readonly svc = inject(SeasonService);
  readonly art = SEASON_ART;
  readonly dontShow = signal(false);

  constructor() {
    // Mỗi lần mở thiệp: ô "không hiện lại" theo lựa chọn đã lưu.
    effect(() => {
      const s = this.svc.active();
      if (this.svc.popupOpen() && s) this.dontShow.set(this.svc.hidden(s));
    });
    // Phím Esc để đóng.
    addEventListener('keydown', (e) => e.key === 'Escape' && this.svc.popupOpen() && this.close());
  }

  dates(): string {
    const s = this.svc.active();
    if (!s) return '';
    const r = this.svc.range(s.id);
    const f = (t: number) => { const d = new Date(t); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); };
    return r.start === r.end - 86_400_000 + 1 ? f(r.start) : `${f(r.start)} – ${f(r.end)}`;
  }

  close(): void {
    this.svc.close(this.dontShow());
  }
}

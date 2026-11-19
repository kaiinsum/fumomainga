import { Component, ElementRef, HostListener, inject, input, output, signal } from '@angular/core';

/** Các nhóm icon hay dùng cho thông báo / dịp lễ. */
export const EMOJI_GROUPS: { name: string; list: string[] }[] = [
  { name: 'Thông báo', list: ['📣', '📢', '🔔', '⚠️', 'ℹ️', '✅', '❗', '🆕', '🔥', '⭐', '✨', '💥', '🚚', '💳', '🛠️', '⏰', '🎁', '🏷️', '💸', '🛍️'] },
  { name: 'Lễ hội', list: ['🎉', '🎊', '🎈', '🎆', '🎇', '🧧', '🏮', '🥮', '🌕', '🎄', '🎅', '⛄', '❄️', '🎃', '👻', '🦇', '🎂', '🍰', '🎓', '🎒'] },
  { name: 'Tình cảm', list: ['❤️', '💖', '💕', '💝', '💗', '💐', '🌹', '🌷', '🌸', '🌼', '🌺', '💌', '😍', '🥰', '😘', '🤗'] },
  { name: 'Thiên nhiên', list: ['☀️', '🌙', '🌟', '💫', '🌈', '☁️', '🌊', '🍀', '🍁', '🍂', '🌴', '🐚', '🍉', '🍦', '🍓', '🐟'] },
  { name: 'Vui nhộn', list: ['🧸', '🎮', '🏆', '💎', '🤡', '😜', '😎', '🥳', '🤩', '😂', '🐱', '🐰', '🐉', '🦊', '🐼', '🎵'] },
];

/** Nút 😊 mở bảng chọn icon; bấm icon → phát sự kiện `pick`. */
@Component({
  selector: 'app-emoji-picker',
  template: `
    <button type="button" class="trigger" (click)="open.set(!open())" [attr.aria-expanded]="open()" [title]="label()">😊 {{ label() }}</button>
    @if (open()) {
      <div class="pop" role="dialog" [attr.aria-label]="label()">
        @for (g of groups; track g.name) {
          <b>{{ g.name }}</b>
          <div class="grid">
            @for (e of g.list; track e) {
              <button type="button" (click)="choose(e)" [title]="e">{{ e }}</button>
            }
          </div>
        }
      </div>
    }
  `,
  styles: `
    :host { position: relative; display: inline-block; }
    .trigger { border: 1px solid #c3c4c7; background: #fff; border-radius: 6px; padding: 6px 10px; font: inherit; font-size: .82rem; cursor: pointer; white-space: nowrap; }
    .trigger:hover { border-color: #2271b1; color: #2271b1; }
    .pop { position: absolute; z-index: 50; top: calc(100% + 6px); left: 0; width: 300px; max-height: 300px; overflow-y: auto; padding: 10px;
      background: #fff; border: 1px solid #dcdcde; border-radius: 12px; box-shadow: 0 12px 30px rgba(0,0,0,.18); }
    b { display: block; font-size: .72rem; color: #646970; margin: 6px 0 4px; text-transform: uppercase; letter-spacing: .04em; }
    .grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; }
    .grid button { border: 0; background: none; font-size: 1.3rem; line-height: 1; padding: 5px 0; border-radius: 6px; cursor: pointer; }
    .grid button:hover { background: #f0f6fc; transform: scale(1.15); }
    @media (max-width: 600px) { .pop { width: min(280px, calc(100vw - 40px)); } }
  `,
})
export class EmojiPickerComponent {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  readonly label = input('Chọn icon');
  /** true = chọn xong vẫn mở (để chọn nhiều icon liên tiếp). */
  readonly multi = input(false);
  readonly pick = output<string>();
  readonly open = signal(false);
  readonly groups = EMOJI_GROUPS;

  choose(e: string): void {
    this.pick.emit(e);
    if (!this.multi()) this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDoc(e: MouseEvent): void {
    if (this.open() && !this.host.contains(e.target as Node)) this.open.set(false);
  }
}

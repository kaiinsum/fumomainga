import { Component } from '@angular/core';
import { sfx } from './sfx';

/** Nút bật / tắt âm thanh mini game (lưu trên máy người chơi). */
@Component({
  selector: 'app-sound-toggle',
  template: `
    <button type="button" (click)="sfx.toggle()" [attr.aria-pressed]="!sfx.muted()" [title]="sfx.muted() ? 'Bật âm thanh' : 'Tắt âm thanh'">
      {{ sfx.muted() ? '🔇 Âm thanh: tắt' : '🔊 Âm thanh: bật' }}
    </button>
  `,
  styles: `
    button { font: inherit; font-size: .82rem; font-weight: 700; padding: 6px 14px; border-radius: 999px; border: 1.5px solid var(--border);
      background: var(--surface); color: var(--muted); cursor: pointer; }
    button:hover { color: var(--primary); border-color: var(--primary); }
  `,
})
export class SoundToggleComponent {
  readonly sfx = sfx;
}

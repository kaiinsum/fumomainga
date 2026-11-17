import { Component, computed, input, signal } from '@angular/core';
import { Character } from './touhoudle-data';
import { avatarSlug, chibiUrl } from './th-chibi';

/**
 * Avatar nhân vật cho Touhoudle.
 * 1) Có file public/touhoudle/<tên>.webp → dùng ảnh đó.
 * 2) Chưa có → vẽ chibi SVG (hình tự vẽ: màu tóc, màu mắt + phụ kiện đặc trưng).
 */

/** Ảnh thật nào đã thử mà không có → nhớ lại, khỏi tải lại. */
const missingPhotos = new Set<string>();

@Component({
  selector: 'app-th-avatar',
  template: `<img [src]="src()" [alt]="alt() ? char().name : ''" [width]="size()" [height]="size()" loading="lazy" (error)="onError()" />`,
  styles: `
    :host { display: inline-grid; flex: none; border-radius: 50%; overflow: hidden; box-shadow: 0 0 0 2px var(--surface), 0 2px 6px rgba(0,0,0,.2); background: var(--surface-2); }
    img { display: block; width: 100%; height: 100%; object-fit: cover; }
  `,
  host: { '[style.width.px]': 'size()', '[style.height.px]': 'size()' },
})
export class ThAvatarComponent {
  readonly char = input.required<Character>();
  readonly size = input(40);
  readonly alt = input(false);
  /** Tên nhân vật có ảnh thật bị lỗi (gắn theo tên, để đổi nhân vật không bị dính trạng thái cũ). */
  private readonly failedFor = signal('');

  readonly src = computed(() => {
    const c = this.char();
    return this.failedFor() === c.name || missingPhotos.has(c.name) ? chibiUrl(c) : `touhoudle/${avatarSlug(c.name)}.webp`;
  });

  onError(): void {
    missingPhotos.add(this.char().name);
    this.failedFor.set(this.char().name);
  }
}

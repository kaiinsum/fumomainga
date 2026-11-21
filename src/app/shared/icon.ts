import { Component, DestroyRef, ElementRef, HostListener, effect, forwardRef, inject, input, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { OrderApiService } from '../services/order-api.service';
import { EmojiPickerComponent } from './emoji-picker';

/**
 * Icon dùng chung toàn web: là emoji (vd. "🧸") HOẶC ảnh vuông (link https / đường dẫn /... / data:image).
 * Mọi chỗ admin đặt được icon (danh mục, phân loại game, logo, giá trị, chính sách, thông báo...) đều lưu chuỗi này.
 */
export function isImageIcon(v: string | null | undefined): boolean {
  const s = (v ?? '').trim();
  return /^data:image\//.test(s) || /^https?:\/\/\S+$/.test(s) || /^\/?[\w./-]+\.(png|webp|jpe?g|gif|svg|avif)(\?\S*)?$/i.test(s);
}

/** Hiển thị 1 icon (emoji hoặc ảnh vuông), cao bằng cỡ chữ xung quanh. */
@Component({
  selector: 'app-icon',
  template: `@if (img()) {<img [src]="icon()" [alt]="alt()" loading="lazy" decoding="async" draggable="false" />} @else {<span>{{ icon() }}</span>}`,
  styles: `
    :host { display: inline-flex; align-items: center; justify-content: center; line-height: 1; vertical-align: -0.12em; }
    img { width: 1.2em; height: 1.2em; object-fit: cover; border-radius: .22em; display: block; }
  `,
})
export class IconComponent {
  readonly icon = input<string | null | undefined>('');
  readonly alt = input('');
  img(): boolean {
    return isImageIcon(this.icon());
  }
}

/** Cắt giữa thành hình vuông rồi thu về size×size (PNG giữ nền trong suốt; nặng quá thì đổi WebP). */
async function squareIcon(file: File, size = 144): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = c.height = Math.min(size, side);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, c.width, c.height);
  bmp.close?.();
  const png = c.toDataURL('image/png');
  return png.length < 60_000 ? png : c.toDataURL('image/webp', 0.9);
}

/**
 * Ô chọn icon cho admin: gõ / chọn emoji, hoặc tải ảnh PNG vuông (tự cắt vuông), hoặc dán link ảnh.
 * Dùng như ô nhập: <app-icon-picker [(ngModel)]="c.icon" />
 */
@Component({
  selector: 'app-icon-picker',
  imports: [IconComponent, EmojiPickerComponent],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => IconPickerComponent), multi: true }],
  template: `
    <button #cur type="button" class="cur" (click)="toggle()" [attr.aria-expanded]="open()" [title]="label() + ' - bấm để đổi'" [disabled]="disabled()">
      @if (value()) { <app-icon [icon]="value()" /> } @else { <span class="ph">＋</span> }
    </button>
    @if (open()) {
      <div #pop class="pop" popover="manual" role="dialog" [attr.aria-label]="label()" [style.top.px]="pos().top" [style.left.px]="pos().left" [class.emoji-up]="pos().emojiUp">
        <div class="row">
          <input class="emo" [value]="isImg() ? '' : value()" (input)="set($any($event.target).value)" maxlength="8" placeholder="Emoji" aria-label="Gõ emoji" />
          <app-emoji-picker label="" (pick)="set($event)" />
        </div>
        <label class="up">
          {{ busy() ? 'Đang tải…' : '🖼 Tải ảnh PNG vuông' }}
          <input type="file" accept="image/png,image/webp,image/jpeg,image/svg+xml" hidden (change)="onFile($event)" [disabled]="busy()" />
        </label>
        <input class="link" [value]="isImg() && !value().startsWith('data:') ? value() : ''" (change)="setLink($any($event.target).value)"
          placeholder="hoặc dán link ảnh https://…" aria-label="Link ảnh icon" />
        @if (err()) { <small class="err">{{ err() }}</small> }
        <small class="hint">Ảnh tự cắt vuông, thu về 144×144. Nên dùng PNG nền trong suốt.</small>
        @if (isImg()) { <button type="button" class="clear" (click)="set('')">Bỏ ảnh</button> }
      </div>
    }
  `,
  styles: `
    :host { position: relative; display: inline-block; }
    .cur { width: 42px; height: 42px; border-radius: 10px; border: 1px solid #c3c4c7; background: #fff; font-size: 1.35rem; cursor: pointer;
      display: grid; place-items: center; padding: 0; }
    .cur:hover { border-color: #2271b1; }
    .ph { color: #8c8f94; font-size: 1rem; }
    /* Lớp trên cùng (popover) + toạ độ cố định theo nút → không bị khung bảng / thẻ có overflow che mất. */
    .pop { position: fixed; z-index: 1000; inset: auto; margin: 0; overflow: visible; width: 250px; box-sizing: border-box; padding: 10px; border-radius: 10px; background: #fff;
      border: 1px solid #c3c4c7; box-shadow: 0 10px 28px rgba(0,0,0,.18); display: grid; gap: 8px; }
    /* Gần đáy màn hình → bảng emoji mở lên trên. */
    .emoji-up ::ng-deep app-emoji-picker .pop { top: auto; bottom: calc(100% + 6px); }
    .row { display: flex; gap: 6px; align-items: center; }
    .emo { width: 70px; font-size: 1.1rem; text-align: center; padding: 4px; border: 1px solid #c3c4c7; border-radius: 6px; }
    .up { display: block; text-align: center; padding: 7px; border-radius: 8px; border: 1px dashed #2271b1; color: #2271b1; font-weight: 700; font-size: .85rem; cursor: pointer; }
    .link { width: 100%; box-sizing: border-box; padding: 5px 8px; border: 1px solid #c3c4c7; border-radius: 6px; font-size: .8rem; }
    .hint { color: #646970; font-size: .72rem; }
    .err { color: #b32d2e; font-size: .78rem; }
    .clear { justify-self: start; border: 0; background: none; color: #b32d2e; cursor: pointer; font-size: .8rem; padding: 0; text-decoration: underline; }
  `,
})
export class IconPickerComponent implements ControlValueAccessor {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly api = inject(OrderApiService);
  readonly label = input('Biểu tượng');
  readonly value = signal('');
  readonly open = signal(false);
  readonly pos = signal({ top: 0, left: 0, emojiUp: false });
  private readonly cur = viewChild<ElementRef<HTMLButtonElement>>('cur');
  private readonly pop = viewChild<ElementRef<HTMLDivElement>>('pop');
  private readonly reposition = () => this.place();

  constructor() {
    // Hiện bảng ở lớp trên cùng của trang rồi đặt vị trí theo nút.
    effect(() => {
      const el = this.pop()?.nativeElement;
      if (!el) return;
      const p = el as HTMLDivElement & { showPopover?: () => void };
      try {
        if (p.showPopover && !el.matches(':popover-open')) p.showPopover();
      } catch {
        /* trình duyệt cũ: vẫn dùng position: fixed */
      }
      this.place();
    });
    inject(DestroyRef).onDestroy(() => this.unlisten());
  }

  toggle(): void {
    if (this.open()) return this.close();
    this.open.set(true);
    this.place();
    addEventListener('scroll', this.reposition, true);
    addEventListener('resize', this.reposition);
  }

  close(): void {
    this.open.set(false);
    this.unlisten();
  }

  private unlisten(): void {
    removeEventListener('scroll', this.reposition, true);
    removeEventListener('resize', this.reposition);
  }

  /** Dưới nút; thiếu chỗ thì lật lên trên; không tràn mép màn hình. */
  private place(): void {
    const b = this.cur()?.nativeElement.getBoundingClientRect();
    if (!b) return;
    const h = this.pop()?.nativeElement.offsetHeight || 280;
    const w = 250;
    let top = b.bottom + 6;
    if (top + h > innerHeight - 8 && b.top - 6 - h >= 8) top = b.top - 6 - h;
    top = Math.max(8, Math.min(top, innerHeight - h - 8));
    const left = Math.max(8, Math.min(b.left, innerWidth - w - 8));
    // Bảng emoji cao ~300px, mở ngay dưới hàng emoji (~50px dưới đỉnh bảng).
    this.pos.set({ top, left, emojiUp: top + 50 + 300 > innerHeight - 8 && top > innerHeight - top });
  }
  readonly busy = signal(false);
  readonly err = signal('');
  readonly disabled = signal(false);
  private onChange: (v: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  isImg(): boolean {
    return isImageIcon(this.value());
  }

  @HostListener('document:pointerdown', ['$event'])
  outside(e: Event): void {
    if (this.open() && !this.host.contains(e.target as Node)) this.close();
  }

  set(v: string): void {
    this.err.set('');
    this.value.set(v.trim());
    this.onChange(this.value());
    this.onTouched();
  }

  setLink(v: string): void {
    const s = v.trim();
    if (!s) return;
    if (!/^https:\/\/\S+$/.test(s)) return this.err.set('Link ảnh phải bắt đầu bằng https://');
    this.set(s);
  }

  /** Tải ảnh: cắt vuông → đưa lên kho ảnh; không tải được (chạy thử) thì giữ ảnh nhỏ dạng data. */
  async onFile(e: Event): Promise<void> {
    const el = e.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    this.busy.set(true);
    this.err.set('');
    try {
      const dataUrl = await squareIcon(file);
      let url = dataUrl;
      try {
        url = (await this.api.call<{ url: string }>('POST', '/api/catalog', { dataUrl }, true, { timeoutMs: 30000 })).url || dataUrl;
      } catch {
        if (dataUrl.length > 80_000) throw new Error('Không tải được ảnh lên máy chủ - hãy dán link ảnh thay thế.');
      }
      this.set(url);
      this.close();
    } catch (er) {
      this.err.set(er instanceof Error ? er.message : 'Không đọc được ảnh.');
    } finally {
      this.busy.set(false);
    }
  }

  writeValue(v: string | null): void {
    this.value.set(v ?? '');
  }
  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(d: boolean): void {
    this.disabled.set(d);
  }
}

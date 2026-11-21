import { Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';

/**
 * Ô từ khoá dạng thẻ giống Rank Math: thẻ đầu (★, màu cam đậm) = từ khoá chính, các thẻ sau = từ khoá phụ.
 * Gõ rồi Enter / dấu phẩy để thêm · bấm ★ trên thẻ phụ để đổi thành từ khoá chính · ✕ để xoá.
 * Dữ liệu lưu như cũ: `main` (chuỗi) + `secondary` (các từ cách nhau dấu phẩy).
 */
@Component({
  selector: 'app-keyword-chips',
  template: `
    <div class="kc-head">
      <label [attr.for]="inputId()">Từ khoá chính <span class="help" title="Thẻ đầu tiên (★) là từ khoá chính. Các thẻ sau là từ khoá phụ - cách gọi khác khách hay tìm.">?</span></label>
      @if (main()) {
        <a class="trend" [href]="trendsUrl()" target="_blank" rel="noopener" title="Xem xu hướng tìm kiếm trên Google Trends">📈</a>
      }
    </div>
    <div class="box" (click)="focusField($event)">
      @for (k of all(); track k; let i = $index) {
        <span class="chip" [class.main]="i === 0">
          <button type="button" class="x" (click)="remove(i); $event.stopPropagation()" [attr.aria-label]="'Xoá từ khoá ' + k">✕</button>
          @if (i === 0) {
            <span class="star" aria-hidden="true">★</span>
          }
          <span class="t">{{ k }}</span>
          @if (i > 0) {
            <button type="button" class="mk" (click)="makeMain(i); $event.stopPropagation()" title="Đặt làm từ khoá chính" [attr.aria-label]="'Đặt ' + k + ' làm từ khoá chính'">★</button>
          }
        </span>
      }
      @if (all().length < max) {
        <input [id]="inputId()" [value]="draft()" (input)="draft.set($any($event.target).value)" (keydown)="onKey($event)" (blur)="commit($any($event.target))"
          (paste)="onPaste($event)" [placeholder]="all().length ? 'Thêm từ khoá phụ…' : placeholder()" maxlength="80" />
      } @else {
        <span class="full">Đã đủ {{ max }} từ khoá.</span>
      }
    </div>
    <small class="hint">Enter hoặc dấu phẩy để thêm (tối đa {{ max }}). Thẻ ★ là từ khoá chính, bấm ★ ở thẻ khác để đổi.</small>
  `,
  styles: `
    :host { display: block; }
    .kc-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
    label { font-weight: 700; font-size: .9rem; }
    .help { display: inline-grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; background: #a7aaad; color: #fff; font-size: .7rem; cursor: help; margin-left: 2px; }
    .trend { display: grid; place-items: center; width: 30px; height: 30px; border: 1px solid #c3c4c7; border-radius: 6px; text-decoration: none; background: #fff; }
    .trend:hover { border-color: #2271b1; }
    .box { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 10px; border: 1px solid #8c8f94; border-radius: 6px; background: #fff; cursor: text; min-height: 46px; }
    .box:focus-within { border-color: #2271b1; box-shadow: 0 0 0 1px #2271b1; }
    .chip { position: relative; display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 6px 12px 6px 14px; border-radius: 18px;
      background: #fde7c4; color: #e27800; font-weight: 600; font-size: .92rem; line-height: 1.3; }
    .chip.main { background: #f8b55a; color: #fff; }
    .t { overflow-wrap: anywhere; }
    .x { position: absolute; left: -6px; top: -6px; width: 18px; height: 18px; padding: 0; border-radius: 50%; border: 1px solid #c3c4c7; background: #fff; color: #50575e;
      font-size: .6rem; cursor: pointer; display: grid; place-items: center; line-height: 1; }
    .x:hover { border-color: #d63638; color: #d63638; }
    .star { font-size: .85rem; }
    .mk { border: 0; background: none; color: #e9a84a; cursor: pointer; padding: 0 0 0 2px; font-size: .85rem; opacity: .55; }
    .mk:hover { opacity: 1; }
    :host .box input, :host .box input:focus { border: 0 !important; outline: 0; box-shadow: none !important; border-radius: 0; height: auto; }
    input { border: 0; outline: 0; font: inherit; font-size: .9rem; padding: 4px 2px; width: 100%; min-width: 120px; background: transparent; }
    input::placeholder { color: #8c8f94; }
    .full { color: #8c8f94; font-size: .8rem; }
    .hint { display: block; margin-top: 4px; color: #646970; font-size: .76rem; }
  `,
})
export class KeywordChipsComponent {
  readonly main = input('');
  readonly secondary = input('');
  readonly placeholder = input('Ví dụ: fumo cirno 20cm');
  readonly inputId = input('kw-chips');
  readonly mainChange = output<string>();
  readonly secondaryChange = output<string>();
  readonly max = 5;
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  focusField(e: Event): void {
    if ((e.target as HTMLElement).closest('button')) return;
    this.host.querySelector<HTMLInputElement>('.box input')?.focus();
  }
  readonly draft = signal('');

  readonly all = computed(() => {
    const seen = new Set<string>();
    return [this.main(), ...(this.secondary() ?? '').split(',')]
      .map((k) => (k ?? '').trim())
      .filter((k) => k && !seen.has(k.toLowerCase()) && seen.add(k.toLowerCase()));
  });

  readonly trendsUrl = computed(() => `https://trends.google.com/trends/explore?geo=VN&q=${encodeURIComponent(this.all()[0] ?? '')}`);

  private emit(list: string[]): void {
    this.mainChange.emit(list[0] ?? '');
    this.secondaryChange.emit(list.slice(1).join(', '));
  }

  private add(raw: string): void {
    const list = [...this.all()];
    for (const part of raw.split(/[,\n;]+/)) {
      const k = part.trim().replace(/\s+/g, ' ');
      if (k && list.length < this.max && !list.some((x) => x.toLowerCase() === k.toLowerCase())) list.push(k);
    }
    this.emit(list);
  }

  commit(el?: HTMLInputElement): void {
    const v = el?.value ?? this.draft();
    if (el) el.value = '';
    this.draft.set('');
    if (v.trim()) this.add(v);
  }

  onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      this.commit(e.target as HTMLInputElement);
    } else if (e.key === 'Backspace' && !this.draft() && this.all().length) {
      this.remove(this.all().length - 1);
    }
  }

  onPaste(e: ClipboardEvent): void {
    const t = e.clipboardData?.getData('text') ?? '';
    if (!/[,\n;]/.test(t)) return;
    e.preventDefault();
    const el = e.target as HTMLInputElement;
    this.add(el.value + t);
    el.value = '';
    this.draft.set('');
  }

  remove(i: number): void {
    this.emit(this.all().filter((_, j) => j !== i));
  }

  makeMain(i: number): void {
    const list = [...this.all()];
    const [k] = list.splice(i, 1);
    this.emit([k, ...list]);
  }
}

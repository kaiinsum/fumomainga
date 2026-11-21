import { Component, computed, input, signal } from '@angular/core';
import { CHECK_GROUPS, CheckGroup, SeoReport } from './seo';

/**
 * Kết quả chấm SEO chia 4 nhóm như Rank Math: SEO cơ bản · Bổ sung · Khả năng đọc tiêu đề · Khả năng đọc nội dung.
 * Mỗi nhóm hiện "Tất cả đều tốt" hoặc "N Lỗi"; bấm tiêu đề nhóm để mở / thu gọn.
 */
@Component({
  selector: 'app-seo-checks',
  template: `
    @for (g of groups(); track g.id) {
      <section class="grp" [class.open]="isOpen(g.id, g.errors)">
        <button type="button" class="head" (click)="toggle(g.id, g.errors)" [attr.aria-expanded]="isOpen(g.id, g.errors)">
          <span class="nm">{{ g.label }}</span>
          @if (g.errors) {
            <span class="badge bad">{{ g.errors }} Lỗi</span>
          } @else if (g.warns) {
            <span class="badge warn">{{ g.warns }} Cần cải thiện</span>
          } @else {
            <span class="badge ok">Tất cả đều tốt</span>
          }
          <span class="chev" aria-hidden="true">▾</span>
        </button>
        @if (isOpen(g.id, g.errors)) {
          <ul>
            @for (c of g.checks; track c.text) {
              <li [class]="c.level"><span class="dot">{{ c.level === 'ok' ? '✓' : c.level === 'warn' ? '!' : '✕' }}</span><span>{{ c.text }}</span></li>
            }
          </ul>
        }
      </section>
    }
  `,
  styles: `
    :host { display: grid; gap: 8px; }
    .grp { border: 1px solid #dcdcde; border-radius: 8px; background: #fff; overflow: hidden; }
    .head { width: 100%; display: flex; align-items: center; gap: 8px; padding: 9px 12px; border: 0; background: #f6f7f7; cursor: pointer; font: inherit; text-align: left; }
    .grp.open .head { border-bottom: 1px solid #dcdcde; }
    .nm { font-weight: 700; font-size: .9rem; flex: 1; color: #1d2327; }
    .badge { font-size: .72rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
    .badge.ok { background: #edfaef; color: #1e7a34; }
    .badge.warn { background: #fcf9e8; color: #8a6d00; }
    .badge.bad { background: #fcf0f1; color: #b32d2e; }
    .chev { color: #8c8f94; transition: transform .2s; }
    .grp.open .chev { transform: rotate(180deg); }
    ul { list-style: none; margin: 0; padding: 10px 12px; display: grid; gap: 7px; font-size: .85rem; }
    li { display: flex; gap: 8px; align-items: flex-start; line-height: 1.45; }
    .dot { flex: none; width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; font-size: .68rem; font-weight: 800; color: #fff; margin-top: 1px; }
    .ok .dot { background: #00a32a; }
    .warn .dot { background: #dba617; }
    .bad .dot { background: #d63638; }
  `,
})
export class SeoChecksComponent {
  readonly report = input.required<SeoReport>();
  /** Nhóm người dùng tự mở / đóng (mặc định: nhóm có lỗi thì mở sẵn). */
  private readonly manual = signal<Partial<Record<CheckGroup, boolean>>>({});

  readonly groups = computed(() =>
    CHECK_GROUPS.map((g) => {
      const checks = this.report().checks.filter((c) => c.group === g.id);
      return { ...g, checks, errors: checks.filter((c) => c.level === 'bad').length, warns: checks.filter((c) => c.level === 'warn').length };
    }).filter((g) => g.checks.length),
  );

  isOpen(id: CheckGroup, errors: number): boolean {
    return this.manual()[id] ?? (id === 'basic' || errors > 0);
  }

  toggle(id: CheckGroup, errors: number): void {
    const now = this.isOpen(id, errors);
    this.manual.update((m) => ({ ...m, [id]: !now }));
  }
}

import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FeedbackConfig, FeedbackItem } from '../../models/order';
import { OrderApiService } from '../../services/order-api.service';
import { AdminToastService } from '../toast.service';

type Filter = 'all' | 'unused' | 'used' | 'expired';

/** Đánh giá của khách + voucher đã phát (khách đánh giá đơn đã thanh toán ở trang Tra cứu đơn hàng). */
@Component({
  selector: 'app-admin-feedback',
  imports: [FormsModule, DatePipe],
  template: `
    <div class="adm-head">
      <h1>⭐ Đánh giá & voucher</h1>
    </div>
    <p class="intro">
      Khách vào <b>Tra cứu đơn hàng</b>, nhập mã đơn + số điện thoại. Đơn <b>đã thanh toán</b> (Đã thanh toán / Đang giao / Hoàn thành) được
      đánh giá 1 lần và nhận ngay một mã voucher riêng. Khi khách gửi mã ở đơn sau, tìm mã ở đây rồi bấm <b>Đánh dấu đã dùng</b>.
    </p>

    <section class="adm-box">
      <h2>Cấu hình voucher</h2>
      <div class="box-body cfg">
        <label class="check"><input type="checkbox" [(ngModel)]="cfg.enabled" (ngModelChange)="dirty.set(true)" /> Bật chương trình đánh giá nhận voucher</label>
        <div class="field wide">
          <label for="fb-offer">Ưu đãi của voucher</label>
          <input id="fb-offer" maxlength="160" [(ngModel)]="cfg.offer" (ngModelChange)="dirty.set(true)" placeholder="Giảm 10% cho đơn hàng tiếp theo" />
        </div>
        <div class="field">
          <label for="fb-prefix">Tiền tố mã</label>
          <input id="fb-prefix" maxlength="10" [(ngModel)]="cfg.prefix" (ngModelChange)="dirty.set(true)" placeholder="CAMON" />
          <small class="hint">VD: {{ (cfg.prefix || 'CAMON').toUpperCase() }}7K2QX</small>
        </div>
        <div class="field">
          <label for="fb-days">Hạn dùng (ngày)</label>
          <input id="fb-days" type="number" min="0" max="3650" [(ngModel)]="cfg.validDays" (ngModelChange)="dirty.set(true)" />
          <small class="hint">0 = không hết hạn</small>
        </div>
        <div class="actions">
          <button data-save class="btn primary small" type="button" [disabled]="!dirty() || saving()" (click)="saveCfg()">{{ saving() ? 'Đang lưu…' : '💾 Lưu cấu hình' }}</button>
        </div>
      </div>
    </section>

    <section class="adm-box">
      <h2>
        Đánh giá của khách <span class="count">({{ items().length }})</span>
        @if (avg(); as a) { <span class="avg">★ {{ a }}</span> }
      </h2>
      <div class="box-body">
        <div class="adm-toolbar">
          <input type="search" placeholder="Tìm mã voucher, mã đơn, tên, nội dung…" [ngModel]="q()" (ngModelChange)="q.set($event)" />
          <nav class="adm-tabs mini">
            @for (t of filters; track t.key) {
              <button type="button" [class.on]="filter() === t.key" (click)="filter.set(t.key)">{{ t.label }} <span class="count">{{ countOf(t.key) }}</span></button>
            }
          </nav>
        </div>
        @if (loading()) {
          <p class="muted">Đang tải…</p>
        } @else if (!shown().length) {
          <p class="muted">{{ items().length ? 'Không có đánh giá phù hợp.' : 'Chưa có khách nào đánh giá.' }}</p>
        } @else {
          <ul class="list">
            @for (f of shown(); track f.code) {
              <li [class.used]="f.used">
                <div class="top">
                  <span class="stars" [attr.aria-label]="f.rating + ' sao'">{{ stars(f.rating) }}<i>{{ stars(5 - f.rating) }}</i></span>
                  <b>{{ f.name }}</b>
                  <small class="muted">· đơn {{ f.code }} · {{ f.createdAt | date: 'HH:mm dd/MM/yyyy' }}</small>
                </div>
                <p class="txt">{{ f.text }}</p>
                <div class="vrow">
                  <code>{{ f.voucher }}</code>
                  <small>{{ f.offer }}</small>
                  @if (f.used) {
                    <span class="tag ok">✓ Đã dùng</span>
                  } @else if (expired(f)) {
                    <span class="tag bad">Hết hạn {{ f.expiresAt | date: 'dd/MM/yyyy' }}</span>
                  } @else if (f.expiresAt) {
                    <span class="tag">HSD {{ f.expiresAt | date: 'dd/MM/yyyy' }}</span>
                  }
                  <span class="sp"></span>
                  <button type="button" class="btn ghost small" (click)="toggleUsed(f)">{{ f.used ? '↺ Chưa dùng' : '✓ Đánh dấu đã dùng' }}</button>
                  <button type="button" class="link-del" (click)="remove(f)">Xoá</button>
                </div>
              </li>
            }
          </ul>
        }
      </div>
    </section>
  `,
  styles: `
    .intro { margin: 0 0 14px; color: #50575e; font-size: .9rem; line-height: 1.55; }
    .cfg { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; align-items: start; }
    .cfg .check, .cfg .wide, .cfg .actions { grid-column: 1 / -1; }
    .check { display: flex; align-items: center; gap: 8px; font-weight: 700; }
    .hint { color: #646970; font-size: .76rem; }
    .actions { display: flex; justify-content: flex-end; }
    h2 .count { color: #8c8f94; font-weight: 600; }
    h2 .avg { margin-left: 8px; color: #dba617; font-size: .9rem; }
    .adm-toolbar input[type='search'] { flex: 1 1 220px; }
    .adm-tabs.mini { margin: 0; }
    .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    .list li { border: 1px solid #dcdcde; border-radius: 10px; padding: 12px 14px; background: #fff; display: grid; gap: 6px; }
    .list li.used { background: #f6f7f7; }
    .top { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
    .stars { color: #ffb400; letter-spacing: 1px; }
    .stars i { color: #dcdcde; font-style: normal; }
    .muted { color: #646970; }
    .txt { margin: 0; white-space: pre-line; line-height: 1.5; }
    .vrow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .vrow code { font-weight: 800; letter-spacing: .08em; padding: 3px 10px; border-radius: 6px; border: 1.5px dashed #2271b1; color: #135e96; background: #f0f6fc; }
    .vrow small { color: #50575e; }
    .tag { font-size: .72rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: #f0f0f1; color: #50575e; }
    .tag.ok { background: #edfaef; color: #1e7a34; }
    .tag.bad { background: #fcf0f1; color: #b32d2e; }
    .sp { flex: 1; }
    @media (max-width: 600px) { .cfg { grid-template-columns: 1fr; } }
  `,
})
export class AdminFeedback implements OnInit {
  private readonly api = inject(OrderApiService);
  private readonly toast = inject(AdminToastService);

  cfg: FeedbackConfig = { enabled: true, offer: '', prefix: 'CAMON', validDays: 60 };
  readonly items = signal<FeedbackItem[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly dirty = signal(false);
  readonly q = signal('');
  readonly filter = signal<Filter>('all');
  readonly filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'Tất cả' },
    { key: 'unused', label: 'Chưa dùng' },
    { key: 'used', label: 'Đã dùng' },
    { key: 'expired', label: 'Hết hạn' },
  ];

  readonly avg = computed(() => {
    const l = this.items();
    return l.length ? (l.reduce((s, f) => s + f.rating, 0) / l.length).toFixed(1) : '';
  });

  readonly shown = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.items().filter(
      (f) => this.match(f, this.filter()) && (!q || `${f.voucher} ${f.code} ${f.name} ${f.text}`.toLowerCase().includes(q)),
    );
  });

  stars(n: number): string {
    return '★'.repeat(Math.max(0, n));
  }

  expired(f: FeedbackItem): boolean {
    return !!f.expiresAt && f.expiresAt < Date.now();
  }

  private match(f: FeedbackItem, k: Filter): boolean {
    if (k === 'used') return f.used;
    if (k === 'unused') return !f.used && !this.expired(f);
    if (k === 'expired') return !f.used && this.expired(f);
    return true;
  }

  countOf(k: Filter): number {
    return this.items().filter((f) => this.match(f, k)).length;
  }

  async ngOnInit(): Promise<void> {
    try {
      const r = await this.api.feedbackList();
      this.cfg = { ...r.config };
      this.items.set(r.items);
    } catch (e) {
      this.toast.err(e instanceof Error ? e.message : 'Không tải được đánh giá.');
    } finally {
      this.loading.set(false);
    }
  }

  async saveCfg(): Promise<void> {
    this.saving.set(true);
    try {
      this.cfg = { ...(await this.api.saveFeedbackConfig(this.cfg)).config };
      this.dirty.set(false);
      this.toast.ok('Đã lưu cấu hình voucher');
    } catch (e) {
      this.toast.err(e instanceof Error ? e.message : 'Không lưu được.');
    } finally {
      this.saving.set(false);
    }
  }

  async toggleUsed(f: FeedbackItem): Promise<void> {
    try {
      const { item } = await this.api.markVoucher(f.code, !f.used);
      this.items.update((l) => l.map((x) => (x.code === f.code ? item : x)));
      this.toast.ok(item.used ? `Đã đánh dấu ${item.voucher} là đã dùng` : `${item.voucher} chuyển về chưa dùng`);
    } catch (e) {
      this.toast.err(e instanceof Error ? e.message : 'Không cập nhật được.');
    }
  }

  async remove(f: FeedbackItem): Promise<void> {
    if (!confirm(`Xoá đánh giá của ${f.name} (đơn ${f.code})? Voucher ${f.voucher} cũng mất hiệu lực.`)) return;
    try {
      await this.api.removeFeedback(f.code);
      this.items.update((l) => l.filter((x) => x.code !== f.code));
      this.toast.ok('Đã xoá đánh giá');
    } catch (e) {
      this.toast.err(e instanceof Error ? e.message : 'Không xoá được.');
    }
  }
}

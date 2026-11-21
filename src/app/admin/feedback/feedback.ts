import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminReview, AdminVoucher, FeedbackConfig } from '../../models/order';
import { OrderApiService } from '../../services/order-api.service';
import { AdminToastService } from '../toast.service';

type Tab = 'reviews' | 'vouchers';
type VFilter = 'all' | 'unused' | 'used' | 'expired';

/** Đánh giá sản phẩm của khách đã mua + voucher đã phát (mỗi đơn 1 voucher, tặng ở lần đánh giá đầu tiên). */
@Component({
  selector: 'app-admin-feedback',
  imports: [FormsModule, DatePipe, RouterLink],
  template: `
    <div class="adm-head">
      <h1>⭐ Đánh giá & voucher</h1>
    </div>
    <p class="intro">
      Khách nhập <b>mã đơn + số điện thoại</b> (ở trang sản phẩm hoặc Tra cứu đơn hàng) để đánh giá. Chỉ đánh giá được
      <b>sản phẩm có trong đơn đã thanh toán</b>, mỗi sản phẩm trong một đơn <b>1 lần</b>. Lần đánh giá đầu tiên của một đơn được tặng 1 mã voucher.
      Khi khách gửi mã ở đơn sau, tìm mã ở tab Voucher rồi bấm <b>Đánh dấu đã dùng</b>.
    </p>

    <section class="adm-box">
      <h2>Cấu hình</h2>
      <div class="box-body cfg">
        <label class="check"><input type="checkbox" [(ngModel)]="cfg.enabled" (ngModelChange)="dirty.set(true)" /> Cho phép khách đánh giá & nhận voucher</label>
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

    <nav class="adm-tabs">
      <button type="button" [class.on]="tab() === 'reviews'" (click)="tab.set('reviews')">Đánh giá <span class="count">{{ reviews().length }}</span></button>
      <button type="button" [class.on]="tab() === 'vouchers'" (click)="tab.set('vouchers')">Voucher <span class="count">{{ vouchers().length }}</span></button>
      @if (avg(); as a) { <span class="avg">★ {{ a }} trung bình</span> }
    </nav>

    <div class="adm-toolbar">
      <input type="search" [placeholder]="tab() === 'reviews' ? 'Tìm sản phẩm, mã đơn, tên khách, nội dung…' : 'Tìm mã voucher, mã đơn…'"
        [ngModel]="q()" (ngModelChange)="q.set($event)" />
      @if (tab() === 'vouchers') {
        <select [ngModel]="vf()" (ngModelChange)="vf.set($event)" aria-label="Lọc voucher">
          @for (t of vFilters; track t.key) { <option [value]="t.key">{{ t.label }} ({{ vCount(t.key) }})</option> }
        </select>
      }
    </div>

    @if (loading()) {
      <p class="muted">Đang tải…</p>
    } @else if (tab() === 'reviews') {
      @if (!shownReviews().length) {
        <p class="muted">{{ reviews().length ? 'Không có đánh giá phù hợp.' : 'Chưa có khách nào đánh giá.' }}</p>
      }
      <ul class="list">
        @for (r of shownReviews(); track r.key) {
          <li [class.dim]="r.hidden">
            <div class="top">
              <span class="stars">{{ stars(r.rating) }}</span>
              <a class="prod" [routerLink]="['/san-pham', r.productId]" target="_blank">{{ r.productName }}</a>
              @if (r.hidden) { <span class="tag">Đang ẩn</span> }
            </div>
            <p class="txt">{{ r.text }}</p>
            <div class="meta">
              <small class="muted">{{ r.name }} · đơn {{ r.code }} · {{ r.createdAt | date: 'HH:mm dd/MM/yyyy' }}</small>
              <span class="sp"></span>
              <button type="button" class="btn ghost small" (click)="toggleHidden(r)">{{ r.hidden ? '👁 Hiện lại' : '🙈 Ẩn khỏi trang' }}</button>
              <button type="button" class="link-del" (click)="removeReview(r)">Xoá</button>
            </div>
          </li>
        }
      </ul>
    } @else {
      @if (!shownVouchers().length) {
        <p class="muted">{{ vouchers().length ? 'Không có voucher phù hợp.' : 'Chưa phát voucher nào.' }}</p>
      }
      <ul class="list">
        @for (v of shownVouchers(); track v.voucher) {
          <li [class.dim]="v.used">
            <div class="vrow">
              <code>{{ v.voucher }}</code>
              <small>{{ v.offer }}</small>
              @if (v.used) {
                <span class="tag ok">✓ Đã dùng</span>
              } @else if (expired(v)) {
                <span class="tag bad">Hết hạn {{ v.expiresAt | date: 'dd/MM/yyyy' }}</span>
              } @else if (v.expiresAt) {
                <span class="tag">HSD {{ v.expiresAt | date: 'dd/MM/yyyy' }}</span>
              }
              <span class="sp"></span>
              <small class="muted">đơn {{ v.code }} · {{ v.createdAt | date: 'dd/MM/yyyy' }}</small>
              <button type="button" class="btn ghost small" (click)="toggleUsed(v)">{{ v.used ? '↺ Chưa dùng' : '✓ Đánh dấu đã dùng' }}</button>
            </div>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    .intro { margin: 0 0 14px; color: #50575e; font-size: .9rem; line-height: 1.55; }
    .cfg { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; align-items: start; }
    .cfg .check, .cfg .wide, .cfg .actions { grid-column: 1 / -1; }
    .check { display: flex; align-items: center; gap: 8px; font-weight: 700; }
    .hint { color: #646970; font-size: .76rem; }
    .actions { display: flex; justify-content: flex-end; }
    .adm-tabs .avg { margin-left: auto; align-self: center; color: #dba617; font-weight: 800; font-size: .9rem; white-space: nowrap; padding-right: 4px; }
    .adm-toolbar input[type='search'] { flex: 1 1 240px; }
    .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    .list li { border: 1px solid #dcdcde; border-radius: 10px; padding: 12px 14px; background: #fff; display: grid; gap: 6px; }
    .list li.dim { background: #f6f7f7; opacity: .8; }
    .top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .stars { color: #ffb400; letter-spacing: 1px; }
    .prod { font-weight: 800; color: #135e96; }
    .muted { color: #646970; }
    .txt { margin: 0; white-space: pre-line; line-height: 1.5; }
    .meta, .vrow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
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
  readonly reviews = signal<AdminReview[]>([]);
  readonly vouchers = signal<AdminVoucher[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly dirty = signal(false);
  readonly tab = signal<Tab>('reviews');
  readonly q = signal('');
  readonly vf = signal<VFilter>('all');
  readonly vFilters: { key: VFilter; label: string }[] = [
    { key: 'all', label: 'Tất cả' },
    { key: 'unused', label: 'Chưa dùng' },
    { key: 'used', label: 'Đã dùng' },
    { key: 'expired', label: 'Hết hạn' },
  ];

  readonly avg = computed(() => {
    const l = this.reviews();
    return l.length ? (l.reduce((s, r) => s + r.rating, 0) / l.length).toFixed(1) : '';
  });

  private readonly needle = computed(() => this.q().trim().toLowerCase());

  readonly shownReviews = computed(() => {
    const q = this.needle();
    return this.reviews().filter((r) => !q || `${r.productName} ${r.code} ${r.name} ${r.text}`.toLowerCase().includes(q));
  });

  readonly shownVouchers = computed(() => {
    const q = this.needle();
    return this.vouchers().filter((v) => this.vMatch(v, this.vf()) && (!q || `${v.voucher} ${v.code}`.toLowerCase().includes(q)));
  });

  stars(n: number): string {
    return '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));
  }

  expired(v: AdminVoucher): boolean {
    return !!v.expiresAt && v.expiresAt < Date.now();
  }

  private vMatch(v: AdminVoucher, k: VFilter): boolean {
    if (k === 'used') return v.used;
    if (k === 'unused') return !v.used && !this.expired(v);
    if (k === 'expired') return !v.used && this.expired(v);
    return true;
  }

  vCount(k: VFilter): number {
    return this.vouchers().filter((v) => this.vMatch(v, k)).length;
  }

  async ngOnInit(): Promise<void> {
    try {
      const r = await this.api.feedbackList();
      this.cfg = { ...r.config };
      this.reviews.set(r.reviews);
      this.vouchers.set(r.vouchers);
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
      this.toast.ok('Đã lưu cấu hình');
    } catch (e) {
      this.toast.err(e instanceof Error ? e.message : 'Không lưu được.');
    } finally {
      this.saving.set(false);
    }
  }

  async toggleUsed(v: AdminVoucher): Promise<void> {
    try {
      const { voucher } = await this.api.markVoucher(v.voucher, !v.used);
      this.vouchers.update((l) => l.map((x) => (x.voucher === v.voucher ? voucher : x)));
      this.toast.ok(voucher.used ? `Đã đánh dấu ${voucher.voucher} là đã dùng` : `${voucher.voucher} chuyển về chưa dùng`);
    } catch (e) {
      this.toast.err(e instanceof Error ? e.message : 'Không cập nhật được.');
    }
  }

  async toggleHidden(r: AdminReview): Promise<void> {
    try {
      const { review } = await this.api.hideReview(r.key, !r.hidden);
      this.reviews.update((l) => l.map((x) => (x.key === r.key ? review : x)));
      this.toast.ok(review.hidden ? 'Đã ẩn đánh giá khỏi trang sản phẩm' : 'Đánh giá đã hiện lại');
    } catch (e) {
      this.toast.err(e instanceof Error ? e.message : 'Không cập nhật được.');
    }
  }

  async removeReview(r: AdminReview): Promise<void> {
    if (!confirm(`Xoá đánh giá "${r.productName}" của ${r.name} (đơn ${r.code})? Khách sẽ đánh giá lại được sản phẩm này.`)) return;
    try {
      await this.api.removeReview(r.key);
      this.reviews.update((l) => l.filter((x) => x.key !== r.key));
      this.toast.ok('Đã xoá đánh giá');
    } catch (e) {
      this.toast.err(e instanceof Error ? e.message : 'Không xoá được.');
    }
  }
}

import { Component, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { PublicReview, VoucherInfo } from '../../models/order';
import { OrderApiService } from '../../services/order-api.service';
import { ReviewFormComponent, ReviewSent } from '../../shared/review-form';

/** Đánh giá của khách đã mua ở trang chi tiết sản phẩm + form tự nhập mã đơn / SĐT để đánh giá. */
@Component({
  selector: 'app-product-reviews',
  imports: [DatePipe, ReviewFormComponent],
  template: `
    <section class="rv card-surface" id="danh-gia" aria-labelledby="rv-title">
      <header>
        <h2 id="rv-title">Đánh giá từ khách đã mua</h2>
        @if (count()) {
          <span class="sum"><b>{{ avg() }}</b> <span class="st">{{ stars(round(avg())) }}</span> <small>({{ count() }} đánh giá)</small></span>
        }
        <button type="button" class="btn ghost small" (click)="open.set(!open())">{{ open() ? 'Đóng' : '✍️ Viết đánh giá' }}</button>
      </header>

      @if (voucher(); as v) {
        <div class="thanks" aria-live="polite">
          🎉 Cảm ơn bạn đã đánh giá! Voucher của đơn hàng: <b>{{ v.offer }}</b>
          <code>{{ v.voucher }}</code>
          <small>{{ v.expiresAt ? 'Hạn dùng đến ' + (v.expiresAt | date: 'dd/MM/yyyy') + '. ' : '' }}Ghi mã vào ô ghi chú ở đơn sau để được áp dụng.</small>
        </div>
      }

      @if (open()) {
        <div class="form-wrap">
          <p class="hint">Chỉ khách đã mua sản phẩm này mới đánh giá được: nhập <b>mã đơn</b> và <b>số điện thoại</b> đã dùng khi đặt hàng. Mỗi sản phẩm trong một đơn được đánh giá 1 lần.</p>
          <app-review-form [productId]="productId()" (sent)="onSent($event)" />
        </div>
      }

      @if (reviews().length) {
        <ul class="list">
          @for (r of reviews(); track $index) {
            <li>
              <div class="top">
                <b>{{ r.name }}</b>
                <span class="st">{{ stars(r.rating) }}</span>
                <small>{{ r.createdAt | date: 'dd/MM/yyyy' }}</small>
                <span class="buy">✓ Đã mua hàng</span>
              </div>
              <p>{{ r.text }}</p>
            </li>
          }
        </ul>
      } @else if (loaded() && !open()) {
        <p class="empty">Chưa có đánh giá nào. Bạn đã mua sản phẩm này? Hãy là người đầu tiên đánh giá nhé!</p>
      }
    </section>
  `,
  styles: `
    :host { display: block; }
    .rv { margin-top: 28px; padding: 22px 26px; display: flex; flex-direction: column; gap: 14px; }
    header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    h2 { margin: 0; font-size: 1.25rem; flex: 1 1 auto; }
    .sum { display: inline-flex; align-items: baseline; gap: 6px; }
    .sum b { font-size: 1.3rem; }
    .sum small { color: var(--muted); }
    .st { color: #ffb400; letter-spacing: 1px; }
    .thanks { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; padding: 14px; border-radius: 14px; background: var(--primary-100); }
    .thanks code { font-size: 1.4rem; font-weight: 900; letter-spacing: .12em; padding: 6px 16px; border-radius: 12px; border: 2px dashed var(--primary); color: var(--primary-dark); background: var(--surface); }
    .thanks small { color: var(--muted); }
    .form-wrap { padding: 14px; border-radius: 14px; border: 1.5px dashed var(--border); display: grid; gap: 10px; }
    .hint { margin: 0; font-size: .88rem; color: var(--muted); }
    .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
    .list li { padding: 12px 0; border-top: 1px dashed var(--border); }
    .list li:first-child { border-top: 0; }
    .top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .top small { color: var(--muted); }
    .buy { font-size: .72rem; font-weight: 800; color: #1e7a34; background: #edfaef; padding: 2px 8px; border-radius: 999px; }
    .list p { margin: 6px 0 0; white-space: pre-line; line-height: 1.6; }
    .empty { margin: 0; color: var(--muted); }
    @media (max-width: 600px) { .rv { margin-top: 18px; padding: 16px; } }
  `,
})
export class ProductReviewsComponent {
  readonly productId = input.required<string>();
  private readonly api = inject(OrderApiService);
  readonly reviews = signal<PublicReview[]>([]);
  readonly count = signal(0);
  readonly avg = signal(0);
  readonly loaded = signal(false);
  readonly open = signal(false);
  readonly voucher = signal<VoucherInfo | null>(null);

  constructor() {
    effect(() => {
      const id = this.productId();
      this.open.set(false);
      this.voucher.set(null);
      void this.load(id);
    });
  }

  private async load(id: string): Promise<void> {
    this.loaded.set(false);
    try {
      const r = await this.api.productReviews(id);
      if (id !== this.productId()) return;
      this.reviews.set(r.reviews);
      this.count.set(r.count);
      this.avg.set(r.avg);
    } catch {
      this.reviews.set([]);
      this.count.set(0);
    } finally {
      this.loaded.set(true);
    }
  }

  round(n: number): number {
    return Math.round(n);
  }

  stars(n: number): string {
    return '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));
  }

  onSent(e: ReviewSent): void {
    this.open.set(false);
    this.voucher.set(e.voucher);
    void this.load(this.productId());
  }
}

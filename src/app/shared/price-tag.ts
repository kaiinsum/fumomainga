import { Component, computed, input } from '@angular/core';
import { Product, discountPercent, finalPrice, onSale } from '../models/product';
import { VndPipe } from './vnd.pipe';

/** Hiển thị giá: nếu đang giảm → giá gốc gạch ngang + giá mới + nhãn -x%. */
@Component({
  selector: 'app-price-tag',
  imports: [VndPipe],
  template: `
    @if (sale()) {
      <s class="old">{{ product().price | vnd }}</s>
      <strong class="now">{{ final() | vnd }}</strong>
      @if (badge()) { <span class="off">-{{ pct() }}%</span> }
    } @else {
      <strong class="now">{{ product().price | vnd }}</strong>
    }
  `,
  styles: `
    :host { display: inline-flex; align-items: baseline; flex-wrap: wrap; gap: 2px 8px; }
    .old { color: var(--muted, #8c8f94); font-size: .82em; font-weight: 600; text-decoration-thickness: 1.5px; }
    .now { color: var(--primary-dark, inherit); }
    :host(.sale) .now { color: #e53935; }
    .off { align-self: center; font-size: .72em; font-weight: 900; color: #fff; background: #e53935; padding: 2px 7px; border-radius: 999px; }
  `,
  host: { '[class.sale]': 'sale()' },
})
export class PriceTagComponent {
  readonly product = input.required<Pick<Product, 'price' | 'salePrice'>>();
  readonly badge = input(true);
  readonly sale = computed(() => onSale(this.product()));
  readonly final = computed(() => finalPrice(this.product()));
  readonly pct = computed(() => discountPercent(this.product()));
}

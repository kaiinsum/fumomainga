import { Injectable, computed, inject, signal } from '@angular/core';
import { loadJson, saveJson } from '../core/storage';
import { OrderItem } from '../models/order';
import { Product, ProductVariant, finalPrice, variantsOf } from '../models/product';
import { ProductService } from './product.service';

const CART_KEY = 'fumo.cart.v1';

interface CartLine {
  id: string;
  /** id biến thể (nếu sản phẩm có biến thể). */
  v?: string;
  qty: number;
}

export interface CartItem {
  /** Khoá duy nhất của dòng (sản phẩm + biến thể). */
  key: string;
  product: Product;
  variant?: ProductVariant;
  /** Tên hiển thị / gửi lên đơn: "Tên SP - Biến thể". */
  name: string;
  /** Đơn giá khách trả (đã giảm). */
  unit: number;
  qty: number;
}

const lineKey = (id: string, v?: string) => (v ? `${id}::${v}` : id);

/** Giỏ hàng của khách - lưu trong trình duyệt của khách. */
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly products = inject(ProductService);
  private readonly _lines = signal<CartLine[]>(loadJson<CartLine[]>(CART_KEY, () => []));

  /** Dòng giỏ hàng kèm thông tin sản phẩm (bỏ sản phẩm / biến thể đã bị xoá). */
  readonly items = computed<CartItem[]>(() => {
    const out: CartItem[] = [];
    for (const l of this._lines()) {
      const product = this.products.getById(l.id);
      if (!product || product.hidden) continue;
      const vs = variantsOf(product);
      let variant: ProductVariant | undefined;
      if (vs.length) {
        // Dòng cũ chưa có biến thể → lấy biến thể đầu tiên; biến thể đã bị xoá → bỏ dòng.
        variant = l.v ? vs.find((x) => x.id === l.v) : vs[0];
        if (!variant) continue;
      }
      out.push({
        key: lineKey(l.id, l.v),
        product,
        variant,
        name: variant ? `${product.name} - ${variant.name}` : product.name,
        unit: finalPrice(variant ?? product),
        qty: l.qty,
      });
    }
    return out;
  });
  readonly count = computed(() => this.items().reduce((s, l) => s + l.qty, 0));
  readonly total = computed(() => this.items().reduce((s, l) => s + l.unit * l.qty, 0));

  add(id: string, qty = 1, variantId?: string): void {
    const product = this.products.getById(id);
    const vs = product ? variantsOf(product) : [];
    const v = vs.length ? (vs.find((x) => x.id === variantId) ?? vs[0]).id : undefined;
    const lines = [...this._lines()];
    const line = lines.find((l) => l.id === id && (l.v ?? undefined) === v);
    if (line) line.qty = Math.min(99, line.qty + qty);
    else lines.push(v ? { id, v, qty: Math.min(99, qty) } : { id, qty: Math.min(99, qty) });
    this.commit(lines);
  }

  /** key = CartItem.key */
  setQty(key: string, qty: number): void {
    if (qty < 1) return this.remove(key);
    this.commit(this._lines().map((l) => (lineKey(l.id, l.v) === key ? { ...l, qty: Math.min(99, Math.round(qty)) } : l)));
  }

  remove(key: string): void {
    this.commit(this._lines().filter((l) => lineKey(l.id, l.v) !== key));
  }

  clear(): void {
    this.commit([]);
  }

  /** Dữ liệu gửi lên máy chủ khi đặt hàng. */
  orderItems(): OrderItem[] {
    return this.items().map((l) => ({ id: l.product.id, name: l.name, price: l.unit, qty: l.qty }));
  }

  private commit(next: CartLine[]): void {
    this._lines.set(next);
    try {
      saveJson(CART_KEY, next);
    } catch {
      /* bộ nhớ đầy: giỏ vẫn dùng được trong phiên này */
    }
  }
}

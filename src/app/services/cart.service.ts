import { Injectable, computed, inject, signal } from '@angular/core';
import { loadJson, saveJson } from '../core/storage';
import { OrderItem } from '../models/order';
import { ProductService } from './product.service';

const CART_KEY = 'fumo.cart.v1';

interface CartLine {
  id: string;
  qty: number;
}

/** Giỏ hàng của khách — lưu trong trình duyệt của khách. */
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly products = inject(ProductService);
  private readonly _lines = signal<CartLine[]>(loadJson<CartLine[]>(CART_KEY, () => []));

  /** Dòng giỏ hàng kèm thông tin sản phẩm (bỏ sản phẩm đã bị xoá). */
  readonly items = computed(() =>
    this._lines()
      .map((l) => ({ product: this.products.getById(l.id), qty: l.qty }))
      .filter((l): l is { product: NonNullable<typeof l.product>; qty: number } => !!l.product),
  );
  readonly count = computed(() => this.items().reduce((s, l) => s + l.qty, 0));
  readonly total = computed(() => this.items().reduce((s, l) => s + l.product.price * l.qty, 0));

  add(id: string, qty = 1): void {
    const lines = [...this._lines()];
    const line = lines.find((l) => l.id === id);
    if (line) line.qty = Math.min(99, line.qty + qty);
    else lines.push({ id, qty: Math.min(99, qty) });
    this.commit(lines);
  }

  setQty(id: string, qty: number): void {
    if (qty < 1) return this.remove(id);
    this.commit(this._lines().map((l) => (l.id === id ? { ...l, qty: Math.min(99, Math.round(qty)) } : l)));
  }

  remove(id: string): void {
    this.commit(this._lines().filter((l) => l.id !== id));
  }

  clear(): void {
    this.commit([]);
  }

  /** Dữ liệu gửi lên máy chủ khi đặt hàng. */
  orderItems(): OrderItem[] {
    return this.items().map((l) => ({ id: l.product.id, name: l.product.name, price: l.product.price, qty: l.qty }));
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

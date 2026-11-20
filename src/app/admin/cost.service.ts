import { Injectable, inject, signal } from '@angular/core';
import { OrderApiService } from '../services/order-api.service';

/**
 * Giá nhập hàng — CHỈ admin. Lưu riêng trên máy chủ (/api/admin/costs), không nằm trong dữ liệu sản phẩm công khai.
 * Khoá: "<productId>" hoặc "<productId>::<variantId>" (trùng mã dòng hàng trong đơn).
 */
@Injectable({ providedIn: 'root' })
export class CostService {
  private readonly api = inject(OrderApiService);
  readonly costs = signal<Record<string, number>>({});
  readonly loaded = signal(false);
  readonly error = signal('');
  private loading?: Promise<void>;

  load(force = false): Promise<void> {
    if (this.loading && !force) return this.loading;
    this.loading = this.api
      .call<{ costs: Record<string, number> }>('GET', '/api/admin/costs', undefined, true)
      .then((r) => {
        this.costs.set(r.costs ?? {});
        this.error.set('');
      })
      .catch((e) => {
        this.loading = undefined;
        this.error.set(e instanceof Error ? e.message : 'Không tải được giá nhập.');
      })
      .finally(() => this.loaded.set(true));
    return this.loading;
  }

  /** Giá nhập 1 đơn vị của dòng hàng (biến thể → sản phẩm). null = chưa nhập. */
  costOf(itemId: string): number | null {
    const c = this.costs();
    const id = String(itemId);
    if (id in c) return c[id];
    const base = id.split('::')[0];
    return base in c ? c[base] : null;
  }

  /** Ghi nhiều mục cùng lúc (null = xoá). */
  async save(changes: Record<string, number | null>): Promise<void> {
    const next = { ...this.costs() };
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || !Number.isFinite(v) || v < 0) delete next[k];
      else next[k] = Math.round(v);
    }
    const r = await this.api.call<{ costs: Record<string, number> }>('PUT', '/api/admin/costs', { costs: next }, true);
    this.costs.set(r.costs);
  }
}

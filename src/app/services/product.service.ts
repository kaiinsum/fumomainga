import { Injectable, computed, signal } from '@angular/core';
import { STORAGE_KEYS, loadJson, saveJson } from '../core/storage';
import { Product, ProductInput } from '../models/product';
import { SEED_PRODUCTS } from './seed-data';

/**
 * Sản phẩm mẫu đã lưu từ phiên bản cũ có ảnh minh hoạ nhiều màu: thay bằng ảnh mẫu mới
 * (một tông màu). Chỉ đụng tới ảnh SVG tự sinh của sản phẩm mẫu, không đụng ảnh người dùng tải lên.
 */
function refreshSeedImages(list: Product[]): Product[] {
  return list.map((p) => {
    const seed = SEED_PRODUCTS.find((s) => s.id === p.id);
    if (!seed || !p.images.every((img) => img.startsWith('data:image/svg+xml'))) return p;
    return { ...p, images: seed.images };
  });
}

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly _products = signal<Product[]>(
    refreshSeedImages(loadJson(STORAGE_KEYS.products, () => structuredClone(SEED_PRODUCTS))),
  );

  readonly products = this._products.asReadonly();
  readonly featured = computed(() => this._products().filter((p) => p.featured));
  readonly allTags = computed(() =>
    [...new Set(this._products().flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b, 'vi')),
  );
  readonly maxPrice = computed(() => Math.max(0, ...this._products().map((p) => p.price)));

  getById(id: string): Product | undefined {
    return this._products().find((p) => p.id === id);
  }

  add(input: ProductInput): Product {
    const product: Product = { ...input, id: crypto.randomUUID(), createdAt: Date.now() };
    this.commit([product, ...this._products()]);
    return product;
  }

  update(id: string, patch: Partial<ProductInput>): void {
    this.commit(this._products().map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  remove(id: string): void {
    this.commit(this._products().filter((p) => p.id !== id));
  }

  /** Chuyển mọi sản phẩm từ danh mục `from` sang `to` (đổi tên / xoá danh mục). */
  renameCategory(from: string, to: string): void {
    if (from === to || !this._products().some((p) => p.category === from)) return;
    this.commit(this._products().map((p) => (p.category === from ? { ...p, category: to } : p)));
  }

  /**
   * Áp dụng kết quả nhập Excel trong một lần ghi: cập nhật thông tin (giữ nguyên ảnh) và thêm sản phẩm mới.
   * Sản phẩm không có trong file thì giữ nguyên.
   */
  applyImport(updates: { id: string; patch: Partial<ProductInput> }[], adds: ProductInput[]): void {
    const byId = new Map(updates.map((u) => [u.id, u.patch]));
    const now = Date.now();
    const created: Product[] = adds.map((input, i) => ({ ...input, id: crypto.randomUUID(), createdAt: now - i }));
    this.commit([
      ...created,
      ...this._products().map((p) => {
        const patch = byId.get(p.id);
        if (!patch) return p;
        const { images: _ignored, ...rest } = patch;
        return { ...p, ...rest };
      }),
    ]);
  }

  replaceAll(products: Product[]): void {
    this.commit(products);
  }

  resetDemo(): void {
    this.commit(structuredClone(SEED_PRODUCTS));
  }

  /** Ghi vào localStorage trước; nếu bộ nhớ đầy thì ném lỗi và giữ nguyên dữ liệu cũ. */
  private commit(next: Product[]): void {
    saveJson(STORAGE_KEYS.products, next);
    this._products.set(next);
  }
}

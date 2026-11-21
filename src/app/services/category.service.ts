import { Injectable, computed, inject, signal } from '@angular/core';
import { STORAGE_KEYS, loadJson, saveJson } from '../core/storage';
import { Category, DEFAULT_CATEGORIES } from '../models/product';
import { ProductService } from './product.service';

const same = (a: string, b: string) => a.trim().toLocaleLowerCase('vi') === b.trim().toLocaleLowerCase('vi');

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly products = inject(ProductService);
  private readonly _categories = signal<Category[]>(
    loadJson(STORAGE_KEYS.categories, () => structuredClone(DEFAULT_CATEGORIES)),
  );

  readonly categories = this._categories.asReadonly();
  /** Tăng mỗi khi admin thay đổi dữ liệu → tự gửi lên máy chủ. */
  readonly changes = signal(0);
  readonly names = computed(() => this._categories().map((c) => c.name));

  /** Số sản phẩm theo từng danh mục. */
  readonly counts = computed(() => {
    const map = new Map<string, number>();
    for (const p of this.products.shop()) map.set(p.category, (map.get(p.category) ?? 0) + 1);
    return map;
  });

  find(name: string): Category | undefined {
    return this._categories().find((c) => same(c.name, name));
  }

  add(name: string, icon: string): void {
    name = name.trim();
    this.validateName(name);
    this.commit([...this._categories(), { name, icon: icon.trim() || '✨' }]);
  }

  /** Sửa tên/biểu tượng. Đổi tên thì các sản phẩm thuộc danh mục cũng được chuyển theo. */
  update(oldName: string, next: Category): void {
    const name = next.name.trim();
    if (name !== oldName) this.validateName(name, oldName);
    const list = this._categories().map((c) => (c.name === oldName ? { name, icon: next.icon.trim() || '✨' } : c));
    if (name !== oldName) this.products.renameCategory(oldName, name);
    this.commit(list);
  }

  /** Xoá danh mục; nếu còn sản phẩm thì phải chuyển chúng sang danh mục khác (`moveTo`). */
  remove(name: string, moveTo?: string): void {
    const used = this.counts().get(name) ?? 0;
    if (used) {
      if (!moveTo || moveTo === name || !this.find(moveTo)) {
        throw new Error(`Danh mục "${name}" còn ${used} sản phẩm - hãy chọn danh mục để chuyển sang.`);
      }
      this.products.renameCategory(name, moveTo);
    }
    this.commit(this._categories().filter((c) => c.name !== name));
  }

  move(index: number, dir: -1 | 1): void {
    const list = [...this._categories()];
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j], list[index]];
    this.commit(list);
  }

  /** Dùng khi nhập file sao lưu: lấy danh sách có sẵn + thêm các danh mục mà sản phẩm đang dùng. */
  replaceAll(list: Category[] | undefined): void {
    const next = (list?.length ? list : structuredClone(DEFAULT_CATEGORIES)).filter((c) => c?.name?.trim());
    for (const p of this.products.products()) {
      if (p.category && !next.some((c) => same(c.name, p.category))) next.push({ name: p.category, icon: '✨' });
    }
    this.commit(next);
  }

  reset(): void {
    this.commit(structuredClone(DEFAULT_CATEGORIES));
  }

  private validateName(name: string, except?: string): void {
    if (!name) throw new Error('Tên danh mục không được để trống.');
    if (name.length > 40) throw new Error('Tên danh mục tối đa 40 ký tự.');
    if (this._categories().some((c) => c.name !== except && same(c.name, name))) {
      throw new Error(`Danh mục "${name}" đã tồn tại.`);
    }
  }

  /** Nạp dữ liệu từ máy chủ - không tính là thay đổi của admin. */
  hydrate(list: Category[]): void {
    try {
      saveJson(STORAGE_KEYS.categories, list);
    } catch {
      /* bỏ qua */
    }
    this._categories.set(list);
  }

  private commit(next: Category[]): void {
    saveJson(STORAGE_KEYS.categories, next);
    this._categories.set(next);
    this.changes.update((n) => n + 1);
  }
}

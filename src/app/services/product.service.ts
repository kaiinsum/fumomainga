import { Injectable, computed, signal } from '@angular/core';
import { STORAGE_KEYS, hasJson, loadJson, saveJson } from '../core/storage';
import { Product, ProductInput } from '../models/product';
import { SEED_PRODUCTS } from './seed-data';
import { slugify } from '../shared/seo';

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

/** Slug không trùng với sản phẩm khác (thêm -2, -3... nếu cần). */
function uniqueSlug(base: string, list: Product[], selfId?: string): string {
  const root = base || 'san-pham';
  const taken = new Set(list.filter((p) => p.id !== selfId).flatMap((p) => [p.slug, p.id, ...(p.oldSlugs ?? [])]));
  let slug = root;
  for (let n = 2; taken.has(slug); n++) slug = `${root}-${n}`;
  return slug;
}

/** Sản phẩm cũ chưa có slug → tự tạo từ tên. */
function ensureSlugs(list: Product[]): Product[] {
  const out: Product[] = [];
  for (const p of list) out.push(p.slug ? p : { ...p, slug: uniqueSlug(slugify(p.name), [...out, ...list], p.id) });
  return out;
}

@Injectable({ providedIn: 'root' })
export class ProductService {
  // Máy chưa từng tải dữ liệu → để trống chờ máy chủ (tránh hiện sản phẩm mẫu rồi mới đổi).
  private readonly _products = signal<Product[]>(
    hasJson(STORAGE_KEYS.products) ? ensureSlugs(refreshSeedImages(loadJson(STORAGE_KEYS.products, () => []))) : [],
  );
  /** Tăng mỗi khi admin thay đổi dữ liệu (không tính lần nạp từ máy chủ) → tự gửi lên máy chủ. */
  readonly changes = signal(0);

  /** Tất cả sản phẩm (kể cả đang ẩn) — dùng cho trang admin. */
  readonly products = this._products.asReadonly();
  /** Sản phẩm khách được thấy (bỏ sản phẩm admin đã ẩn). */
  readonly shop = computed(() => this._products().filter((p) => !p.hidden));
  readonly featured = computed(() => this.shop().filter((p) => p.featured));
  readonly allTags = computed(() =>
    [...new Set(this.shop().flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b, 'vi')),
  );
  readonly maxPrice = computed(() => Math.max(0, ...this.shop().map((p) => p.price)));

  getById(id: string): Product | undefined {
    return this._products().find((p) => p.id === id);
  }

  /** Tìm theo slug (mới hoặc cũ) hoặc id — dùng cho trang /san-pham/:id. */
  find(key: string): Product | undefined {
    const list = this._products();
    return list.find((p) => p.slug === key) ?? list.find((p) => p.id === key) ?? list.find((p) => p.oldSlugs?.includes(key));
  }

  /** Gợi ý slug cho tên (đã tránh trùng) — admin xem trước khi lưu. */
  suggestSlug(text: string, selfId?: string): string {
    return uniqueSlug(slugify(text), this._products(), selfId);
  }

  add(input: ProductInput): Product {
    const id = crypto.randomUUID();
    const slug = uniqueSlug(slugify(input.slug || input.name), this._products(), id);
    const product: Product = { ...input, id, slug, createdAt: Date.now() };
    this.commit([product, ...this._products()]);
    return product;
  }

  update(id: string, patch: Partial<ProductInput>): void {
    const list = this._products();
    this.commit(
      list.map((p) => {
        if (p.id !== id) return p;
        const next = { ...p, ...patch };
        // Có gửi slug (form admin) → chuẩn hoá + tránh trùng; đổi slug thì giữ slug cũ để link cũ vẫn chạy.
        if (patch.slug !== undefined || !next.slug) {
          next.slug = uniqueSlug(slugify(patch.slug || next.name), list, id);
          if (p.slug && p.slug !== next.slug) next.oldSlugs = [p.slug, ...(p.oldSlugs ?? []).filter((s) => s !== next.slug)].slice(0, 10);
        }
        return next;
      }),
    );
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

  /** Nạp dữ liệu từ máy chủ (hoặc dữ liệu mẫu) — không tính là thay đổi của admin. */
  hydrate(list: Product[]): void {
    const next = ensureSlugs(list);
    try {
      saveJson(STORAGE_KEYS.products, next);
    } catch {
      /* bộ nhớ đầy → vẫn hiển thị trong phiên này */
    }
    this._products.set(next);
  }

  /**
   * Máy này chưa có dữ liệu và máy chủ cũng chưa có → hiện sản phẩm mẫu.
   * Không ghi vào bộ nhớ trình duyệt: "có dữ liệu trên máy" luôn nghĩa là dữ liệu thật admin đã lưu.
   */
  useSeedIfEmpty(): void {
    if (!hasJson(STORAGE_KEYS.products)) this._products.set(ensureSlugs(refreshSeedImages(structuredClone(SEED_PRODUCTS))));
  }

  /** Ghi vào localStorage trước; nếu bộ nhớ đầy thì ném lỗi và giữ nguyên dữ liệu cũ. */
  private commit(next: Product[]): void {
    saveJson(STORAGE_KEYS.products, next);
    this._products.set(next);
    this.changes.update((n) => n + 1);
  }
}

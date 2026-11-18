/** Đọc JSON từ localStorage; lỗi hoặc chưa có thì dùng giá trị mặc định. */
export function loadJson<T>(key: string, fallback: () => T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* dùng mặc định */
  }
  return fallback();
}

/** Máy này đã có dữ liệu lưu cho khoá này chưa. */
export function hasJson(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

/** Ghi JSON vào localStorage. Ném lỗi thân thiện khi bộ nhớ đầy. */
export function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      throw new Error('Bộ nhớ trình duyệt đã đầy. Hãy dùng ít ảnh hơn hoặc xoá bớt dữ liệu.');
    }
    // localStorage không khả dụng (chế độ riêng tư...) — vẫn chạy trong phiên hiện tại.
  }
}

export const STORAGE_KEYS = {
  products: 'fumo.products.v1',
  news: 'fumo.news.v1',
  categories: 'fumo.categories.v1',
  settings: 'fumo.settings.v1',
  adminPass: 'fumo.admin.pass',
  /** Admin có thay đổi sản phẩm / danh mục / tin tức chưa gửi lên máy chủ. */
  catalogDirty: 'fumo.catalog.dirty',
} as const;

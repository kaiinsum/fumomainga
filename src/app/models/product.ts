export type ProductSize = 'S' | 'M' | 'L';

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  images: string[];
  tags: string[];
  size: ProductSize;
  inStock: boolean;
  featured: boolean;
  createdAt: number;
}

export type ProductInput = Omit<Product, 'id' | 'createdAt'>;

export interface Category {
  name: string;
  icon: string;
}

/** Danh mục mặc định — admin có thể thêm/sửa/xoá ở trang Quản trị → Danh mục. */
export const DEFAULT_CATEGORIES: Category[] = [
  { name: 'Fumo Plush', icon: '🧸' },
  { name: 'Móc khóa', icon: '🔑' },
  { name: 'Figure', icon: '🗿' },
  { name: 'Phụ kiện', icon: '🎀' },
];
export const SIZES: ProductSize[] = ['S', 'M', 'L'];

export type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'name';

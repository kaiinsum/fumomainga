export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  images: string[];
  tags: string[];
  /** Giá sau giảm (VNĐ). null / không có = không giảm giá. Phải nhỏ hơn price. */
  salePrice?: number | null;
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

/** Sản phẩm đang được giảm giá? */
export const onSale = (p: Pick<Product, 'price' | 'salePrice'>): boolean =>
  typeof p.salePrice === 'number' && p.salePrice >= 0 && p.salePrice < p.price;

/** Giá khách phải trả (đã trừ giảm giá). */
export const finalPrice = (p: Pick<Product, 'price' | 'salePrice'>): number => (onSale(p) ? (p.salePrice as number) : p.price);

/** % giảm (làm tròn), 0 nếu không giảm. */
export const discountPercent = (p: Pick<Product, 'price' | 'salePrice'>): number =>
  onSale(p) && p.price > 0 ? Math.round((1 - (p.salePrice as number) / p.price) * 100) : 0;

export type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'name';

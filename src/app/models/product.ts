/** Biến thể (ví dụ: 10cm / 20cm, màu...). Mỗi biến thể có giá và giá giảm riêng. */
export interface ProductVariant {
  id: string;
  name: string;
  price: number;
  /** Giá sau giảm, null = không giảm. */
  salePrice?: number | null;
  /** Ảnh riêng của biến thể (khách bấm chọn biến thể thì hiện ảnh này). Trống = dùng ảnh sản phẩm. */
  image?: string;
}

export interface Product {
  id: string;
  name: string;
  /** Đường dẫn đẹp: /san-pham/<slug>, tự sinh từ tên (bỏ dấu, khoảng trắng → -). */
  slug?: string;
  /** Các slug cũ (sau khi đổi tên) — link cũ vẫn mở được và tự chuyển sang link mới. */
  oldSlugs?: string[];
  category: string;
  price: number;
  description: string;
  images: string[];
  tags: string[];
  /** Giá sau giảm (VNĐ). null / không có = không giảm giá. Phải nhỏ hơn price. */
  salePrice?: number | null;
  /** Có biến thể → price/salePrice của sản phẩm = biến thể rẻ nhất (tự đồng bộ khi lưu). */
  variants?: ProductVariant[];
  inStock: boolean;
  featured: boolean;
  /** Admin ẩn sản phẩm: khách không thấy ở bất kỳ đâu (link trực tiếp cũng không mở). */
  hidden?: boolean;
  createdAt: number;
  /** Ngày ra mắt (YYYY-MM-DD) cho thông báo "Sản phẩm mới". Trống = ngày đăng. */
  releasedAt?: string;
  /** Nội dung thông báo cho khách. Trống = dùng mô tả sản phẩm. */
  notice?: string;
  /** SEO kiểu Rank Math (từ khoá chính, tiêu đề / mô tả meta, robots, schema). Sản phẩm cũ có thể chưa có. */
  seo?: ProductSeo;
}

/** Loại bài viết khai báo kèm trang sản phẩm (schema.org). */
export type ProductArticleType = 'Article' | 'BlogPosting' | 'Review';
export type ProductCondition = 'NewCondition' | 'UsedCondition' | 'RefurbishedCondition';

/** Cấu hình SEO của sản phẩm — để trống thì lấy mặc định từ tên / mô tả sản phẩm. */
export interface ProductSeo {
  focusKeyword: string;
  /** Tiêu đề SEO (thẻ <title>). Trống → tên sản phẩm. */
  title: string;
  /** Mô tả meta. Trống → đầu mô tả sản phẩm. */
  description: string;
  noindex: boolean;
  nofollow: boolean;
  /** URL chuẩn (canonical). Trống → chính link sản phẩm. */
  canonical: string;
  /** Khai báo schema Product (giá, tình trạng, thương hiệu) cho Google. */
  productSchema: boolean;
  brand: string;
  sku: string;
  condition: ProductCondition;
  /** Khai báo bài viết (Article / BlogPosting / Review) về sản phẩm. */
  article: boolean;
  articleType: ProductArticleType;
  /** Tiêu đề bài viết. Trống → tiêu đề SEO. */
  headline: string;
  /** Tác giả bài viết. Trống → tên shop. */
  author: string;
  /** Điểm đánh giá (1–5) khi khai báo dạng Review. */
  rating: number;
}

export const EMPTY_PRODUCT_SEO: ProductSeo = {
  focusKeyword: '',
  title: '',
  description: '',
  noindex: false,
  nofollow: false,
  canonical: '',
  productSchema: true,
  brand: '',
  sku: '',
  condition: 'NewCondition',
  article: false,
  articleType: 'Article',
  headline: '',
  author: '',
  rating: 5,
};

export const productSeoOf = (p: { seo?: Partial<ProductSeo> }): ProductSeo => ({ ...EMPTY_PRODUCT_SEO, ...p.seo });

export type ProductInput = Omit<Product, 'id' | 'createdAt' | 'oldSlugs'>;

/** Link trang chi tiết sản phẩm. */
export const productPath = (p: Pick<Product, 'id' | 'slug'>): string => `/san-pham/${p.slug || p.id}`;

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

type Priced = Pick<Product, 'price' | 'salePrice'> & { variants?: ProductVariant[] };

/** Danh sách biến thể hợp lệ (có tên). */
export const variantsOf = (p: { variants?: ProductVariant[] }): ProductVariant[] => (p.variants ?? []).filter((v) => v && v.name);

/** Biến thể rẻ nhất (theo giá khách trả), hoặc chính sản phẩm nếu không có biến thể. */
export const cheapest = (p: Priced): Pick<Product, 'price' | 'salePrice'> =>
  variantsOf(p).reduce<Pick<Product, 'price' | 'salePrice'>>((a, b) => (finalPrice(b) < finalPrice(a) ? b : a), variantsOf(p)[0] ?? p);

/** Các biến thể có giá khác nhau → hiển thị "Từ ...". */
export const hasPriceRange = (p: Priced): boolean => new Set(variantsOf(p).map((v) => finalPrice(v))).size > 1;

export type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'name';

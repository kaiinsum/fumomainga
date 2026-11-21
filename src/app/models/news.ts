import type { ContentFormat } from '../shared/article-html';

export type NewsStatus = 'draft' | 'published';

/** Loại schema.org khai báo cho bài viết (giống Rank Math → Schema). */
export type NewsSchemaType = 'Article' | 'NewsArticle' | 'BlogPosting';

/** Cấu hình SEO của một bài - tất cả đều tuỳ chọn, để trống sẽ lấy giá trị mặc định từ bài viết. */
export interface NewsSeo {
  /** Đường dẫn thân thiện: /tin-tuc/<slug>. Trống → dùng id. */
  slug: string;
  /** Từ khoá chính (focus keyword). */
  focusKeyword: string;
  /** Nội dung cốt lõi (pillar content): bài quan trọng nhất cho từ khoá - yêu cầu nội dung dài hơn. */
  pillar?: boolean;
  /** Từ khoá phụ (cách nhau bằng dấu phẩy). */
  secondaryKeywords: string;
  /** Tiêu đề SEO (thẻ <title>). Trống → tiêu đề bài. */
  title: string;
  /** Mô tả meta. Trống → tóm tắt. */
  description: string;
  schemaType: NewsSchemaType;
  noindex: boolean;
  nofollow: boolean;
  /** URL chuẩn (canonical). Trống → chính URL bài viết. */
  canonical: string;
}

export interface NewsPost {
  id: string;
  title: string;
  excerpt: string;
  /** Nội dung: Markdown đơn giản (soạn thường) hoặc mã HTML - xem `format`. */
  content: string;
  /** Kiểu soạn nội dung. Trống = 'markdown' (bài cũ). */
  format?: ContentFormat;
  /** Mã danh mục bài viết (Admin → Tin tức → Danh mục bài viết). Trống = chưa phân loại. */
  category?: string;
  cover: string;
  /** Mô tả ảnh đại diện (alt). Trống = tiêu đề bài. */
  coverAlt?: string;
  /** Link khi bấm ảnh đại diện trong bài (https://... hoặc /san-pham/...). */
  coverLink?: string;
  status: NewsStatus;
  createdAt: number;
  updatedAt: number;
  /** Bài cũ (trước khi có SEO) có thể không có trường này. */
  seo?: NewsSeo;
}

export type NewsInput = Pick<NewsPost, 'title' | 'excerpt' | 'content' | 'cover' | 'coverAlt' | 'coverLink' | 'status' | 'seo' | 'format' | 'category'>;

/** Danh mục bài viết (admin tạo được). */
export interface NewsCategory {
  id: string;
  name: string;
  /** Emoji hoặc ảnh PNG vuông. */
  icon: string;
}

export const DEFAULT_NEWS_CATEGORIES: NewsCategory[] = [
  { id: 'tin-moi', name: 'Tin mới', icon: '📢' },
  { id: 'hang-moi-ve', name: 'Hàng mới về', icon: '🧸' },
  { id: 'meo-hay', name: 'Mẹo hay', icon: '💡' },
  { id: 'su-kien', name: 'Sự kiện', icon: '🎉' },
];

/** Danh mục bài viết đang dùng (cài đặt admin, chưa có thì mặc định). */
export const newsCategoriesOf = (s: { newsCategories?: NewsCategory[] }): NewsCategory[] =>
  Array.isArray(s.newsCategories) ? s.newsCategories.filter((c) => c && c.id && c.name) : DEFAULT_NEWS_CATEGORIES;

export const EMPTY_SEO: NewsSeo = {
  slug: '',
  focusKeyword: '',
  secondaryKeywords: '',
  title: '',
  description: '',
  schemaType: 'NewsArticle',
  noindex: false,
  nofollow: false,
  canonical: '',
};

/** Đường dẫn công khai của bài: ưu tiên slug. */
export function newsPath(p: Pick<NewsPost, 'id' | 'seo'>): string {
  return `/tin-tuc/${p.seo?.slug || p.id}`;
}

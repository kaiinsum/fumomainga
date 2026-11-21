import type { ContentFormat } from '../shared/article-html';

export type NewsStatus = 'draft' | 'published';

/** Loại schema.org khai báo cho bài viết (giống Rank Math → Schema). */
export type NewsSchemaType = 'Article' | 'NewsArticle' | 'BlogPosting';

/** Cấu hình SEO của một bài — tất cả đều tuỳ chọn, để trống sẽ lấy giá trị mặc định từ bài viết. */
export interface NewsSeo {
  /** Đường dẫn thân thiện: /tin-tuc/<slug>. Trống → dùng id. */
  slug: string;
  /** Từ khoá chính (focus keyword). */
  focusKeyword: string;
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
  /** Nội dung: Markdown đơn giản (soạn thường) hoặc mã HTML — xem `format`. */
  content: string;
  /** Kiểu soạn nội dung. Trống = 'markdown' (bài cũ). */
  format?: ContentFormat;
  cover: string;
  status: NewsStatus;
  createdAt: number;
  updatedAt: number;
  /** Bài cũ (trước khi có SEO) có thể không có trường này. */
  seo?: NewsSeo;
}

export type NewsInput = Pick<NewsPost, 'title' | 'excerpt' | 'content' | 'cover' | 'status' | 'seo' | 'format'>;

export const EMPTY_SEO: NewsSeo = {
  slug: '',
  focusKeyword: '',
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

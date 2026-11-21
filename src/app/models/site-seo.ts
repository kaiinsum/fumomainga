/**
 * Khai báo SEO cho cả web (Admin → Khai báo): từng trang trên menu khách + thông tin chung (tổ chức, ảnh chia sẻ, favicon).
 * Sản phẩm và bài viết có khai báo riêng ngay trong trang sửa của chúng.
 */

export type PageSchemaType = 'WebPage' | 'CollectionPage' | 'AboutPage' | 'ContactPage' | 'FAQPage';

/** SEO 1 trang. Để trống = dùng mặc định của trang. */
export interface PageSeo {
  focusKeyword: string;
  /** Tiêu đề hiện trên Google (thẻ <title>), viết đầy đủ. Trống → "<tên trang> — <tên shop>". */
  title: string;
  description: string;
  noindex: boolean;
  nofollow: boolean;
  canonical: string;
  /** Ảnh khi chia sẻ (Facebook, Zalo...). Trống → ảnh chia sẻ mặc định. */
  ogImage: string;
  schemaType: PageSchemaType;
}

export type OrgType = 'Organization' | 'Store' | 'OnlineStore' | 'LocalBusiness';

export interface SiteSeo {
  /** Mô tả mặc định cho trang chưa khai báo. */
  defaultDescription: string;
  /** Ảnh chia sẻ mặc định (1200×630). Trống → /og/og-default.jpg. */
  defaultOgImage: string;
  /** Favicon (ảnh vuông, PNG khuyên dùng). Trống → favicon mặc định. */
  favicon: string;
  /** Ký tự ngăn giữa tên trang và tên shop trên tab / Google. */
  titleSep: string;
  orgType: OrgType;
  /** Tên tổ chức trên Google (trống = tên shop). */
  orgName: string;
  /** Logo (link ảnh vuông ≥ 112px). */
  orgLogo: string;
  orgDescription: string;
  /** Khoảng giá (vd. 100.000₫ – 2.000.000₫) cho cửa hàng. */
  priceRange: string;
  /** Các link mạng xã hội khác (mỗi dòng 1 link) — ngoài Facebook / TikTok / Shopee đã có ở Cài đặt. */
  sameAs: string;
  /** Khai báo ô tìm kiếm của web cho Google (Sitelinks search box). */
  searchBox: boolean;
  /** Đăng sản phẩm / bài viết mới mà để trống SEO → tự điền từ khoá, tiêu đề, mô tả, schema. */
  autoFill: boolean;
  pages: Record<string, Partial<PageSeo>>;
}

export const DEFAULT_SITE_SEO: SiteSeo = {
  defaultDescription: '',
  defaultOgImage: '',
  favicon: '',
  titleSep: '—',
  orgType: 'OnlineStore',
  orgName: '',
  orgLogo: '',
  orgDescription: '',
  priceRange: '',
  sameAs: '',
  searchBox: true,
  autoFill: true,
  pages: {},
};

export const EMPTY_PAGE_SEO: PageSeo = {
  focusKeyword: '',
  title: '',
  description: '',
  noindex: false,
  nofollow: false,
  canonical: '',
  ogImage: '',
  schemaType: 'WebPage',
};

export interface SeoPageDef {
  path: string;
  label: string;
  icon: string;
  schema: PageSchemaType;
  /** Gợi ý mô tả khi chưa khai báo. */
  hint: string;
}

/** Các trang trên menu khách (header) + trang phụ — đều khai báo được ở Admin → Khai báo. */
export const SEO_PAGES: SeoPageDef[] = [
  { path: '/', label: 'Trang chủ', icon: '🏠', schema: 'WebPage', hint: 'Giới thiệu ngắn shop bán gì, có từ khoá chính (vd. "fumo chính hãng").' },
  { path: '/san-pham', label: 'Sản phẩm', icon: '🧸', schema: 'CollectionPage', hint: 'Danh sách sản phẩm — nêu các loại hàng: thú bông fumo, móc khoá, figure...' },
  { path: '/mini-game', label: 'Mini game', icon: '🎮', schema: 'CollectionPage', hint: 'Các trò chơi miễn phí trên web.' },
  { path: '/tin-tuc', label: 'Tin tức', icon: '📰', schema: 'CollectionPage', hint: 'Tin mới, mẹo chăm sóc fumo, hàng mới về.' },
  { path: '/gioi-thieu', label: 'Giới thiệu', icon: '💌', schema: 'AboutPage', hint: 'Câu chuyện, giá trị của shop.' },
  { path: '/chinh-sach', label: 'Chính sách', icon: '📜', schema: 'WebPage', hint: 'Đổi trả, vận chuyển, thanh toán, bảo mật.' },
  { path: '/lien-he', label: 'Liên hệ', icon: '☎️', schema: 'ContactPage', hint: 'Địa chỉ, số điện thoại, giờ mở cửa.' },
  { path: '/tra-cuu-don-hang', label: 'Tra cứu đơn hàng', icon: '📦', schema: 'WebPage', hint: 'Trang tra cứu đơn — thường nên để noindex.' },
];

export const siteSeoOf = (s: { seo?: Partial<SiteSeo> }): SiteSeo => ({ ...DEFAULT_SITE_SEO, ...(s.seo ?? {}), pages: { ...(s.seo?.pages ?? {}) } });

export const pageSeoOf = (seo: SiteSeo, path: string): PageSeo => {
  const def = SEO_PAGES.find((p) => p.path === path);
  return { ...EMPTY_PAGE_SEO, schemaType: def?.schema ?? 'WebPage', ...(seo.pages[path] ?? {}) };
};

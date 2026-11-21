import { EMPTY_SEO, NewsPost, NewsSeo } from '../models/news';
import { Product, ProductSeo, productSeoOf } from '../models/product';
import { PageSeo, SeoPageDef, pageSeoOf, SiteSeo } from '../models/site-seo';
import { contentAsMarkdown } from './article-html';
import { SEO_LIMITS, markdownToText } from './seo';

/**
 * Tự động khai báo SEO + schema (Admin → Khai báo → ⚡ Tự động khai báo, hoặc tự điền khi đăng mục mới).
 * Chỉ điền ô đang TRỐNG (trừ khi chọn ghi đè) - không bao giờ xoá nội dung admin đã viết.
 */

/** Cắt ở ranh giới từ, không vượt quá n ký tự. */
export function clipWords(text: string, n: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const i = cut.lastIndexOf(' ');
  return (i > n * 0.6 ? cut.slice(0, i) : cut).replace(/[,.;:\-–-]+$/, '') + '…';
}

/** Mô tả meta 120–160 ký tự từ nội dung, có chứa từ khoá. */
function metaFrom(text: string, keyword: string, fallback = ''): string {
  let base = text.replace(/\s+/g, ' ').trim() || fallback;
  if (keyword && !base.toLocaleLowerCase('vi').includes(keyword.toLocaleLowerCase('vi'))) base = `${keyword[0].toLocaleUpperCase('vi')}${keyword.slice(1)}: ${base}`;
  if (base.length < SEO_LIMITS.descriptionMin && fallback && !base.includes(fallback)) base = `${base} ${fallback}`.trim();
  return clipWords(base, SEO_LIMITS.description);
}

/** Từ khoá chính đoán từ tên: bỏ phần trong ngoặc, tối đa 5 chữ, chữ thường. */
export function guessKeyword(name: string): string {
  return name
    .replace(/[([{].*?[)\]}]/g, ' ')
    .replace(/[|–—:,.!?"“”]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join(' ')
    .toLocaleLowerCase('vi');
}

const blank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && !v.trim());

export interface AutoOptions {
  /** Ghi đè cả ô đã có nội dung. */
  overwrite?: boolean;
  shopName: string;
}

export function autoProductSeo(p: Product, o: AutoOptions): ProductSeo {
  const cur = productSeoOf(p);
  const kw = !blank(cur.focusKeyword) && !o.overwrite ? cur.focusKeyword : guessKeyword(p.name);
  const title = clipWords(`${p.name}${p.category && !p.name.toLowerCase().includes(p.category.toLowerCase()) ? ' – ' + p.category : ''}`, SEO_LIMITS.title);
  const desc = metaFrom(p.description, kw, `Mua ${p.name} tại ${o.shopName}.`);
  const pick = <K extends keyof ProductSeo>(k: K, v: ProductSeo[K]): ProductSeo[K] => (o.overwrite || blank(cur[k]) ? v : cur[k]);
  return {
    ...cur,
    focusKeyword: kw,
    title: pick('title', title),
    description: pick('description', desc),
    // Từ khoá phụ gợi ý: danh mục + thẻ sản phẩm (bỏ trùng từ khoá chính).
    secondaryKeywords: pick(
      'secondaryKeywords',
      [p.category, ...(p.tags ?? [])]
        .map((t) => (t ?? '').trim())
        .filter((t, i, a) => t && t.toLowerCase() !== kw.toLowerCase() && a.indexOf(t) === i)
        .slice(0, 5)
        .join(', '),
    ),
    // Schema Product luôn bật khi tự khai báo; thương hiệu = tên shop, SKU = mã sản phẩm.
    productSchema: true,
    brand: pick('brand', o.shopName),
    sku: pick('sku', p.id.slice(0, 40)),
  };
}

export function autoNewsSeo(n: NewsPost, o: AutoOptions): NewsSeo {
  const cur = { ...EMPTY_SEO, ...n.seo };
  const kw = !blank(cur.focusKeyword) && !o.overwrite ? cur.focusKeyword : guessKeyword(n.title);
  const text = n.excerpt?.trim() || markdownToText(contentAsMarkdown(n));
  const pick = <K extends keyof NewsSeo>(k: K, v: NewsSeo[K]): NewsSeo[K] => (o.overwrite || blank(cur[k]) ? v : cur[k]);
  return {
    ...cur,
    focusKeyword: kw,
    title: pick('title', clipWords(n.title, SEO_LIMITS.title)),
    description: pick('description', metaFrom(text, kw, n.title)),
    schemaType: cur.schemaType || 'NewsArticle',
  };
}

export function autoPageSeo(def: SeoPageDef, seo: SiteSeo, o: AutoOptions): Partial<PageSeo> {
  const cur = pageSeoOf(seo, def.path);
  const shop = o.shopName;
  const kwByPath: Record<string, string> = {
    '/': `${shop}`.toLocaleLowerCase('vi'),
    '/san-pham': 'fumo',
    '/mini-game': 'minigame fumo',
    '/tin-tuc': `tin tức fumo`,
    '/gioi-thieu': `giới thiệu ${shop}`.toLocaleLowerCase('vi'),
    '/chinh-sach': `chính sách ${shop}`.toLocaleLowerCase('vi'),
    '/lien-he': `liên hệ ${shop}`.toLocaleLowerCase('vi'),
    '/tra-cuu-don-hang': 'tra cứu đơn hàng',
  };
  const titleByPath: Record<string, string> = {
    '/': `${shop} – Thú bông fumo, móc khoá, figure dễ thương`,
    '/san-pham': `Sản phẩm fumo, móc khoá, figure – ${shop}`,
    '/mini-game': `Minigame fumo miễn phí – ${shop}`,
    '/tin-tuc': `Tin tức fumo & mẹo chăm sóc thú bông – ${shop}`,
    '/gioi-thieu': `Giới thiệu ${shop} – Câu chuyện của chúng mình`,
    '/chinh-sach': `Chính sách đổi trả, giao hàng – ${shop}`,
    '/lien-he': `Liên hệ ${shop} – Đặt hàng & tư vấn`,
    '/tra-cuu-don-hang': `Tra cứu đơn hàng – ${shop}`,
  };
  const descByPath: Record<string, string> = {
    '/': `${shop} chuyên thú bông fumo chính hãng, móc khoá, figure và phụ kiện dễ thương. Hàng có sẵn & order, đóng gói cẩn thận, giao toàn quốc.`,
    '/san-pham': `Xem tất cả sản phẩm fumo tại ${shop}: thú bông fumo, móc khoá, figure, phụ kiện. Lọc theo danh mục, giá, còn hàng - đặt mua nhanh.`,
    '/mini-game': `Chơi minigame fumo miễn phí ngay trên trình duyệt: Fumo Ninja, Merge Fumo, Piano Tiles, đoán nhân vật... đua top bảng xếp hạng!`,
    '/tin-tuc': `Tin tức fumo mới nhất từ ${shop}: hàng mới về, mẹo chăm sóc và vệ sinh thú bông, sự kiện và ưu đãi dành cho fan fumo.`,
    '/gioi-thieu': `Giới thiệu ${shop}: câu chuyện, giá trị và hành trình mang những bé fumo dễ thương đến tay người hâm mộ trên khắp Việt Nam.`,
    '/chinh-sach': `Chính sách của ${shop}: đổi trả, vận chuyển, thanh toán chuyển khoản, bảo hành và bảo mật thông tin khách hàng - rõ ràng, minh bạch.`,
    '/lien-he': `Liên hệ ${shop} để đặt hàng, hỏi hàng order hoặc tư vấn chọn fumo: địa chỉ, số điện thoại, email, Facebook, Zalo và giờ làm việc.`,
    '/tra-cuu-don-hang': `Tra cứu tình trạng đơn hàng tại ${shop} bằng mã đơn và số điện thoại đặt hàng.`,
  };
  const kw = !blank(cur.focusKeyword) && !o.overwrite ? cur.focusKeyword : kwByPath[def.path] ?? guessKeyword(def.label);
  const pick = <K extends keyof PageSeo>(k: K, v: PageSeo[K]): PageSeo[K] => (o.overwrite || blank(cur[k]) ? v : cur[k]);
  return {
    ...seo.pages[def.path],
    focusKeyword: kw,
    title: pick('title', clipWords(titleByPath[def.path] ?? `${def.label} – ${shop}`, SEO_LIMITS.title)),
    description: pick('description', metaFrom(descByPath[def.path] ?? def.hint, kw)),
    schemaType: def.schema,
    // Trang tra cứu đơn: không cần lên Google.
    ...(def.path === '/tra-cuu-don-hang' && (o.overwrite || !seo.pages[def.path]?.noindex) ? { noindex: true } : {}),
  };
}

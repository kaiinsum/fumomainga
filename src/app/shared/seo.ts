import { richToText } from './rich-text';
import { NewsSeo } from '../models/news';
import { ProductSeo } from '../models/product';
import { ContentFormat, contentAsMarkdown } from './article-html';

/** Giới hạn hiển thị của Google (xấp xỉ theo ký tự). */
export const SEO_LIMITS = { title: 60, description: 160, descriptionMin: 120, url: 75, minWords: 600 };

/** "Fumo mùa Đông 2026!" → "fumo-mua-dong-2026" */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/** Bỏ cú pháp Markdown, chỉ giữ chữ. */
export function markdownToText(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*>]\s+/gm, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const norm = (s: string) => s.normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim();
const words = (s: string) => (s.trim() ? s.trim().split(/\s+/) : []);

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) n++;
  return n;
}

/**
 * Từ khoá phụ (kiểu Rank Math "secondary keywords"): mỗi từ khoá nên xuất hiện ít nhất 1 lần trong tiêu đề / mô tả / nội dung.
 * Chưa có từ khoá phụ chỉ trừ nhẹ điểm.
 */
function secondaryCheck(add: (cond: boolean | CheckLevel, weight: number, ok: string, bad: string) => void, raw: string | undefined, mainKw: string, texts: string[]): void {
  const list = (raw ?? '')
    .split(/[,\n;]+/)
    .map((k) => norm(k))
    .filter((k, i, a) => k && k !== mainKw && a.indexOf(k) === i);
  if (!list.length) {
    add('warn', 3, '', 'Chưa có từ khoá phụ - thêm 2–5 cách gọi khác mà khách hay tìm (cách nhau bằng dấu phẩy).');
    return;
  }
  const hay = norm(texts.join(' '));
  const missing = list.filter((k) => !hay.includes(k));
  add(
    !missing.length ? true : missing.length < list.length ? 'warn' : false,
    5,
    `Đã dùng đủ ${list.length} từ khoá phụ trong nội dung.`,
    `Từ khoá phụ chưa xuất hiện: ${missing.map((k) => '"' + k + '"').join(', ')} - hãy viết chúng vào tiêu đề, mô tả hoặc nội dung.`,
  );
}

export interface SeoSource {
  title: string;
  excerpt: string;
  content: string;
  cover: string;
  seo: NewsSeo;
  /** Bài soạn bằng HTML → tự đổi sang dạng chữ để chấm điểm. */
  format?: ContentFormat;
}

export type CheckLevel = 'ok' | 'warn' | 'bad';

export interface SeoCheck {
  level: CheckLevel;
  text: string;
  /** Trọng số khi tính điểm. */
  weight: number;
}

export interface SeoReport {
  score: number;
  checks: SeoCheck[];
  /** Giá trị cuối cùng sẽ được khai báo (đã điền mặc định). */
  title: string;
  description: string;
  slug: string;
  words: number;
  density: number;
}

/** Giá trị thực tế khi trống: tiêu đề SEO → tiêu đề bài, mô tả → tóm tắt. */
export function effectiveSeo(src: SeoSource): { title: string; description: string } {
  const description = (src.seo.description || src.excerpt || markdownToText(contentAsMarkdown(src))).trim();
  return {
    title: (src.seo.title || src.title).trim(),
    description: description.length > SEO_LIMITS.description ? description.slice(0, SEO_LIMITS.description - 1) + '…' : description,
  };
}

/** Chấm điểm SEO theo các tiêu chí tương tự Rank Math. */
export function analyzeSeo(input: SeoSource, slugFallback: string): SeoReport {
  // Bài HTML: đổi sang dạng Markdown giản lược để các tiêu chí (H2/H3, alt ảnh, link) chấm như nhau.
  const src: SeoSource = input.format === 'html' ? { ...input, content: contentAsMarkdown(input), format: 'markdown' } : input;
  const { title, description } = effectiveSeo(src);
  const slug = src.seo.slug || slugFallback;
  const kw = norm(src.seo.focusKeyword);
  const text = markdownToText(src.content);
  const total = words(text).length;
  const occurrences = countOccurrences(norm(text), kw);
  const density = kw && total ? (occurrences * words(kw).length * 100) / total : 0;

  const checks: SeoCheck[] = [];
  const add = (cond: boolean | CheckLevel, weight: number, ok: string, bad: string) => {
    const level: CheckLevel = cond === true ? 'ok' : cond === false ? 'bad' : cond;
    checks.push({ level, weight, text: level === 'ok' ? ok : bad });
  };

  // --- Từ khoá chính ---
  if (!kw) {
    add(false, 30, '', 'Chưa đặt từ khoá chính - hãy nhập từ khoá bạn muốn bài lên Google.');
  } else {
    const t = norm(title);
    add(t.includes(kw), 8, 'Từ khoá có trong tiêu đề SEO.', 'Thêm từ khoá chính vào tiêu đề SEO.');
    add(
      t.indexOf(kw) >= 0 && t.indexOf(kw) <= t.length / 2,
      3,
      'Từ khoá nằm ở nửa đầu tiêu đề.',
      'Nên đưa từ khoá về gần đầu tiêu đề.',
    );
    add(norm(description).includes(kw), 6, 'Từ khoá có trong mô tả meta.', 'Thêm từ khoá chính vào mô tả meta.');
    add(slug.includes(slugify(kw)), 6, 'Từ khoá có trong đường dẫn (URL).', 'Đưa từ khoá vào đường dẫn (slug).');
    const head = norm(words(text).slice(0, Math.max(30, Math.ceil(total * 0.1))).join(' '));
    add(head.includes(kw), 5, 'Từ khoá xuất hiện ở đầu nội dung.', 'Dùng từ khoá trong đoạn mở đầu (10% đầu bài).');
    const subheads = (src.content.match(/^#{2,3}\s+.*$/gm) ?? []).map(norm);
    add(subheads.some((h) => h.includes(kw)), 4, 'Từ khoá có trong tiêu đề phụ (H2/H3).', 'Thêm từ khoá vào ít nhất một tiêu đề phụ H2/H3.');
    const alts = [...src.content.matchAll(/!\[([^\]]*)\]/g)].map((m) => norm(m[1]));
    add(alts.some((a) => a.includes(kw)), 3, 'Từ khoá có trong mô tả ảnh (alt).', 'Đặt từ khoá vào mô tả (alt) của một ảnh trong bài.');
    add(
      density >= 1 && density <= 2.5,
      5,
      `Mật độ từ khoá ${density.toFixed(1)}% - hợp lý.`,
      density > 2.5
        ? `Mật độ từ khoá ${density.toFixed(1)}% - quá dày, nên giảm (1–2.5%).`
        : `Mật độ từ khoá ${density.toFixed(1)}% (${occurrences} lần) - nên đạt 1–2.5%.`,
    );
  }

  // --- Tiêu đề, mô tả, URL ---
  add(
    (title.length >= 30 && title.length <= SEO_LIMITS.title) || 'warn',
    5,
    `Tiêu đề SEO dài ${title.length} ký tự - vừa đẹp.`,
    title.length > SEO_LIMITS.title
      ? `Tiêu đề SEO dài ${title.length} ký tự - Google sẽ cắt bớt (nên ≤ ${SEO_LIMITS.title}).`
      : `Tiêu đề SEO hơi ngắn (${title.length} ký tự) - nên 30–${SEO_LIMITS.title}.`,
  );
  add(/\d/.test(title), 2, 'Tiêu đề có con số.', 'Thêm con số vào tiêu đề (vd: "5 mẹo…") để tăng tỉ lệ nhấp.');
  add(
    !src.seo.description ? 'warn' : description.length >= SEO_LIMITS.descriptionMin && description.length <= SEO_LIMITS.description ? true : 'warn',
    6,
    `Mô tả meta dài ${description.length} ký tự - vừa đẹp.`,
    !src.seo.description
      ? 'Chưa viết mô tả meta riêng - đang tự lấy từ tóm tắt.'
      : `Mô tả meta dài ${description.length} ký tự - nên ${SEO_LIMITS.descriptionMin}–${SEO_LIMITS.description}.`,
  );
  add(
    !!src.seo.slug && slug.length <= SEO_LIMITS.url,
    4,
    `Đường dẫn ngắn gọn (${slug.length} ký tự).`,
    src.seo.slug ? `Đường dẫn dài ${slug.length} ký tự - nên ≤ ${SEO_LIMITS.url}.` : 'Chưa đặt đường dẫn thân thiện (slug).',
  );

  // --- Nội dung ---
  add(
    total >= SEO_LIMITS.minWords ? true : total >= 300 ? 'warn' : false,
    15,
    `Nội dung dài ${total} từ - tốt.`,
    `Nội dung có ${total} từ - nên viết từ ${SEO_LIMITS.minWords} từ trở lên.`,
  );
  add(/^#{2,3}\s+/m.test(src.content), 3, 'Bài có tiêu đề phụ H2/H3.', 'Chia bài bằng tiêu đề phụ (H2/H3) để dễ đọc.');
  add(/\]\(\/(?!\/)/.test(src.content), 3, 'Có liên kết nội bộ.', 'Thêm liên kết tới trang khác trong website (vd: /san-pham).');
  add(/\]\(https?:\/\//.test(src.content), 2, 'Có liên kết ra ngoài.', 'Thêm một liên kết ra nguồn tham khảo bên ngoài.');
  add(!!src.cover || /!\[/.test(src.content), 4, 'Bài có hình ảnh.', 'Thêm ảnh đại diện hoặc ảnh trong bài.');
  add(!src.seo.noindex, 5, 'Bài được phép lập chỉ mục (index).', 'Bài đang đặt noindex - Google sẽ không hiển thị bài này.');
  secondaryCheck(add, src.seo.secondaryKeywords, kw, [title, description, text]);

  const max = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.reduce((s, c) => s + (c.level === 'ok' ? c.weight : c.level === 'warn' ? c.weight / 2 : 0), 0);
  const order: Record<CheckLevel, number> = { bad: 0, warn: 1, ok: 2 };
  checks.sort((a, b) => order[a.level] - order[b.level]);
  return { score: Math.round((got / max) * 100), checks, title, description, slug, words: total, density };
}

export function scoreLevel(score: number): CheckLevel {
  return score >= 80 ? 'ok' : score >= 50 ? 'warn' : 'bad';
}

// ================= SEO sản phẩm =================

export interface ProductSeoSource {
  name: string;
  description: string;
  images: string[];
  tags: string[];
  slug: string;
  seo: ProductSeo;
}

/** Giá trị thực tế khi trống: tiêu đề SEO → tên sản phẩm, mô tả → đầu mô tả sản phẩm. */
export function effectiveProductSeo(src: Pick<ProductSeoSource, 'name' | 'description' | 'seo'>): { title: string; description: string } {
  const description = (src.seo.description || richToText(src.description).replace(/\s+/g, ' ')).trim();
  return {
    title: (src.seo.title || src.name).trim(),
    description: description.length > SEO_LIMITS.description ? description.slice(0, SEO_LIMITS.description - 1) + '…' : description,
  };
}

/** Số từ tối thiểu nên có cho mô tả sản phẩm. */
export const PRODUCT_MIN_WORDS = 150;

/** Chấm điểm SEO sản phẩm theo tiêu chí kiểu Rank Math (bản dành cho WooCommerce). */
export function analyzeProductSeo(src: ProductSeoSource): SeoReport {
  const { title, description } = effectiveProductSeo(src);
  const slug = src.slug;
  const kw = norm(src.seo.focusKeyword);
  const text = richToText(src.description).trim();
  const total = words(text).length;
  const occurrences = countOccurrences(norm(text), kw);
  const density = kw && total ? (occurrences * words(kw).length * 100) / total : 0;

  const checks: SeoCheck[] = [];
  const add = (cond: boolean | CheckLevel, weight: number, ok: string, bad: string) => {
    const level: CheckLevel = cond === true ? 'ok' : cond === false ? 'bad' : cond;
    checks.push({ level, weight, text: level === 'ok' ? ok : bad });
  };

  // --- Từ khoá chính ---
  if (!kw) {
    add(false, 30, '', 'Chưa đặt từ khoá chính - nhập cụm từ khách hay gõ trên Google để tìm sản phẩm này.');
  } else {
    const t = norm(title);
    add(t.includes(kw), 8, 'Từ khoá có trong tiêu đề SEO.', 'Thêm từ khoá chính vào tiêu đề SEO.');
    add(t.indexOf(kw) >= 0 && t.indexOf(kw) <= t.length / 2, 3, 'Từ khoá nằm ở nửa đầu tiêu đề.', 'Nên đưa từ khoá về gần đầu tiêu đề.');
    add(norm(description).includes(kw), 6, 'Từ khoá có trong mô tả meta.', 'Thêm từ khoá chính vào mô tả meta.');
    add(slug.includes(slugify(kw)), 6, 'Từ khoá có trong đường dẫn (URL).', 'Đưa từ khoá vào đường dẫn sản phẩm.');
    const head = norm(words(text).slice(0, Math.max(30, Math.ceil(total * 0.1))).join(' '));
    add(head.includes(kw), 5, 'Từ khoá xuất hiện ở đầu mô tả sản phẩm.', 'Dùng từ khoá ngay trong câu đầu của mô tả sản phẩm.');
    add(
      density >= 0.5 && density <= 3,
      4,
      `Mật độ từ khoá ${density.toFixed(1)}% - hợp lý.`,
      density > 3
        ? `Mật độ từ khoá ${density.toFixed(1)}% - quá dày, nên giảm (0.5–3%).`
        : `Mật độ từ khoá ${density.toFixed(1)}% (${occurrences} lần) - nên lặp lại từ khoá trong mô tả (0.5–3%).`,
    );
    add(norm(src.name).includes(kw), 3, 'Tên sản phẩm (dùng làm alt ảnh) có từ khoá.', 'Tên sản phẩm chưa có từ khoá - ảnh sản phẩm dùng tên làm mô tả (alt).');
    add(src.tags.some((g) => norm(g).includes(kw) || kw.includes(norm(g))), 2, 'Thẻ sản phẩm có từ khoá.', 'Thêm từ khoá vào ô Thẻ sản phẩm.');
  }

  // --- Tiêu đề, mô tả, URL ---
  add(
    (title.length >= 30 && title.length <= SEO_LIMITS.title) || 'warn',
    5,
    `Tiêu đề SEO dài ${title.length} ký tự - vừa đẹp.`,
    title.length > SEO_LIMITS.title
      ? `Tiêu đề SEO dài ${title.length} ký tự - Google sẽ cắt bớt (nên ≤ ${SEO_LIMITS.title}).`
      : `Tiêu đề SEO hơi ngắn (${title.length} ký tự) - nên 30–${SEO_LIMITS.title}, vd: thêm kích cỡ / loại hàng.`,
  );
  add(
    !src.seo.description ? 'warn' : description.length >= SEO_LIMITS.descriptionMin && description.length <= SEO_LIMITS.description ? true : 'warn',
    6,
    `Mô tả meta dài ${description.length} ký tự - vừa đẹp.`,
    !src.seo.description
      ? 'Chưa viết mô tả meta riêng - đang tự lấy đầu mô tả sản phẩm.'
      : `Mô tả meta dài ${description.length} ký tự - nên ${SEO_LIMITS.descriptionMin}–${SEO_LIMITS.description}.`,
  );
  add(!!slug && slug.length <= SEO_LIMITS.url, 4, `Đường dẫn ngắn gọn (${slug.length} ký tự).`, `Đường dẫn dài ${slug.length} ký tự - nên ≤ ${SEO_LIMITS.url}.`);

  // --- Nội dung & hình ảnh ---
  add(
    total >= PRODUCT_MIN_WORDS ? true : total >= 60 ? 'warn' : false,
    12,
    `Mô tả sản phẩm dài ${total} từ - tốt.`,
    `Mô tả sản phẩm có ${total} từ - nên viết từ ${PRODUCT_MIN_WORDS} từ (chất liệu, kích thước, cách bảo quản…).`,
  );
  const imgs = src.images.length;
  add(imgs >= 3 ? true : imgs ? 'warn' : false, 5, `Có ${imgs} ảnh sản phẩm.`, `Mới có ${imgs} ảnh - nên có từ 3 ảnh trở lên (nhiều góc chụp).`);
  add(
    src.images.some((i) => /^https?:\/\//i.test(i)) || (imgs ? 'warn' : false),
    3,
    'Ảnh có link công khai - Google / Facebook đọc được.',
    'Ảnh đang là ảnh tải từ máy (chưa có link https) - Google Hình ảnh không đọc được.',
  );
  add(src.tags.length >= 2 || (src.tags.length ? 'warn' : false), 2, 'Sản phẩm có thẻ phân loại.', 'Thêm vài thẻ (tag) để gợi ý sản phẩm liên quan tốt hơn.');

  // --- Khai báo ---
  add(src.seo.productSchema, 4, 'Đã khai báo schema Product (giá, tình trạng hàng).', 'Bật khai báo schema Product để Google hiện giá & tình trạng hàng.');
  add(!src.seo.noindex, 5, 'Sản phẩm được phép lập chỉ mục (index).', 'Sản phẩm đang đặt noindex - Google sẽ không hiển thị.');
  secondaryCheck(add, src.seo.secondaryKeywords, kw, [title, description, text, src.tags.join(' ')]);

  const max = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.reduce((s, c) => s + (c.level === 'ok' ? c.weight : c.level === 'warn' ? c.weight / 2 : 0), 0);
  const order: Record<CheckLevel, number> = { bad: 0, warn: 1, ok: 2 };
  checks.sort((a, b) => order[a.level] - order[b.level]);
  return { score: Math.round((got / max) * 100), checks, title, description, slug, words: total, density };
}

// ================= SEO trang (Admin → Khai báo) =================

/** Chấm điểm SEO một trang tĩnh (Trang chủ, Sản phẩm, Liên hệ...). */
export function analyzePageSeo(src: {
  title: string;
  description: string;
  focusKeyword: string;
  secondaryKeywords?: string;
  path: string;
  noindex: boolean;
  ogImage: string;
  /** Ảnh chia sẻ mặc định của web (dùng khi trang chưa đặt ảnh riêng). */
  defaultOgImage: string;
}): SeoReport {
  const title = src.title.trim();
  const description = src.description.trim();
  const kw = norm(src.focusKeyword);
  const checks: SeoCheck[] = [];
  const add = (cond: boolean | CheckLevel, weight: number, ok: string, bad: string) => {
    const level: CheckLevel = cond === true ? 'ok' : cond === false ? 'bad' : cond;
    checks.push({ level, weight, text: level === 'ok' ? ok : bad });
  };
  if (!kw) add(false, 25, '', 'Chưa đặt từ khoá chính cho trang này.');
  else {
    const t = norm(title);
    add(t.includes(kw), 10, 'Từ khoá có trong tiêu đề SEO.', 'Thêm từ khoá chính vào tiêu đề SEO.');
    add(t.indexOf(kw) >= 0 && t.indexOf(kw) <= t.length / 2, 4, 'Từ khoá nằm ở nửa đầu tiêu đề.', 'Nên đưa từ khoá về gần đầu tiêu đề.');
    add(norm(description).includes(kw), 8, 'Từ khoá có trong mô tả meta.', 'Thêm từ khoá chính vào mô tả meta.');
  }
  add(
    !src.title ? 'warn' : title.length >= 30 && title.length <= SEO_LIMITS.title ? true : 'warn',
    10,
    `Tiêu đề SEO dài ${title.length} ký tự - vừa đẹp.`,
    !src.title
      ? 'Chưa viết tiêu đề SEO riêng - đang dùng "<tên trang> - <tên shop>".'
      : title.length > SEO_LIMITS.title
        ? `Tiêu đề dài ${title.length} ký tự - Google sẽ cắt bớt (nên ≤ ${SEO_LIMITS.title}).`
        : `Tiêu đề hơi ngắn (${title.length} ký tự) - nên 30–${SEO_LIMITS.title}.`,
  );
  add(
    !description ? false : description.length >= SEO_LIMITS.descriptionMin && description.length <= SEO_LIMITS.description ? true : 'warn',
    12,
    `Mô tả meta dài ${description.length} ký tự - vừa đẹp.`,
    !description ? 'Chưa có mô tả meta - Google sẽ tự lấy một đoạn bất kỳ trên trang.' : `Mô tả meta dài ${description.length} ký tự - nên ${SEO_LIMITS.descriptionMin}–${SEO_LIMITS.description}.`,
  );
  const img = src.ogImage || src.defaultOgImage;
  add(!!src.ogImage || (img ? 'warn' : false), 5, 'Có ảnh chia sẻ riêng cho trang.', img ? 'Đang dùng ảnh chia sẻ mặc định của web - nên có ảnh riêng.' : 'Chưa có ảnh chia sẻ (Facebook / Zalo).');
  add(!src.noindex, 10, 'Trang được phép lập chỉ mục (index).', 'Trang đang đặt noindex - Google sẽ không hiển thị trang này.');
  secondaryCheck(add, src.secondaryKeywords, kw, [title, description]);
  const max = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.reduce((s, c) => s + (c.level === 'ok' ? c.weight : c.level === 'warn' ? c.weight / 2 : 0), 0);
  const order: Record<CheckLevel, number> = { bad: 0, warn: 1, ok: 2 };
  checks.sort((a, b) => order[a.level] - order[b.level]);
  return { score: Math.round((got / max) * 100), checks, title, description, slug: src.path, words: 0, density: 0 };
}

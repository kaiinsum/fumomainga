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

/** Tách chuỗi từ khoá phụ → danh sách (chuẩn hoá chữ thường), bỏ trùng và bỏ từ khoá chính. */
const splitKw = (raw: string | undefined, mainKw: string) =>
  (raw ?? '')
    .split(/[,\n;]+/)
    .map((k) => norm(k))
    .filter((k, i, a) => k && k !== mainKw && a.indexOf(k) === i);

export interface SeoSource {
  title: string;
  excerpt: string;
  content: string;
  cover: string;
  /** Mô tả ảnh đại diện (alt). */
  coverAlt?: string;
  seo: NewsSeo;
  /** Bài soạn bằng HTML → tự đổi sang dạng chữ để chấm điểm. */
  format?: ContentFormat;
}

export type CheckLevel = 'ok' | 'warn' | 'bad';

/** 4 nhóm tiêu chí giống Rank Math. */
export type CheckGroup = 'basic' | 'additional' | 'title' | 'content';

export const CHECK_GROUPS: { id: CheckGroup; label: string }[] = [
  { id: 'basic', label: 'SEO cơ bản' },
  { id: 'additional', label: 'Bổ sung' },
  { id: 'title', label: 'Khả năng đọc tiêu đề' },
  { id: 'content', label: 'Khả năng đọc nội dung' },
];

export interface SeoCheck {
  level: CheckLevel;
  text: string;
  /** Trọng số khi tính điểm. */
  weight: number;
  group: CheckGroup;
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

export function scoreLevel(score: number): CheckLevel {
  return score >= 80 ? 'ok' : score >= 50 ? 'warn' : 'bad';
}

// ================= Bộ chấm chung (kiểu Rank Math) =================

interface RankInput {
  /** Từ khoá chính (đã chuẩn hoá). */
  kw: string;
  secondary: string[];
  title: string;
  description: string;
  slug: string;
  /** Chữ trơn của nội dung. */
  text: string;
  /** Các đoạn văn (để kiểm tra đoạn quá dài). */
  paragraphs: string[];
  /** Tiêu đề phụ H2/H3 (null = loại nội dung không có tiêu đề phụ, vd. mô tả sản phẩm). */
  subheads: string[] | null;
  alts: string[];
  internalLinks: number;
  externalLinks: number;
  dofollowLinks: number;
  hasMedia: boolean;
  /** Có mục lục (danh sách link #...)? null = không áp dụng. */
  hasToc: boolean | null;
  minWords: number;
  /** Đã dùng từ khoá chính này ở sản phẩm / bài khác chưa (undefined = không kiểm tra được). */
  usedBefore?: boolean;
  noun: string;
}

type Add = (group: CheckGroup, cond: boolean | CheckLevel, weight: number, ok: string, bad: string) => void;

function rankChecks(i: RankInput, add: Add): { total: number; density: number } {
  const total = words(i.text).length;
  const normText = norm(i.text);
  const t = norm(i.title);
  const { kw } = i;

  // ---------- SEO cơ bản ----------
  if (!kw) {
    add('basic', false, 30, '', `Chưa đặt từ khoá chính - nhập cụm từ khách hay gõ trên Google để tìm ${i.noun} này.`);
  } else {
    add('basic', t.includes(kw), 8, 'Tuyệt vời! Bạn đang sử dụng từ khoá chính trong Tiêu đề SEO.', 'Thêm từ khoá chính vào Tiêu đề SEO.');
    add('basic', norm(i.description).includes(kw), 6, 'Đã sử dụng từ khoá chính trong Mô tả Meta SEO.', 'Thêm từ khoá chính vào Mô tả Meta SEO.');
    add('basic', !!i.slug && i.slug.includes(slugify(kw)), 6, 'Từ khoá chính đã được sử dụng trong URL.', 'Dùng từ khoá chính trong URL (đường dẫn).');
    const head = norm(words(i.text).slice(0, Math.max(30, Math.ceil(total * 0.1))).join(' '));
    add('basic', head.includes(kw), 5, 'Từ khoá chính xuất hiện trong 10% nội dung đầu tiên.', 'Dùng từ khoá chính ngay trong 10% nội dung đầu tiên.');
    add('basic', normText.includes(kw), 6, 'Đã tìm thấy từ khoá chính trong nội dung.', 'Chưa thấy từ khoá chính trong nội dung - hãy viết nó vào bài.');
  }
  const longEnough = total >= i.minWords;
  add(
    'basic',
    longEnough ? true : total >= i.minWords / 2 ? 'warn' : false,
    12,
    `Nội dung dài ${total} từ. Làm tốt lắm!`,
    `Nội dung có ${total} từ - nên viết từ ${i.minWords} từ trở lên.`,
  );

  // ---------- Bổ sung ----------
  let hits = 0;
  if (kw) {
    if (i.subheads) {
      add('additional', i.subheads.some((h) => norm(h).includes(kw)), 4, 'Đã tìm thấy từ khoá chính trong các tiêu đề phụ.', 'Dùng từ khoá chính trong ít nhất một tiêu đề phụ (H2, H3).');
    }
    add(
      'additional',
      i.alts.some((a) => norm(a).includes(kw)),
      3,
      'Đã tìm thấy Từ khóa chính trong (các) thuộc tính alt của hình ảnh.',
      i.alts.length ? 'Thêm từ khoá chính vào alt (mô tả) của ít nhất một hình ảnh.' : 'Thêm hình ảnh có alt chứa từ khoá chính.',
    );
    // Mật độ: từ khoá chính + từ khoá phụ.
    hits = [kw, ...i.secondary].reduce((s, k) => s + countOccurrences(normText, k), 0);
  }
  const density = kw && total ? (countOccurrences(normText, kw) * words(kw).length * 100) / total : 0;
  if (kw) {
    add(
      'additional',
      density >= 0.5 && density <= 2.5 ? true : density > 2.5 ? false : density > 0 ? 'warn' : false,
      5,
      `Mật độ từ khóa là ${density.toFixed(2)}, từ khóa chính và sự kết hợp xuất hiện ${hits} lần.`,
      density > 2.5
        ? `Mật độ từ khóa là ${density.toFixed(2)} - quá cao (nên 0.5–2.5), hãy giảm bớt.`
        : `Mật độ từ khóa là ${density.toFixed(2)}, từ khóa chính và sự kết hợp xuất hiện ${hits} lần - nên đạt 0.5–2.5.`,
    );
  }
  const url = i.slug ? i.slug.length + 1 : 0;
  add('additional', !!i.slug && url <= SEO_LIMITS.url, 3, `URL dài ${url} ký tự. Rất tốt!`, i.slug ? `URL dài ${url} ký tự - nên ≤ ${SEO_LIMITS.url}.` : 'Chưa có đường dẫn (URL) thân thiện.');
  add('additional', i.externalLinks > 0, 3, 'Tuyệt vời! Bạn đang liên kết đến các tài nguyên bên ngoài.', 'Liên kết tới ít nhất một nguồn bên ngoài (trang uy tín) trong nội dung.');
  add(
    'additional',
    i.dofollowLinks > 0,
    2,
    'Ít nhất một liên kết bên ngoài với DoFollow được tìm thấy trong nội dung của bạn.',
    'Chưa có liên kết ra ngoài dạng DoFollow trong nội dung.',
  );
  add(
    'additional',
    i.internalLinks > 0,
    4,
    'Bạn đang liên kết tới các trang khác trong web (liên kết nội bộ).',
    'Chúng tôi không thể tìm thấy bất kỳ liên kết nội bộ nào trong nội dung của bạn.',
  );
  if (kw && i.usedBefore !== undefined) {
    add(
      'additional',
      !i.usedBefore,
      3,
      'Bạn chưa sử dụng Từ khóa chính này trước đây.',
      'Từ khoá chính này đã dùng cho trang khác - nên chọn từ khoá riêng để không tự cạnh tranh trên Google.',
    );
  }
  if (i.secondary.length) {
    const missing = i.secondary.filter((k) => !norm(`${i.title} ${i.description} ${i.text}`).includes(k));
    add(
      'additional',
      !missing.length ? true : missing.length < i.secondary.length ? 'warn' : false,
      4,
      `Đã dùng đủ ${i.secondary.length} từ khoá phụ trong nội dung.`,
      `Từ khoá phụ chưa xuất hiện: ${missing.map((k) => '"' + k + '"').join(', ')}.`,
    );
  } else {
    add('additional', 'warn', 2, '', 'Chưa có từ khoá phụ - thêm 2–4 cách gọi khác mà khách hay tìm.');
  }

  // ---------- Khả năng đọc tiêu đề ----------
  if (kw) {
    const at = t.indexOf(kw);
    add('title', at >= 0 && at <= t.length / 2, 3, 'Từ khóa chính được sử dụng ở đầu tiêu đề SEO.', 'Đưa từ khoá chính về gần đầu tiêu đề SEO.');
  }
  add('title', /\d/.test(i.title), 2, 'Bạn đang sử dụng một số trong tiêu đề SEO của mình.', 'Thêm một con số vào tiêu đề SEO (vd. "5 mẹo…", "20cm") để tăng tỉ lệ nhấp.');

  // ---------- Khả năng đọc nội dung ----------
  if (i.hasToc !== null) {
    add('content', i.hasToc, 2, 'Bài có mục lục (Table of Contents).', 'Có vẻ như bài chưa có mục lục (Table of Contents) - bài dài nên có danh sách link tới các tiêu đề phụ ở đầu bài.');
  }
  const longPara = i.paragraphs.some((p) => words(p).length > 120);
  add('content', !longPara, 3, 'Các đoạn văn đều ngắn gọn, dễ đọc.', 'Ít nhất một đoạn văn là dài. Cân nhắc sử dụng các đoạn văn ngắn (dưới 120 từ).');
  add('content', i.hasMedia, 3, 'Nội dung của bạn chứa hình ảnh và / hoặc video.', 'Thêm hình ảnh và / hoặc video vào nội dung.');

  return { total, density };
}

function finish(checks: SeoCheck[]): number {
  const max = checks.reduce((s, c) => s + c.weight, 0) || 1;
  const got = checks.reduce((s, c) => s + (c.level === 'ok' ? c.weight : c.level === 'warn' ? c.weight / 2 : 0), 0);
  const order: Record<CheckLevel, number> = { bad: 0, warn: 1, ok: 2 };
  checks.sort((a, b) => order[a.level] - order[b.level]);
  return Math.round((got / max) * 100);
}

const collector = () => {
  const checks: SeoCheck[] = [];
  const add: Add = (group, cond, weight, ok, bad) => {
    const level: CheckLevel = cond === true ? 'ok' : cond === false ? 'bad' : cond;
    checks.push({ level, weight, group, text: level === 'ok' ? ok : bad });
  };
  return { checks, add };
};

/** Liên kết trong Markdown: [chữ](url). */
function mdLinks(md: string): { internal: number; external: number } {
  // Bỏ cú pháp ảnh trước (ảnh có link [![alt](ảnh)](link) vẫn còn phần link).
  const urls = [...md.replace(/!\[[^\]]*\]\([^)]*\)/g, '').matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
  return {
    internal: urls.filter((u) => u.startsWith('/') && !u.startsWith('//')).length,
    external: urls.filter((u) => /^https?:\/\//i.test(u)).length,
  };
}

/** Các đoạn văn của nội dung Markdown (bỏ tiêu đề, ảnh, danh sách). */
const mdParagraphs = (md: string) =>
  md
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b && !/^(#{1,6}\s|!\[|[-*]\s|\d+\.\s|>)/.test(b))
    .map(markdownToText);

// ================= Bài viết =================

export interface NewsSeoExtra {
  /** Từ khoá chính của các bài / sản phẩm khác (để kiểm tra trùng). */
  otherKeywords?: string[];
}

/** Chấm điểm SEO bài viết theo các tiêu chí của Rank Math. */
export function analyzeSeo(input: SeoSource, slugFallback: string, extra: NewsSeoExtra = {}): SeoReport {
  // Bài HTML: đổi sang dạng Markdown giản lược để các tiêu chí (H2/H3, alt ảnh, link) chấm như nhau.
  const md = input.format === 'html' ? contentAsMarkdown(input) : input.content;
  const raw = input.content;
  const { title, description } = effectiveSeo(input);
  const slug = input.seo.slug || slugFallback;
  const kw = norm(input.seo.focusKeyword);
  const links = mdLinks(md);
  // DoFollow: link ngoài không có rel="nofollow" (Markdown luôn là DoFollow).
  const nofollow = input.format === 'html' ? [...raw.matchAll(/<a\b[^>]*href=["']https?:[^>]*>/gi)].filter((m) => /nofollow/i.test(m[0])).length : 0;
  const alts = [...md.matchAll(/!\[([^\]]*)\]/g)].map((m) => m[1]);
  if (input.cover) alts.push(input.coverAlt || input.title);
  const hasToc = input.format === 'html' ? /href=["']#[^"']+["']/i.test(raw) : /\]\(#[^)]+\)/.test(md);
  const { checks, add } = collector();
  const { total, density } = rankChecks(
    {
      kw,
      secondary: splitKw(input.seo.secondaryKeywords, kw),
      title,
      description,
      slug,
      text: markdownToText(md),
      paragraphs: mdParagraphs(md),
      subheads: (md.match(/^#{2,3}\s+.*$/gm) ?? []).map((h) => h.replace(/^#+\s+/, '')),
      alts,
      internalLinks: links.internal,
      externalLinks: links.external,
      dofollowLinks: Math.max(0, links.external - nofollow),
      hasMedia: !!input.cover || /!\[|<video|<iframe/i.test(md + raw),
      hasToc,
      minWords: input.seo.pillar ? 2500 : SEO_LIMITS.minWords,
      usedBefore: extra.otherKeywords ? !!kw && extra.otherKeywords.some((k) => norm(k) === kw) : undefined,
      noun: 'bài',
    },
    add,
  );
  // Ngoài Rank Math: độ dài tiêu đề / mô tả, cho phép lập chỉ mục.
  add(
    'title',
    (title.length >= 30 && title.length <= SEO_LIMITS.title) || 'warn',
    3,
    `Tiêu đề SEO dài ${title.length} ký tự - vừa đẹp.`,
    title.length > SEO_LIMITS.title ? `Tiêu đề SEO dài ${title.length} ký tự - Google sẽ cắt bớt (nên ≤ ${SEO_LIMITS.title}).` : `Tiêu đề SEO hơi ngắn (${title.length} ký tự) - nên 30–${SEO_LIMITS.title}.`,
  );
  add(
    'additional',
    !input.seo.description ? 'warn' : description.length >= SEO_LIMITS.descriptionMin && description.length <= SEO_LIMITS.description ? true : 'warn',
    3,
    `Mô tả meta dài ${description.length} ký tự - vừa đẹp.`,
    !input.seo.description ? 'Chưa viết mô tả meta riêng - đang tự lấy từ tóm tắt.' : `Mô tả meta dài ${description.length} ký tự - nên ${SEO_LIMITS.descriptionMin}–${SEO_LIMITS.description}.`,
  );
  if (input.seo.noindex) add('basic', false, 5, '', 'Bài đang đặt noindex - Google sẽ không hiển thị bài này.');
  return { score: finish(checks), checks, title, description, slug, words: total, density };
}

// ================= SEO sản phẩm =================

export interface ProductSeoSource {
  name: string;
  description: string;
  images: string[];
  tags: string[];
  slug: string;
  seo: ProductSeo;
  /** Alt / link của từng ảnh. */
  imageMeta?: Record<string, { alt?: string; link?: string }>;
  /** Từ khoá chính của sản phẩm / bài khác (để kiểm tra trùng). */
  otherKeywords?: string[];
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
  const raw = src.description ?? '';
  const urls = [...raw.matchAll(/\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g)].map((m) => m[1]);
  const external = urls.filter((u) => /^https?:/i.test(u)).length;
  const links = Object.values(src.imageMeta ?? {}).map((m) => m.link ?? '');
  const alts = src.images.map((img, i) => src.imageMeta?.[img]?.alt?.trim() || (i ? `${src.name} - ảnh ${i + 1}` : src.name));
  const { checks, add } = collector();
  const { total, density } = rankChecks(
    {
      kw,
      secondary: splitKw(src.seo.secondaryKeywords, kw),
      title,
      description,
      slug,
      text: richToText(raw),
      paragraphs: richToText(raw).split(/\n\s*\n/),
      subheads: null,
      alts,
      internalLinks: urls.filter((u) => u.startsWith('/')).length + links.filter((l) => l.startsWith('/')).length,
      externalLinks: external + links.filter((l) => /^https?:/i.test(l)).length,
      dofollowLinks: external + links.filter((l) => /^https?:/i.test(l)).length,
      hasMedia: src.images.length > 0,
      hasToc: null,
      minWords: src.seo.pillar ? 600 : PRODUCT_MIN_WORDS,
      usedBefore: src.otherKeywords ? !!kw && src.otherKeywords.some((k) => norm(k) === kw) : undefined,
      noun: 'sản phẩm',
    },
    add,
  );
  // Riêng cho sản phẩm.
  add(
    'title',
    (title.length >= 30 && title.length <= SEO_LIMITS.title) || 'warn',
    3,
    `Tiêu đề SEO dài ${title.length} ký tự - vừa đẹp.`,
    title.length > SEO_LIMITS.title ? `Tiêu đề SEO dài ${title.length} ký tự - Google sẽ cắt bớt (nên ≤ ${SEO_LIMITS.title}).` : `Tiêu đề SEO hơi ngắn (${title.length} ký tự) - nên 30–${SEO_LIMITS.title}, vd: thêm kích cỡ / loại hàng.`,
  );
  add(
    'additional',
    !src.seo.description ? 'warn' : description.length >= SEO_LIMITS.descriptionMin && description.length <= SEO_LIMITS.description ? true : 'warn',
    3,
    `Mô tả meta dài ${description.length} ký tự - vừa đẹp.`,
    !src.seo.description ? 'Chưa viết mô tả meta riêng - đang tự lấy đầu mô tả sản phẩm.' : `Mô tả meta dài ${description.length} ký tự - nên ${SEO_LIMITS.descriptionMin}–${SEO_LIMITS.description}.`,
  );
  const imgs = src.images.length;
  add('content', imgs >= 3 ? true : imgs ? 'warn' : false, 3, `Có ${imgs} ảnh sản phẩm (nhiều góc chụp).`, `Mới có ${imgs} ảnh - nên có từ 3 ảnh trở lên (nhiều góc chụp).`);
  add('additional', src.seo.productSchema, 4, 'Đã khai báo schema Product (giá, tình trạng hàng).', 'Bật khai báo schema Product để Google hiện giá & tình trạng hàng.');
  if (src.seo.noindex) add('basic', false, 5, '', 'Sản phẩm đang đặt noindex - Google sẽ không hiển thị.');
  return { score: finish(checks), checks, title, description, slug, words: total, density };
}

// ================= SEO trang (Admin → Khai báo) =================

/** Chấm điểm SEO một trang tĩnh (Trang chủ, Sản phẩm, Liên hệ...). Trang không có nội dung tự viết → chỉ chấm tiêu đề / mô tả. */
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
  const { checks, add } = collector();
  if (!kw) add('basic', false, 25, '', 'Chưa đặt từ khoá chính cho trang này.');
  else {
    const t = norm(title);
    add('basic', t.includes(kw), 10, 'Tuyệt vời! Bạn đang sử dụng từ khoá chính trong Tiêu đề SEO.', 'Thêm từ khoá chính vào Tiêu đề SEO.');
    add('basic', norm(description).includes(kw), 8, 'Đã sử dụng từ khoá chính trong Mô tả Meta SEO.', 'Thêm từ khoá chính vào Mô tả Meta SEO.');
    add('title', t.indexOf(kw) >= 0 && t.indexOf(kw) <= t.length / 2, 4, 'Từ khóa chính được sử dụng ở đầu tiêu đề SEO.', 'Đưa từ khoá chính về gần đầu tiêu đề SEO.');
  }
  add(
    'title',
    !src.title ? 'warn' : title.length >= 30 && title.length <= SEO_LIMITS.title ? true : 'warn',
    8,
    `Tiêu đề SEO dài ${title.length} ký tự - vừa đẹp.`,
    !src.title
      ? 'Chưa viết tiêu đề SEO riêng - đang dùng "<tên trang> - <tên shop>".'
      : title.length > SEO_LIMITS.title
        ? `Tiêu đề dài ${title.length} ký tự - Google sẽ cắt bớt (nên ≤ ${SEO_LIMITS.title}).`
        : `Tiêu đề hơi ngắn (${title.length} ký tự) - nên 30–${SEO_LIMITS.title}.`,
  );
  add(
    'basic',
    !description ? false : description.length >= SEO_LIMITS.descriptionMin && description.length <= SEO_LIMITS.description ? true : 'warn',
    10,
    `Mô tả meta dài ${description.length} ký tự - vừa đẹp.`,
    !description ? 'Chưa có mô tả meta - Google sẽ tự lấy một đoạn bất kỳ trên trang.' : `Mô tả meta dài ${description.length} ký tự - nên ${SEO_LIMITS.descriptionMin}–${SEO_LIMITS.description}.`,
  );
  const img = src.ogImage || src.defaultOgImage;
  add('additional', !!src.ogImage || (img ? 'warn' : false), 5, 'Có ảnh chia sẻ riêng cho trang.', img ? 'Đang dùng ảnh chia sẻ mặc định của web - nên có ảnh riêng.' : 'Chưa có ảnh chia sẻ (Facebook / Zalo).');
  add('basic', !src.noindex, 10, 'Trang được phép lập chỉ mục (index).', 'Trang đang đặt noindex - Google sẽ không hiển thị trang này.');
  const secondary = splitKw(src.secondaryKeywords, kw);
  if (secondary.length) {
    const missing = secondary.filter((k) => !norm(`${title} ${description}`).includes(k));
    add('additional', !missing.length ? true : missing.length < secondary.length ? 'warn' : false, 4, `Đã dùng đủ ${secondary.length} từ khoá phụ.`, `Từ khoá phụ chưa có trong tiêu đề / mô tả: ${missing.map((k) => '"' + k + '"').join(', ')}.`);
  } else add('additional', 'warn', 2, '', 'Chưa có từ khoá phụ cho trang này.');
  add('title', /\d/.test(title), 1, 'Bạn đang sử dụng một số trong tiêu đề SEO của mình.', 'Có thể thêm một con số vào tiêu đề SEO để tăng tỉ lệ nhấp.');
  return { score: finish(checks), checks, title, description, slug: src.path, words: 0, density: 0 };
}

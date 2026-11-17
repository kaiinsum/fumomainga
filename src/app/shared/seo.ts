import { NewsSeo } from '../models/news';

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

export interface SeoSource {
  title: string;
  excerpt: string;
  content: string;
  cover: string;
  seo: NewsSeo;
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
  const description = (src.seo.description || src.excerpt || markdownToText(src.content)).trim();
  return {
    title: (src.seo.title || src.title).trim(),
    description: description.length > SEO_LIMITS.description ? description.slice(0, SEO_LIMITS.description - 1) + '…' : description,
  };
}

/** Chấm điểm SEO theo các tiêu chí tương tự Rank Math. */
export function analyzeSeo(src: SeoSource, slugFallback: string): SeoReport {
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
    add(false, 30, '', 'Chưa đặt từ khoá chính — hãy nhập từ khoá bạn muốn bài lên Google.');
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
      `Mật độ từ khoá ${density.toFixed(1)}% — hợp lý.`,
      density > 2.5
        ? `Mật độ từ khoá ${density.toFixed(1)}% — quá dày, nên giảm (1–2.5%).`
        : `Mật độ từ khoá ${density.toFixed(1)}% (${occurrences} lần) — nên đạt 1–2.5%.`,
    );
  }

  // --- Tiêu đề, mô tả, URL ---
  add(
    (title.length >= 30 && title.length <= SEO_LIMITS.title) || 'warn',
    5,
    `Tiêu đề SEO dài ${title.length} ký tự — vừa đẹp.`,
    title.length > SEO_LIMITS.title
      ? `Tiêu đề SEO dài ${title.length} ký tự — Google sẽ cắt bớt (nên ≤ ${SEO_LIMITS.title}).`
      : `Tiêu đề SEO hơi ngắn (${title.length} ký tự) — nên 30–${SEO_LIMITS.title}.`,
  );
  add(/\d/.test(title), 2, 'Tiêu đề có con số.', 'Thêm con số vào tiêu đề (vd: "5 mẹo…") để tăng tỉ lệ nhấp.');
  add(
    !src.seo.description ? 'warn' : description.length >= SEO_LIMITS.descriptionMin && description.length <= SEO_LIMITS.description ? true : 'warn',
    6,
    `Mô tả meta dài ${description.length} ký tự — vừa đẹp.`,
    !src.seo.description
      ? 'Chưa viết mô tả meta riêng — đang tự lấy từ tóm tắt.'
      : `Mô tả meta dài ${description.length} ký tự — nên ${SEO_LIMITS.descriptionMin}–${SEO_LIMITS.description}.`,
  );
  add(
    !!src.seo.slug && slug.length <= SEO_LIMITS.url,
    4,
    `Đường dẫn ngắn gọn (${slug.length} ký tự).`,
    src.seo.slug ? `Đường dẫn dài ${slug.length} ký tự — nên ≤ ${SEO_LIMITS.url}.` : 'Chưa đặt đường dẫn thân thiện (slug).',
  );

  // --- Nội dung ---
  add(
    total >= SEO_LIMITS.minWords ? true : total >= 300 ? 'warn' : false,
    15,
    `Nội dung dài ${total} từ — tốt.`,
    `Nội dung có ${total} từ — nên viết từ ${SEO_LIMITS.minWords} từ trở lên.`,
  );
  add(/^#{2,3}\s+/m.test(src.content), 3, 'Bài có tiêu đề phụ H2/H3.', 'Chia bài bằng tiêu đề phụ (H2/H3) để dễ đọc.');
  add(/\]\(\/(?!\/)/.test(src.content), 3, 'Có liên kết nội bộ.', 'Thêm liên kết tới trang khác trong website (vd: /san-pham).');
  add(/\]\(https?:\/\//.test(src.content), 2, 'Có liên kết ra ngoài.', 'Thêm một liên kết ra nguồn tham khảo bên ngoài.');
  add(!!src.cover || /!\[/.test(src.content), 4, 'Bài có hình ảnh.', 'Thêm ảnh đại diện hoặc ảnh trong bài.');
  add(!src.seo.noindex, 5, 'Bài được phép lập chỉ mục (index).', 'Bài đang đặt noindex — Google sẽ không hiển thị bài này.');

  const max = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.reduce((s, c) => s + (c.level === 'ok' ? c.weight : c.level === 'warn' ? c.weight / 2 : 0), 0);
  const order: Record<CheckLevel, number> = { bad: 0, warn: 1, ok: 2 };
  checks.sort((a, b) => order[a.level] - order[b.level]);
  return { score: Math.round((got / max) * 100), checks, title, description, slug, words: total, density };
}

export function scoreLevel(score: number): CheckLevel {
  return score >= 80 ? 'ok' : score >= 50 ? 'warn' : 'bad';
}

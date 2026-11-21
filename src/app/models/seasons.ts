/**
 * Chủ đề theo dịp lễ (Tết, Valentine, Trung thu...). Admin bật 1 chủ đề, "tự động theo lịch", hoặc tắt hết.
 * Chủ đề chỉ thêm hiệu ứng nền + dải màu nhỏ + lời chúc lúc mới vào web - không đổi giao diện tổng thể.
 */

export type BuiltinSeasonId =
  | 'tet' | 'valentine' | 'women' | 'aprilfool' | 'reunification' | 'summer'
  | 'school' | 'midautumn' | 'vnwomen' | 'halloween' | 'christmas';
/** Dịp có sẵn, hoặc dịp admin tự thêm (id bắt đầu bằng "c-"). */
export type SeasonId = BuiltinSeasonId | `c-${string}`;

/** Dịp lễ admin tự thêm. Ngày dạng MM-DD, lặp lại mỗi năm (sửa riêng từng năm bằng SeasonOverride.dates). */
export interface CustomSeason {
  id: `c-${string}`;
  name: string;
  icon: string;
  title: string;
  message: string;
  colors: [string, string];
  glyphs: string[];
  dir: 'fall' | 'rise' | 'float';
  start: string;
  end: string;
}

/** Hạt hiệu ứng nền: emoji, hoặc 'img:<tên>' = hình SVG vẽ sẵn bên dưới. */
export interface SeasonFx {
  glyphs: string[];
  /** fall: rơi xuống · rise: bay lên · float: trôi lơ lửng */
  dir: 'fall' | 'rise' | 'float';
  count: number;
  size: [number, number];
}

export interface SeasonDef {
  id: SeasonId;
  name: string;
  icon: string;
  /** Hình lớn trên thiệp chào (thay cho emoji). */
  art?: string;
  /** Tiêu đề + lời chúc trên thiệp chào. */
  title: string;
  message: string;
  /** Hai màu cho dải màu và thiệp chào. */
  colors: [string, string];
  fx: SeasonFx;
  /** Ghi chú ngày (hiện cho admin). */
  when: string;
}

// ---------- Hình SVG tự vẽ ----------
const svg = (s: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);

/** Cờ đỏ sao vàng. */
const FLAG_VN = svg(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"><rect width="30" height="20" fill="#da251d"/>` +
    `<polygon fill="#ffff00" points="15,4 16.76,9.43 22.47,9.43 17.85,12.79 19.62,18.21 15,14.85 10.38,18.21 12.15,12.79 7.53,9.43 13.24,9.43"/></svg>`,
);

/** Lồng đèn Trung thu (đèn tròn đỏ). */
const LANTERN = svg(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 96">` +
    `<line x1="32" y1="0" x2="32" y2="14" stroke="#7a4a12" stroke-width="2"/>` +
    `<rect x="22" y="12" width="20" height="8" rx="2" fill="#f2b631"/>` +
    `<ellipse cx="32" cy="46" rx="26" ry="28" fill="#e8332a"/>` +
    `<ellipse cx="32" cy="46" rx="16" ry="28" fill="none" stroke="#ff8a5c" stroke-width="2"/>` +
    `<ellipse cx="32" cy="46" rx="6" ry="28" fill="none" stroke="#ff8a5c" stroke-width="2"/>` +
    `<ellipse cx="32" cy="46" rx="14" ry="16" fill="#ffd36b" opacity=".45"/>` +
    `<rect x="22" y="72" width="20" height="7" rx="2" fill="#f2b631"/>` +
    `<path d="M26 79 L24 94 M32 79 L32 96 M38 79 L40 94" stroke="#f2b631" stroke-width="2.5" stroke-linecap="round"/></svg>`,
);

/** Mặt troll (ảnh admin cung cấp, nền trong suốt). */
const TROLL = '/season/troll.webp';

export const SEASON_ART: Record<string, string> = { flag: FLAG_VN, lantern: LANTERN, troll: TROLL };

export const SEASONS: SeasonDef[] = [
  {
    id: 'tet',
    name: 'Tết Nguyên Đán',
    icon: '🧧',
    title: 'Chúc mừng năm mới!',
    message: 'Fumo Mai Nga chúc bạn năm mới an khang thịnh vượng, vạn sự như ý - rước một bé fumo về nhà cho năm mới thêm may mắn nhé!',
    colors: ['#e5322d', '#ffc83d'],
    fx: { glyphs: ['🌸', '🌼', '🌸', '🧧', '🌼'], dir: 'fall', count: 26, size: [16, 30] },
    when: '10 ngày trước → mùng 7 Tết (âm lịch)',
  },
  {
    id: 'valentine',
    name: 'Valentine',
    icon: '💝',
    title: 'Happy Valentine!',
    message: 'Gửi trao yêu thương cùng những bé fumo đáng yêu - món quà ôm ấp dễ thương nhất cho người thương của bạn.',
    colors: ['#ff4d8d', '#ffb3cf'],
    fx: { glyphs: ['💖', '💕', '❤️', '💗', '🌹'], dir: 'rise', count: 24, size: [14, 28] },
    when: '10/2 → 14/2',
  },
  {
    id: 'women',
    name: 'Quốc tế Phụ nữ',
    icon: '💐',
    title: 'Mừng ngày Quốc tế Phụ nữ 8/3!',
    message: 'Chúc các chị em luôn xinh đẹp, hạnh phúc và được yêu thương - tặng nàng một bé fumo thay ngàn lời chúc nhé!',
    colors: ['#e04f9b', '#ffc4e1'],
    fx: { glyphs: ['🌷', '🌸', '💐', '🌹', '🌺'], dir: 'fall', count: 24, size: [16, 30] },
    when: '4/3 → 8/3',
  },
  {
    id: 'aprilfool',
    name: 'Cá tháng Tư',
    icon: '🐟',
    art: 'troll',
    title: 'Cá tháng Tư vui vẻ!',
    message: 'Hôm nay nói gì cũng phải nghi ngờ… trừ việc các bé fumo ở đây đáng yêu thật đấy! 😜',
    colors: ['#2fa84f', '#ffe14d'],
    fx: { glyphs: ['img:troll', '🐟', '🤡', 'img:troll', '😜'], dir: 'float', count: 18, size: [22, 40] },
    when: '1/4',
  },
  {
    id: 'reunification',
    name: 'Giải phóng miền Nam 30/4 & Quốc tế Lao động 1/5',
    icon: '⭐',
    art: 'flag',
    title: 'Mừng ngày thống nhất đất nước 30/4!',
    message: 'Chào mừng Ngày Giải phóng miền Nam, thống nhất đất nước 30/4 và Quốc tế Lao động 1/5. Chúc cả nhà kỳ nghỉ lễ thật vui!',
    colors: ['#da251d', '#ffff00'],
    fx: { glyphs: ['img:flag', '⭐', 'img:flag', '⭐'], dir: 'float', count: 20, size: [18, 34] },
    when: '26/4 → 1/5',
  },
  {
    id: 'summer',
    name: 'Nghỉ hè',
    icon: '🏖️',
    title: 'Hè rồi, xả hơi thôi!',
    message: 'Mùa hè rực rỡ đã tới - cùng các bé fumo đi biển, ăn kem và tận hưởng kỳ nghỉ thật đã nhé!',
    colors: ['#00a6e0', '#ffd23f'],
    fx: { glyphs: ['☀️', '🌊', '🍉', '🍦', '🐚', '🌴'], dir: 'float', count: 18, size: [16, 30] },
    when: '1/6 → 15/8',
  },
  {
    id: 'school',
    name: 'Tựu trường',
    icon: '🎒',
    title: 'Chào năm học mới!',
    message: 'Chúc các bạn học sinh, sinh viên một năm học mới thật nhiều niềm vui - có bé fumo nhỏ làm bạn đồng hành trên bàn học nhé!',
    colors: ['#3d7bfd', '#7ad3ff'],
    fx: { glyphs: ['📚', '✏️', '🎒', '📐', '🖍️', '📝'], dir: 'fall', count: 18, size: [16, 28] },
    when: '20/8 → 5/9',
  },
  {
    id: 'midautumn',
    name: 'Tết Trung thu',
    icon: '🏮',
    art: 'lantern',
    title: 'Trung thu vui vẻ!',
    message: 'Rước đèn, phá cỗ, ngắm trăng rằm - Fumo Mai Nga chúc bạn và gia đình một mùa Trung thu tròn đầy, ấm áp.',
    colors: ['#e8332a', '#ffc94d'],
    fx: { glyphs: ['img:lantern', '🥮', 'img:lantern', '🌕', '⭐'], dir: 'rise', count: 16, size: [22, 40] },
    when: '10 ngày trước → rằm tháng 8 (âm lịch)',
  },
  {
    id: 'vnwomen',
    name: 'Phụ nữ Việt Nam',
    icon: '🌷',
    title: 'Mừng ngày Phụ nữ Việt Nam 20/10!',
    message: 'Chúc mẹ, chị, em và các bạn nữ luôn rạng rỡ, hạnh phúc - một bé fumo xinh xắn là món quà dễ thương nhất ngày 20/10!',
    colors: ['#e04f9b', '#ffc4e1'],
    fx: { glyphs: ['🌷', '🌸', '💐', '🌹', '🌺'], dir: 'fall', count: 24, size: [16, 30] },
    when: '16/10 → 20/10',
  },
  {
    id: 'halloween',
    name: 'Halloween',
    icon: '🎃',
    title: 'Happy Halloween!',
    message: 'Trick or treat? Các bé fumo đã hoá trang sẵn sàng - ghé shop kẻo bị ma bí ngô doạ nhé! 👻',
    colors: ['#ff7a00', '#7b3fe4'],
    fx: { glyphs: ['🎃', '🦇', '👻', '🕸️', '🍬'], dir: 'float', count: 18, size: [18, 32] },
    when: '25/10 → 31/10',
  },
  {
    id: 'christmas',
    name: 'Giáng sinh',
    icon: '🎄',
    title: 'Merry Christmas!',
    message: 'Giáng sinh an lành! Ông già Noel đã gói sẵn các bé fumo - chọn quà cho người thương hoặc tự thưởng cho mình nhé!',
    colors: ['#1f9d55', '#e53935'],
    fx: { glyphs: ['❄️', '❄️', '⛄', '🎁', '❄️', '🎄'], dir: 'fall', count: 30, size: [12, 26] },
    when: '15/12 → 25/12',
  },
];

// ---------- Ngày theo âm lịch (tra bảng) ----------
/** Mùng 1 Tết Nguyên Đán. */
const LUNAR_NEW_YEAR: Record<number, string> = {
  2025: '01-29', 2026: '02-17', 2027: '02-06', 2028: '01-26', 2029: '02-13', 2030: '02-03',
  2031: '01-23', 2032: '02-11', 2033: '01-31', 2034: '02-19', 2035: '02-08',
};
/** Rằm tháng 8 (Tết Trung thu). */
const MID_AUTUMN: Record<number, string> = {
  2025: '10-06', 2026: '09-25', 2027: '09-15', 2028: '10-03', 2029: '09-22', 2030: '09-12',
  2031: '10-01', 2032: '09-19', 2033: '09-08', 2034: '09-27', 2035: '09-16',
};

const DAY = 86_400_000;
const md = (year: number, s: string) => {
  const [m, d] = s.split('-').map(Number);
  return new Date(year, m - 1, d).getTime();
};

/**
 * Admin sửa một chủ đề: các trường để trống = dùng mặc định.
 * `dates`: ngày bắt đầu / kết thúc riêng cho từng năm (YYYY-MM-DD) - vì Tết, Trung thu đổi ngày mỗi năm.
 */
export interface SeasonOverride {
  name?: string;
  icon?: string;
  title?: string;
  message?: string;
  colors?: [string, string];
  /** Emoji hiệu ứng nền (thay cho mặc định). */
  glyphs?: string[];
  /** Có dùng hình đặc biệt (cờ, lồng đèn, mặt troll) trong hiệu ứng nền / thiệp không. */
  useArt?: boolean;
  dates?: Record<string, { start: string; end: string }>;
}
export type SeasonOverrides = Partial<Record<SeasonId, SeasonOverride>>;

let custom: CustomSeason[] = [];
let customDefs: SeasonDef[] = [];

/** Nạp danh sách dịp admin tự thêm (gọi mỗi khi cài đặt thay đổi). */
export function setCustomSeasons(list: CustomSeason[] | undefined): void {
  const next = (list ?? []).filter((c) => c && /^c-/.test(c.id));
  if (next === custom || JSON.stringify(next) === JSON.stringify(custom)) return;
  custom = next;
  customDefs = custom.map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon || '🎉',
    title: c.title,
    message: c.message,
    colors: c.colors?.length === 2 ? c.colors : ['#60b5ff', '#ffd23f'],
    fx: { glyphs: c.glyphs?.length ? c.glyphs : [c.icon || '🎉'], dir: c.dir || 'fall', count: 22, size: [16, 30] },
    when: `${fmtMd(c.start)} → ${fmtMd(c.end)} (hằng năm) · dịp tự thêm`,
  }));
}

const fmtMd = (s: string) => {
  const [m, d] = (s || '').split('-').map(Number);
  return m && d ? `${d}/${m}` : '?';
};

/** Mọi dịp: có sẵn + admin tự thêm. */
export const allSeasons = (): SeasonDef[] => [...SEASONS, ...customDefs];
export const isCustomSeason = (id: string) => id.startsWith('c-');

const DEFAULTS = new Map(SEASONS.map((s) => [s.id, s]));

/** Chủ đề sau khi áp các chỉnh sửa của admin. */
export function resolveSeason(def: SeasonDef, ov?: SeasonOverrides): SeasonDef {
  const o = ov?.[def.id];
  if (!o) return def;
  const base = DEFAULTS.get(def.id as BuiltinSeasonId) ?? def;
  const artGlyphs = base.fx.glyphs.filter((g) => g.startsWith('img:'));
  const useArt = o.useArt ?? true;
  const emojis = o.glyphs?.length ? o.glyphs : base.fx.glyphs.filter((g) => !g.startsWith('img:'));
  const glyphs = [...emojis, ...(useArt ? artGlyphs : [])];
  return {
    ...base,
    name: o.name?.trim() || base.name,
    icon: o.icon?.trim() || base.icon,
    title: o.title?.trim() || base.title,
    message: o.message?.trim() || base.message,
    colors: o.colors?.length === 2 ? o.colors : base.colors,
    art: useArt ? base.art : undefined,
    fx: { ...base.fx, glyphs: glyphs.length ? glyphs : base.fx.glyphs },
  };
}

/** Tách chuỗi emoji người dùng nhập thành từng emoji (giữ đúng emoji ghép nhiều ký tự). */
export function splitGlyphs(text: string): string[] {
  const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('vi', { granularity: 'grapheme' }) : null;
  const parts = seg ? [...seg.segment(text)].map((x) => x.segment) : [...text];
  return parts.filter((g) => g.trim() && !/^[\s,;.]+$/.test(g)).slice(0, 12);
}

const parseDay = (s: string | undefined): number => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : NaN;
};

/** Khoảng ngày diễn ra của chủ đề trong năm `year` (00:00 ngày đầu → 23:59 ngày cuối) + ngày chính. */
export function seasonRange(id: SeasonId, year: number, ov?: SeasonOverrides): { start: number; end: number; main: number } {
  const custom = ov?.[id]?.dates?.[String(year)];
  if (custom) {
    const a = parseDay(custom.start);
    const b = parseDay(custom.end);
    if (!isNaN(a) && !isNaN(b) && b >= a) return { start: a, end: b + DAY - 1, main: b };
  }
  return defaultRange(id, year);
}

function defaultRange(id: SeasonId, year: number): { start: number; end: number; main: number } {
  const fixed = (a: string, b: string, main = b) => ({ start: md(year, a), end: md(year, b) + DAY - 1, main: md(year, main) });
  if (isCustomSeason(id)) {
    const c = custom.find((x) => x.id === id);
    const ok = (s?: string) => /^\d{2}-\d{2}$/.test(s ?? '');
    if (!c || !ok(c.start) || !ok(c.end)) return fixed('01-01', '01-01');
    // Kết thúc trước ngày bắt đầu (vd. 28/12 → 03/01) → kết thúc ở năm sau.
    const r = fixed(c.start, c.end);
    if (r.end < r.start) return { start: r.start, end: md(year + 1, c.end) + DAY - 1, main: md(year + 1, c.end) };
    return r;
  }
  switch (id as BuiltinSeasonId) {
    case 'tet': {
      const t = md(year, LUNAR_NEW_YEAR[year] ?? '02-01');
      return { start: t - 10 * DAY, end: t + 7 * DAY - 1, main: t };
    }
    case 'midautumn': {
      const t = md(year, MID_AUTUMN[year] ?? '09-20');
      return { start: t - 10 * DAY, end: t + DAY - 1, main: t };
    }
    case 'valentine': return fixed('02-10', '02-14');
    case 'women': return fixed('03-04', '03-08');
    case 'aprilfool': return fixed('04-01', '04-01');
    case 'reunification': return fixed('04-26', '05-01', '04-30');
    case 'summer': return fixed('06-01', '08-15', '06-01');
    case 'school': return fixed('08-20', '09-05', '09-05');
    case 'vnwomen': return fixed('10-16', '10-20');
    case 'halloween': return fixed('10-25', '10-31');
    case 'christmas': return fixed('12-15', '12-25');
  }
}

export const seasonById = (id: string | undefined, ov?: SeasonOverrides): SeasonDef | undefined => {
  const d = allSeasons().find((s) => s.id === id);
  return d && resolveSeason(d, ov);
};

/** Chủ đề đang diễn ra hôm nay theo lịch (trùng nhau thì lấy dịp ngắn hơn - ví dụ Valentine trong dịp Tết). */
export function seasonByDate(now = Date.now(), ov?: SeasonOverrides): SeasonDef | undefined {
  const y = new Date(now).getFullYear();
  const hit = allSeasons().map((s) => ({ s, r: seasonRange(s.id, y, ov) }))
    .filter(({ r }) => now >= r.start && now <= r.end)
    .sort((a, b) => a.r.end - a.r.start - (b.r.end - b.r.start))[0]?.s;
  return hit && resolveSeason(hit, ov);
}

/**
 * Chủ đề khách đang thấy. `setting`: '' = tắt · 'auto' = tự động theo lịch · id = admin bật tay.
 */
export function activeSeason(setting: string | undefined, now = Date.now(), ov?: SeasonOverrides): SeasonDef | undefined {
  if (!setting) return undefined;
  return setting === 'auto' ? seasonByDate(now, ov) : seasonById(setting, ov);
}

/** Danh sách các dịp trong năm (đã áp chỉnh sửa của admin), xếp theo ngày bắt đầu. */
export function seasonsOfYear(year: number, ov?: SeasonOverrides): { def: SeasonDef; start: number; end: number; main: number }[] {
  return allSeasons().map((d) => ({ def: resolveSeason(d, ov), ...seasonRange(d.id, year, ov) })).sort((a, b) => a.start - b.start);
}

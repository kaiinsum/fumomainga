import { richToText } from '../shared/rich-text';
import { Product, productPath } from './product';
import { GameSetting, resolveGames } from './minigames';

/** Một thông báo cho khách: sản phẩm mới hoặc minigame mới ra mắt. */
export interface CustomerNotice {
  /** Khoá ổn định để nhớ "đã xem" (đổi ngày ra mắt → coi như thông báo mới). */
  key: string;
  kind: 'product' | 'game' | 'season' | 'system';
  title: string;
  content: string;
  /** Ngày ra mắt (00:00 giờ máy khách). */
  date: number;
  link: string;
  image?: string;
}

const DAY = 86_400_000;

/** 'YYYY-MM-DD' → mốc thời gian (giờ địa phương); sai định dạng → NaN. */
export function parseDay(s: string | undefined): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s?.trim() ?? '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : NaN;
}

/** Mốc thời gian → 'YYYY-MM-DD' (cho ô chọn ngày). */
export function toDay(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function clip(s: string, n = 140): string {
  const t = s.replace(/[#*_>`]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
}

/**
 * Sản phẩm / minigame ra mắt trong `days` ngày gần đây (tính cả hôm nay), mới nhất trước.
 * Ngày ra mắt ở tương lai thì chưa hiện (tới ngày mới thông báo).
 */
export function buildNotices(products: Product[], games: GameSetting[] | undefined, days: number, now = Date.now()): CustomerNotice[] {
  const today = startOfDay(now);
  const from = today - Math.max(0, Math.round(days) - 1) * DAY;
  const inRange = (t: number) => !isNaN(t) && t >= from && t <= today;
  const out: CustomerNotice[] = [];

  for (const p of products) {
    const date = p.releasedAt ? parseDay(p.releasedAt) : startOfDay(p.createdAt);
    if (!inRange(date)) continue;
    out.push({
      key: `p:${p.id}:${toDay(date)}`,
      kind: 'product',
      title: p.name,
      content: clip(p.notice?.trim() || richToText(p.description)),
      date,
      link: productPath(p),
      image: p.images[0],
    });
  }
  for (const g of resolveGames(games)) {
    if (g.status !== 'open') continue;
    const date = parseDay(g.releasedAt);
    if (!inRange(date)) continue;
    out.push({ key: `g:${g.id}:${g.releasedAt}`, kind: 'game', title: g.title, content: clip(g.notice), date, link: g.path });
  }
  return out.sort((a, b) => b.date - a.date || a.title.localeCompare(b.title, 'vi'));
}

/**
 * Thống kê truy cập: lượt xem trang, khách đang online, IP truy cập gần nhất.
 * Supabase: bảng page_views + visitors_online (supabase/schema.sql). Chạy thử ở máy: lưu trong bộ nhớ.
 */

export interface PageView {
  at: number;
  vid: string;
  sid: string;
  path: string;
  ip: string;
  ua: string;
  ref: string;
}

export interface OnlineVisitor {
  vid: string;
  lastSeen: number;
  path: string;
  ip: string;
  ua: string;
}

export type TimeUnit = 'minute' | 'hour' | 'day' | 'month';

export interface SeriesPoint {
  t: number;
  views: number;
  visitors: number;
}

export interface AnalyticsStore {
  view(v: Omit<PageView, 'at'>): Promise<void>;
  ping(p: Omit<OnlineVisitor, 'lastSeen'>): Promise<void>;
  online(since: number): Promise<OnlineVisitor[]>;
  series(from: number, unit: TimeUnit): Promise<SeriesPoint[]>;
  totals(from: number | null): Promise<{ views: number; visitors: number }>;
  top(from: number | null, limit: number): Promise<{ path: string; views: number; visitors: number }[]>;
  latest(limit: number): Promise<PageView[]>;
  /** Dọn khách online cũ (không cần giữ lâu). */
  cleanup(before: number): Promise<void>;
}

/** Giờ Việt Nam = UTC+7, không đổi giờ theo mùa. */
const VN = 7 * 3600_000;
const UNIT_MS: Record<Exclude<TimeUnit, 'month'>, number> = { minute: 60_000, hour: 3600_000, day: 86_400_000 };

/** Đầu phút / giờ / ngày / tháng (giờ Việt Nam) chứa mốc t — giống date_trunc(..., 'Asia/Ho_Chi_Minh'). */
export function truncVN(t: number, unit: TimeUnit): number {
  if (unit === 'month') {
    const d = new Date(t + VN);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - VN;
  }
  const ms = UNIT_MS[unit];
  return Math.floor((t + VN) / ms) * ms - VN;
}

/** Kho trong bộ nhớ — chỉ dùng khi chạy thử ở máy. */
export function memoryAnalytics(): AnalyticsStore {
  const views: PageView[] = [];
  const online = new Map<string, OnlineVisitor>();
  const since = (from: number | null) => views.filter((v) => from === null || v.at >= from);
  return {
    async view(v) {
      views.push({ ...v, at: Date.now() });
    },
    async ping(p) {
      online.set(p.vid, { ...p, lastSeen: Date.now() });
    },
    async online(from) {
      return [...online.values()].filter((o) => o.lastSeen >= from).sort((a, b) => b.lastSeen - a.lastSeen);
    },
    async series(from, unit) {
      const map = new Map<number, { views: number; vids: Set<string> }>();
      for (const v of since(from)) {
        const t = truncVN(v.at, unit);
        const b = map.get(t) ?? { views: 0, vids: new Set<string>() };
        b.views++;
        b.vids.add(v.vid);
        map.set(t, b);
      }
      return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([t, b]) => ({ t, views: b.views, visitors: b.vids.size }));
    },
    async totals(from) {
      const list = since(from);
      return { views: list.length, visitors: new Set(list.map((v) => v.vid)).size };
    },
    async top(from, limit) {
      const map = new Map<string, { views: number; vids: Set<string> }>();
      for (const v of since(from)) {
        const b = map.get(v.path) ?? { views: 0, vids: new Set<string>() };
        b.views++;
        b.vids.add(v.vid);
        map.set(v.path, b);
      }
      return [...map.entries()]
        .map(([path, b]) => ({ path, views: b.views, visitors: b.vids.size }))
        .sort((a, b) => b.views - a.views)
        .slice(0, limit);
    },
    async latest(limit) {
      return [...views].sort((a, b) => b.at - a.at).slice(0, limit);
    },
    async cleanup(before) {
      for (const [k, o] of online) if (o.lastSeen < before) online.delete(k);
    },
  };
}

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
  /** Lượt vào web theo nguồn (ref thô của lượt xem đầu tiên mỗi lần mở web). `partial` = chỉ tính trên một phần dữ liệu. */
  sources(from: number | null, limit: number): Promise<{ rows: { ref: string; entries: number; visitors: number }[]; partial: boolean }>;
  /** Dọn khách online cũ (không cần giữ lâu). */
  cleanup(before: number): Promise<void>;
  /** Dung lượng đang dùng (để cảnh báo trước khi đầy bộ nhớ). */
  storage(): Promise<StorageInfo>;
  /** Xoá lượt xem cũ hơn mốc thời gian → số dòng đã xoá. */
  purge(before: number): Promise<number>;
  /** Cộng lượt chơi / số giây chơi minigame của 1 khách trong 1 ngày (YYYY-MM-DD giờ VN). */
  game(day: string, game: string, vid: string, plays: number, seconds: number): Promise<void>;
  /** Thống kê từng minigame từ ngày `fromDay` (null = mọi lúc). */
  games(fromDay: string | null): Promise<GameStat[]>;
  /** Lượt xem các trang bắt đầu bằng `prefix` (vd. '/san-pham/'). */
  pages(from: number | null, prefix: string, limit: number): Promise<{ path: string; views: number; visitors: number }[]>;
}

export interface GameStat {
  /** Đường dẫn game sau /mini-game/ (vd. 'fumo-ninja'). */
  game: string;
  players: number;
  plays: number;
  seconds: number;
}

export interface StorageInfo {
  /** Số lượt xem đang lưu. */
  rows: number;
  /** Dung lượng bảng lượt xem (byte). */
  viewsBytes: number;
  /** Dung lượng toàn bộ cơ sở dữ liệu (byte). */
  dbBytes: number;
  /** Lượt xem cũ nhất (mốc thời gian) hoặc null. */
  oldest: number | null;
}

/** Giờ Việt Nam = UTC+7, không đổi giờ theo mùa. */
const VN = 7 * 3600_000;
const UNIT_MS: Record<Exclude<TimeUnit, 'month'>, number> = { minute: 60_000, hour: 3600_000, day: 86_400_000 };

/** Đầu phút / giờ / ngày / tháng (giờ Việt Nam) chứa mốc t - giống date_trunc(..., 'Asia/Ho_Chi_Minh'). */
export function truncVN(t: number, unit: TimeUnit): number {
  if (unit === 'month') {
    const d = new Date(t + VN);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - VN;
  }
  const ms = UNIT_MS[unit];
  return Math.floor((t + VN) / ms) * ms - VN;
}

/** Kho trong bộ nhớ - chỉ dùng khi chạy thử ở máy. */
export function memoryAnalytics(): AnalyticsStore {
  const views: PageView[] = [];
  const online = new Map<string, OnlineVisitor>();
  const gameRows = new Map<string, { day: string; game: string; vid: string; plays: number; seconds: number }>();
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
    async sources(from, limit) {
      const map = new Map<string, { entries: number; vids: Set<string> }>();
      for (const v of since(from)) {
        if (!v.ref) continue;
        const b = map.get(v.ref) ?? { entries: 0, vids: new Set<string>() };
        b.entries++;
        b.vids.add(v.vid);
        map.set(v.ref, b);
      }
      const rows = [...map.entries()].map(([ref, b]) => ({ ref, entries: b.entries, visitors: b.vids.size })).sort((a, b) => b.entries - a.entries).slice(0, limit);
      return { rows, partial: false };
    },
    async game(day, game, vid, plays, seconds) {
      const k = `${day}|${game}|${vid}`;
      const r = gameRows.get(k) ?? { day, game, vid, plays: 0, seconds: 0 };
      r.plays += plays;
      r.seconds += seconds;
      gameRows.set(k, r);
    },
    async games(fromDay) {
      const map = new Map<string, { vids: Set<string>; plays: number; seconds: number }>();
      for (const r of gameRows.values()) {
        if (fromDay && r.day < fromDay) continue;
        const b = map.get(r.game) ?? { vids: new Set<string>(), plays: 0, seconds: 0 };
        b.vids.add(r.vid);
        b.plays += r.plays;
        b.seconds += r.seconds;
        map.set(r.game, b);
      }
      return [...map.entries()].map(([game, b]) => ({ game, players: b.vids.size, plays: b.plays, seconds: b.seconds })).sort((a, b) => b.seconds - a.seconds);
    },
    async pages(from, prefix, limit) {
      const map = new Map<string, { views: number; vids: Set<string> }>();
      for (const v of since(from)) {
        if (!v.path.startsWith(prefix)) continue;
        const b = map.get(v.path) ?? { views: 0, vids: new Set<string>() };
        b.views++;
        b.vids.add(v.vid);
        map.set(v.path, b);
      }
      return [...map.entries()].map(([path, b]) => ({ path, views: b.views, visitors: b.vids.size })).sort((a, b) => b.views - a.views).slice(0, limit);
    },
    async cleanup(before) {
      for (const [k, o] of online) if (o.lastSeen < before) online.delete(k);
    },
    async storage() {
      const bytes = JSON.stringify(views).length;
      return { rows: views.length, viewsBytes: bytes, dbBytes: bytes + 8_000_000, oldest: views.length ? Math.min(...views.map((v) => v.at)) : null };
    },
    async purge(before) {
      const keep = views.filter((v) => v.at >= before);
      const removed = views.length - keep.length;
      views.splice(0, views.length, ...keep);
      return removed;
    },
  };
}

// ---------- Dọn dữ liệu không dùng (khi bộ nhớ gần đầy) ----------

export type CleanupPart = 'views' | 'online' | 'rateLimits' | 'salts' | 'images';
export const CLEANUP_PARTS: CleanupPart[] = ['views', 'online', 'rateLimits', 'salts', 'images'];

export interface CleanupCounts {
  /** Lượt truy cập cũ hơn mốc đã chọn. */
  views: number;
  /** Khách "online" đã rời đi hơn 1 ngày. */
  online: number;
  /** Bộ đếm chống spam đã hết hạn. */
  rateLimits: number;
  /** Muối tạo code minigame của các ngày đã qua. */
  salts: number;
  /** Ảnh trong kho không còn sản phẩm / bài viết nào dùng (đã tải lên hơn 1 ngày). */
  images: number;
  imageBytes: number;
}

export interface CleanupOptions {
  /** Xoá lượt truy cập trước mốc này. */
  viewsBefore: number;
  /** Đường dẫn ảnh (img/xxx.jpg) đang được dữ liệu web dùng - không bao giờ xoá. */
  referenced: Set<string>;
}

export interface Maintenance {
  /** Đếm (không xoá) để admin xem trước. */
  scan(o: CleanupOptions): Promise<CleanupCounts>;
  /** Xoá các phần đã chọn → số lượng đã xoá. */
  run(o: CleanupOptions & { parts: CleanupPart[] }): Promise<CleanupCounts>;
}

export const emptyCounts = (): CleanupCounts => ({ views: 0, online: 0, rateLimits: 0, salts: 0, images: 0, imageBytes: 0 });

/** Bản chạy thử ở máy: chỉ có lượt truy cập trong bộ nhớ. */
export function memoryMaintenance(an: AnalyticsStore): Maintenance {
  return {
    async scan(o) {
      const all = await an.latest(Number.MAX_SAFE_INTEGER);
      return { ...emptyCounts(), views: all.filter((v) => v.at < o.viewsBefore).length };
    },
    async run(o) {
      return { ...emptyCounts(), views: o.parts.includes('views') ? await an.purge(o.viewsBefore) : 0 };
    },
  };
}

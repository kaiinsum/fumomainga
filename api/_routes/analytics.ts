/**
 * /api/analytics
 * POST: công khai — trình duyệt khách báo mở trang (view) / vẫn đang xem (ping). Không bao giờ báo lỗi cho khách.
 * GET: chỉ admin — số liệu cho trang "Thống kê".
 *   (Gộp chung file để không vượt giới hạn 12 function của gói Vercel miễn phí.)
 * ?range=hour (60 phút, mỗi 1 phút) | day (24 giờ, mỗi giờ) | month (30 ngày, mỗi ngày) | all (toàn bộ, mỗi tháng)
 */
import { CLEANUP_PARTS, CleanupPart, TimeUnit, truncVN } from '../_lib/analytics';
import { HttpError, clientIp, getStore, handle, json, requireAdmin } from '../_lib/orders';
import { sourceLabel, summarizeSources } from '../_lib/traffic-source';

/** Còn "đang truy cập" nếu trình duyệt báo về trong 75 giây qua (ping ~30 giây/lần). */
const ONLINE_MS = 75_000;

const RANGES: Record<string, { span: number | null; unit: TimeUnit }> = {
  hour: { span: 60 * 60_000, unit: 'minute' },
  day: { span: 24 * 3600_000, unit: 'hour' },
  month: { span: 30 * 86_400_000, unit: 'day' },
  all: { span: null, unit: 'month' },
};

/** Giới hạn dung lượng cơ sở dữ liệu (MB). Gói miễn phí Supabase: 500MB. Đổi bằng biến môi trường DB_LIMIT_MB. */
const DB_LIMIT_MB = Number(process.env['DB_LIMIT_MB']) || 500;

const tableMissing = (e: unknown) =>
  /page_views|visitors_online|analytics_|does not exist|schema cache/i.test(e instanceof Error ? e.message : String(e));

async function storageInfo() {
  const store = getStore().analytics;
  if (!store) throw new HttpError(501, 'Thống kê chỉ có khi dùng Supabase.');
  try {
    const s = await store.storage();
    const limitBytes = DB_LIMIT_MB * 1024 * 1024;
    const pct = Math.round((s.dbBytes / limitBytes) * 1000) / 10;
    return { ...s, limitBytes, pct, level: pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : 'ok' };
  } catch (e) {
    if (tableMissing(e)) throw new HttpError(503, 'Chưa có hàm analytics_storage trên Supabase — hãy chạy lại file supabase/schema.sql trong SQL Editor.');
    throw e;
  }
}

/** Ảnh đang được dữ liệu web (sản phẩm, tin tức) dùng → không bao giờ xoá. */
async function referencedImages(): Promise<Set<string>> {
  const catalog = await getStore().getJson<unknown>('site:catalog');
  const text = JSON.stringify(catalog ?? '');
  return new Set([...text.matchAll(/\/media\/(img\/[A-Za-z0-9._-]+)/g)].map((m) => m[1]));
}

function cleanupOptions(req: Request) {
  const q = new URL(req.url).searchParams;
  const days = Math.round(Number(q.get('days') ?? 90));
  if (!Number.isFinite(days) || days < 7) throw new HttpError(400, 'Chỉ xoá được lượt truy cập cũ hơn ít nhất 7 ngày.');
  const parts = (q.get('parts') ?? CLEANUP_PARTS.join(',')).split(',').filter((p): p is CleanupPart => (CLEANUP_PARTS as string[]).includes(p));
  return { days, parts, viewsBefore: Date.now() - days * 86_400_000 };
}

/**
 * Admin dọn dữ liệu:
 *  ?cleanup=1&days=N&parts=views,online,... → xoá các loại dữ liệu không dùng (cần xác nhận ở giao diện)
 *  ?days=N (cũ) → chỉ xoá lượt truy cập cũ hơn N ngày.
 */
export const DELETE = handle(async (req) => {
  await requireAdmin(req);
  if (new URL(req.url).searchParams.has('cleanup')) {
    const m = getStore().maintenance;
    if (!m) throw new HttpError(501, 'Dọn dữ liệu chỉ có khi dùng Supabase.');
    const o = cleanupOptions(req);
    if (!o.parts.length) throw new HttpError(400, 'Chưa chọn loại dữ liệu cần xoá.');
    const deleted = await m.run({ ...o, referenced: await referencedImages() });
    return json({ deleted, storage: await storageInfo().catch(() => null) });
  }
  const store = getStore().analytics;
  if (!store) throw new HttpError(501, 'Thống kê chỉ có khi dùng Supabase.');
  const days = Math.round(Number(new URL(req.url).searchParams.get('days')));
  if (!Number.isFinite(days) || days < 7) throw new HttpError(400, 'Chỉ xoá được dữ liệu cũ hơn ít nhất 7 ngày.');
  const deleted = await store.purge(Date.now() - days * 86_400_000);
  return json({ deleted, storage: await storageInfo() });
});

export const GET = handle(async (req) => {
  await requireAdmin(req);
  // ?storage=1 → chỉ trả dung lượng (nhẹ, dùng cho chuông thông báo admin).
  if (new URL(req.url).searchParams.has('storage')) return json(await storageInfo());
  // ?cleanup=1&days=N → xem trước sẽ xoá bao nhiêu (chưa xoá gì).
  if (new URL(req.url).searchParams.has('cleanup')) {
    const m = getStore().maintenance;
    if (!m) throw new HttpError(501, 'Dọn dữ liệu chỉ có khi dùng Supabase.');
    const o = cleanupOptions(req);
    return json({ days: o.days, counts: await m.scan({ ...o, referenced: await referencedImages() }) });
  }
  const store = getStore().analytics;
  if (!store) throw new HttpError(501, 'Thống kê chỉ có khi dùng Supabase.');
  // ?insights=1&days=N → phân tích minigame (người chơi, thời gian chơi) + lượt xem từng sản phẩm. N = 0: mọi lúc.
  if (new URL(req.url).searchParams.has('insights')) {
    const days = Math.max(0, Math.min(3650, Math.round(Number(new URL(req.url).searchParams.get('days')) || 0)));
    const fromMs = days ? truncVN(Date.now(), 'day') - (days - 1) * 86_400_000 : null;
    const fromDay = fromMs === null ? null : new Date(fromMs + 7 * 3600_000).toISOString().slice(0, 10);
    try {
      const [all, productViews] = await Promise.all([store.games(fromDay), store.pages(fromMs, '/san-pham/', 200)]);
      // Bài viết dùng chung bảng với minigame (khoá 'news:<slug>').
      const games = all.filter((g) => !g.game.startsWith('news:'));
      const news = all.filter((g) => g.game.startsWith('news:')).map((g) => ({ ...g, slug: g.game.slice(5) }));
      return json({ days, fromDay, games, news, productViews });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/game_stats|analytics_games|analytics_pages_prefix|does not exist|schema cache/i.test(msg)) {
        throw new HttpError(503, 'Chưa có bảng phân tích minigame trên Supabase — hãy chạy lại file supabase/schema.sql trong SQL Editor.');
      }
      throw e;
    }
  }
  const key = new URL(req.url).searchParams.get('range') ?? 'hour';
  const range = RANGES[key] ?? RANGES['hour'];
  const now = Date.now();
  const from = range.span === null ? null : now - range.span;
  // Mốc đầu tiên của biểu đồ: làm tròn xuống theo đơn vị để cột đầu tiên đủ dữ liệu.
  const seriesFrom = from === null ? 0 : truncVN(from, range.unit);
  const today = truncVN(now, 'day');

  try {
    const [online, total, todayTotals, rangeTotals, series, top, latest, storage, sourcesRaw] = await Promise.all([
      store.online(now - ONLINE_MS),
      store.totals(null),
      store.totals(today),
      store.totals(from),
      store.series(seriesFrom, range.unit),
      store.top(from, 10),
      store.latest(40),
      // Dung lượng: lỗi (chưa chạy schema mới) thì bỏ qua, không làm hỏng cả trang thống kê.
      storageInfo().catch(() => null),
      // Nguồn truy cập: lỗi thì bỏ qua, không làm hỏng cả trang thống kê.
      store.sources(from, 500).catch(() => null),
    ]);
    const siteHost = (req.headers.get('x-forwarded-host') ?? new URL(req.url).host).split(',')[0].trim().replace(/:\d+$/, '');
    const sources = sourcesRaw ? { ...summarizeSources(sourcesRaw.rows, siteHost), partial: sourcesRaw.partial } : null;
    return json({
      now,
      range: key in RANGES ? key : 'hour',
      unit: range.unit,
      from: seriesFrom,
      online: { count: online.length, list: online.slice(0, 50) },
      total,
      today: todayTotals,
      inRange: rangeTotals,
      series,
      top,
      latest: latest.map((v) => ({ ...v, source: sourceLabel(v.ref, siteHost) })),
      storage,
      sources,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/page_views|visitors_online|analytics_|does not exist|schema cache/i.test(msg)) {
      throw new HttpError(503, 'Chưa có bảng thống kê trên Supabase — hãy chạy lại file supabase/schema.sql trong SQL Editor.');
    }
    throw e;
  }
});

// ---------- Ghi lượt truy cập (trước đây là /api/track) ----------
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|uptime/i;
const empty = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
/** 1 lần báo thời gian tối đa (giây) — trình duyệt báo ~30 giây/lần. */
const MAX_TIME_SEC = 120;
/** /mini-game/<slug> → '<slug>', /tin-tuc/<slug> → 'news:<slug>', trang khác → null. */
function timedKey(path: string): string | null {
  const g = /^\/mini-game\/([a-z0-9-]{2,40})$/.exec(path);
  if (g) return g[1];
  const n = /^\/tin-tuc\/([^/]{1,80})$/.exec(path);
  return n ? 'news:' + n[1] : null;
}
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export const POST = handle(async (req) => {
  const ua = (req.headers.get('user-agent') ?? '').slice(0, 300);
  if (!ua || BOT.test(ua)) return empty();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return empty();
  }
  const vid = str(body['vid'], 64);
  const path = str(body['path'], 200) || '/';
  if (!/^[A-Za-z0-9-]{8,64}$/.test(vid) || !path.startsWith('/') || path.startsWith('/admin')) return empty();

  const store = getStore().analytics;
  if (!store) return empty();
  const rawIp = (req.headers.get('x-real-ip') || clientIp(req)).slice(0, 64);
  const ip = rawIp === 'unknown' ? '' : rawIp;
  // Trang được đo thời gian (minigame, bài viết) → khoá trong bảng game_stats.
  const key = timedKey(path);
  const day = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const logTime = (plays: number, sec: number) =>
    key ? store.game(day, key, vid, plays, sec).catch((e) => console.error('game track:', e instanceof Error ? e.message : e)) : Promise.resolve();
  // 'time': trình duyệt báo số giây khách THỰC SỰ hoạt động (đã trừ thời gian treo máy / ẩn tab).
  if (body['t'] === 'time') {
    const sec = Math.round(Number(body['sec']));
    if (key && Number.isFinite(sec) && sec > 0) await logTime(0, Math.min(MAX_TIME_SEC, sec));
    return empty();
  }
  const ping = store.ping({ vid, path, ip, ua });
  // Lượt vào trang game / bài viết = 1 lượt chơi / lượt đọc.
  if (body['t'] === 'view') await logTime(1, 0);
  try {
    if (body['t'] === 'view') {
      await Promise.all([
        ping,
        store.view({ vid, sid: str(body['sid'], 64), path, ip, ua, ref: str(body['ref'], 300) }),
      ]);
    } else {
      await ping;
    }
    // Thỉnh thoảng dọn khách online đã rời đi hơn 1 ngày.
    if (Math.random() < 0.02) await store.cleanup(Date.now() - 86_400_000);
  } catch (e) {
    console.error('track:', e instanceof Error ? e.message : e);
  }
  return empty();
});

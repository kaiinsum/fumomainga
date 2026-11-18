/**
 * /api/analytics — số liệu truy cập cho trang admin "Thống kê" (chỉ admin).
 * ?range=hour (60 phút, mỗi 1 phút) | day (24 giờ, mỗi giờ) | month (30 ngày, mỗi ngày) | all (toàn bộ, mỗi tháng)
 */
import { TimeUnit, truncVN } from './_lib/analytics';
import { HttpError, getStore, handle, json, requireAdmin } from './_lib/orders';

/** Còn "đang truy cập" nếu trình duyệt báo về trong 75 giây qua (ping ~30 giây/lần). */
const ONLINE_MS = 75_000;

const RANGES: Record<string, { span: number | null; unit: TimeUnit }> = {
  hour: { span: 60 * 60_000, unit: 'minute' },
  day: { span: 24 * 3600_000, unit: 'hour' },
  month: { span: 30 * 86_400_000, unit: 'day' },
  all: { span: null, unit: 'month' },
};

export const GET = handle(async (req) => {
  requireAdmin(req);
  const store = getStore().analytics;
  if (!store) throw new HttpError(501, 'Thống kê chỉ có khi dùng Supabase.');
  const key = new URL(req.url).searchParams.get('range') ?? 'hour';
  const range = RANGES[key] ?? RANGES['hour'];
  const now = Date.now();
  const from = range.span === null ? null : now - range.span;
  // Mốc đầu tiên của biểu đồ: làm tròn xuống theo đơn vị để cột đầu tiên đủ dữ liệu.
  const seriesFrom = from === null ? 0 : truncVN(from, range.unit);
  const today = truncVN(now, 'day');

  try {
    const [online, total, todayTotals, rangeTotals, series, top, latest] = await Promise.all([
      store.online(now - ONLINE_MS),
      store.totals(null),
      store.totals(today),
      store.totals(from),
      store.series(seriesFrom, range.unit),
      store.top(from, 10),
      store.latest(40),
    ]);
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
      latest,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/page_views|visitors_online|analytics_|does not exist|schema cache/i.test(msg)) {
      throw new HttpError(503, 'Chưa có bảng thống kê trên Supabase — hãy chạy lại file supabase/schema.sql trong SQL Editor.');
    }
    throw e;
  }
});

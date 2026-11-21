/**
 * GET /api/keepalive - giữ Supabase (gói Free) không bị tạm dừng sau 7 ngày không hoạt động.
 * Vercel Cron gọi mỗi ngày 1 lần (xem "crons" trong vercel.json). Nếu database đã quá 6 ngày không có lần ghi nào
 * (app_kv, đơn hàng, lượt xem) thì ghi 1 dòng nhỏ 'system:heartbeat' vào app_kv; còn hoạt động thì không làm gì.
 *
 * Bảo mật: Vercel tự gửi "Authorization: Bearer <CRON_SECRET>" khi có biến môi trường CRON_SECRET.
 * Admin cũng gọi được (để kiểm tra / chạy tay). Người ngoài → 401.
 */
import { timingSafeEqual } from 'node:crypto';
import { HttpError, getStore, handle, isAdmin, json } from '../_lib/orders';

export const HEARTBEAT_KEY = 'system:heartbeat';
const IDLE_MS = 6 * 86_400_000;

export interface Heartbeat {
  /** Lần cron chạy gần nhất có ghi vào database. */
  touchedAt: number | null;
  /** Lần ghi database gần nhất (của web) mà cron thấy lúc đó. */
  lastWrite: number | null;
  /** Số lần cron đã phải "đánh thức" database. */
  touches: number;
}

function fromCron(req: Request): boolean {
  const secret = process.env['CRON_SECRET'];
  if (!secret) return false;
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export const GET = handle(async (req) => {
  if (!fromCron(req) && !isAdmin(req)) throw new HttpError(401, 'Không có quyền.');
  const store = getStore();
  const prev = (await store.getJson<Heartbeat>(HEARTBEAT_KEY)) ?? { touchedAt: null, lastWrite: null, touches: 0 };
  const lastWrite = store.lastWrite ? await store.lastWrite() : null;
  const now = Date.now();
  const idle = lastWrite === null || now - lastWrite >= IDLE_MS;
  if (idle) {
    await store.setJson(HEARTBEAT_KEY, { touchedAt: now, lastWrite, touches: (prev.touches ?? 0) + 1 } satisfies Heartbeat);
  }
  return json({
    ok: true,
    touched: idle,
    lastWrite,
    idleDays: lastWrite === null ? null : Math.floor((now - lastWrite) / 86_400_000),
  });
});

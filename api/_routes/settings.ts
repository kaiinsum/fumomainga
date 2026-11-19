/**
 * /api/settings — cài đặt website (tên shop, màu, liên hệ, link Facebook/TikTok/Shopee, lời chào AI...).
 * GET: công khai — mọi khách đều nhận cùng cài đặt admin đã lưu.
 * PUT: chỉ admin.
 * Cài đặt không chứa bí mật (mật khẩu admin lưu riêng, không gửi lên đây).
 */
import { HttpError, getStore, handle, readJson, requireAdmin } from '../_lib/orders';

const KEY = 'site:settings';
const MAX_BYTES = 200_000;

/** Trình duyệt luôn hỏi lại máy chủ; chỉ CDN của Vercel giữ bản sao vài giây. */
const reply = (body: unknown, status = 200, cdn = '') =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-cache',
      ...(cdn ? { 'vercel-cdn-cache-control': cdn } : {}),
    },
  });

export const GET = handle(async () => {
  const saved = await getStore().getJson<{ settings: Record<string, unknown>; updatedAt: number }>(KEY);
  // Cache ngắn ở CDN để trang tải nhanh mà admin sửa xong khách thấy sau vài giây.
  return reply(saved ?? { settings: null, updatedAt: null }, 200, 'max-age=5, stale-while-revalidate=30');
});

export const PUT = handle(async (req) => {
  await requireAdmin(req);
  const body = await readJson(req);
  const settings = body['settings'];
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new HttpError(400, 'Cài đặt không hợp lệ.');
  if (JSON.stringify(settings).length > MAX_BYTES) throw new HttpError(400, 'Cài đặt quá lớn.');
  const saved = { settings, updatedAt: Date.now() };
  await getStore().setJson(KEY, saved);
  return reply(saved);
});

/**
 * /api/settings — cài đặt website (tên shop, màu, liên hệ, link Facebook/TikTok/Shopee, lời chào AI...).
 * GET: công khai — mọi khách đều nhận cùng cài đặt admin đã lưu.
 * PUT: chỉ admin.
 * Cài đặt không chứa bí mật (mật khẩu admin lưu riêng, không gửi lên đây).
 */
import { HttpError, getStore, handle, readJson, requireAdmin } from './_lib/orders';

const KEY = 'site:settings';
const MAX_BYTES = 200_000;

const reply = (body: unknown, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache } });

export const GET = handle(async () => {
  const saved = await getStore().getJson<{ settings: Record<string, unknown>; updatedAt: number }>(KEY);
  // Cache ngắn ở CDN để trang tải nhanh mà admin sửa xong vẫn thấy trong ~1 phút.
  return reply(saved ?? { settings: null, updatedAt: null }, 200, 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
});

export const PUT = handle(async (req) => {
  requireAdmin(req);
  const body = await readJson(req);
  const settings = body['settings'];
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new HttpError(400, 'Cài đặt không hợp lệ.');
  if (JSON.stringify(settings).length > MAX_BYTES) throw new HttpError(400, 'Cài đặt quá lớn.');
  const saved = { settings, updatedAt: Date.now() };
  await getStore().setJson(KEY, saved);
  return reply(saved);
});

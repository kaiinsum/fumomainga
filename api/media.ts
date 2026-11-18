/**
 * /api/media — admin tải ảnh (sản phẩm, tin tức) lên kho ảnh Supabase Storage.
 * POST { dataUrl } → { url } (link công khai, dùng được trên mọi máy).
 */
import { createHash } from 'node:crypto';
import { HttpError, getStore, handle, json, readJson, requireAdmin } from './_lib/orders';

const MAX_BYTES = 3_000_000;
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

export const POST = handle(async (req) => {
  requireAdmin(req);
  const store = getStore();
  if (!store.uploadImage) throw new HttpError(501, 'Kho ảnh chỉ có khi dùng Supabase.');
  const dataUrl = String((await readJson(req))['dataUrl'] ?? '');
  const m = /^data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  const ext = m && TYPES[m[1]];
  if (!m || !ext) throw new HttpError(400, 'Ảnh không hợp lệ (chỉ nhận JPG, PNG, WebP, GIF).');
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > MAX_BYTES) throw new HttpError(413, 'Ảnh quá lớn (tối đa 3MB).');
  // Đặt tên theo nội dung → tải lại cùng một ảnh không tạo bản trùng.
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 24);
  const url = await store.uploadImage(`img/${hash}.${ext}`, new Uint8Array(bytes), m[1]);
  return json({ url });
});

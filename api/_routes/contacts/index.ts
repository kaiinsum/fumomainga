/**
 * POST /api/contacts — khách gửi lời nhắn từ trang Liên hệ (công khai, có chống spam).
 * GET  /api/contacts — danh sách lời nhắn (chỉ admin).
 */
import { HttpError, getContacts, handle, isValidEmail, isValidVnPhone, json, normalizePhone, rateLimit, readJson, requireAdmin } from '../../_lib/orders';

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export const POST = handle(async (req) => {
  await rateLimit(req, 'contact', 5, 3600);
  const body = await readJson(req);
  const name = str(body['name'], 80);
  const phone = normalizePhone(str(body['phone'], 20));
  const email = str(body['email'], 120).toLowerCase();
  const message = str(body['message'], 2000);
  if (name.length < 2) throw new HttpError(400, 'Vui lòng nhập họ tên.');
  if (!isValidVnPhone(phone)) throw new HttpError(400, 'Số điện thoại không hợp lệ (VD: 0912 345 678).');
  if (email && !isValidEmail(email)) throw new HttpError(400, 'Email không hợp lệ.');
  if (message.length < 10) throw new HttpError(400, 'Lời nhắn tối thiểu 10 ký tự.');
  const saved = await getContacts().add({ name, phone, email, message });
  return json({ ok: true, id: saved.id }, 201);
});

export const GET = handle(async (req) => {
  requireAdmin(req);
  return json({ contacts: await getContacts().list() });
});

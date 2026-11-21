/**
 * /api/minigame - code mở khoá tất cả minigame trong ngày (giờ Việt Nam).
 * GET (admin): code hôm nay · PUT (admin): tạo code mới cho hôm nay (code cũ hết hiệu lực)
 * POST { code } (công khai): kiểm tra code khách nhập → mở khoá đến hết ngày.
 *
 * Code = HMAC(bí mật, ngày + muối) → mỗi ngày tự đổi, không cần lưu; bí mật chỉ nằm trên máy chủ.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { HttpError, getStore, handle, json, rateLimit, readJson, requireAdmin } from '../_lib/orders';

const VN = 7 * 3600_000;
/** Bỏ ký tự dễ nhầm (0/O, 1/I/L). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const today = () => new Date(Date.now() + VN).toISOString().slice(0, 10);
/** 23:59:59 hôm nay (giờ Việt Nam). */
const endOfDay = () => Math.floor((Date.now() + VN) / 86_400_000) * 86_400_000 + 86_400_000 - VN - 1;
const saltKey = (day: string) => `minigame:salt:${day}`;

function secret(): string {
  const s = process.env['MINIGAME_SECRET'] || process.env['ADMIN_API_KEY'];
  if (!s) throw new HttpError(503, 'Chưa cấu hình ADMIN_API_KEY trên máy chủ.');
  return s;
}

async function codeFor(day: string): Promise<string> {
  const salt = (await getStore().getJson<string>(saltKey(day))) ?? '';
  const mac = createHmac('sha256', secret()).update(`fumo-minigame:${day}:${salt}`).digest();
  return Array.from(mac.subarray(0, 6), (b) => ALPHABET[b % ALPHABET.length]).join('');
}

const normalize = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

export const GET = handle(async (req) => {
  await requireAdmin(req);
  const day = today();
  return json({ day, code: await codeFor(day), expiresAt: endOfDay() });
});

export const PUT = handle(async (req) => {
  await requireAdmin(req);
  const day = today();
  await getStore().setJson(saltKey(day), randomBytes(8).toString('hex'));
  return json({ day, code: await codeFor(day), expiresAt: endOfDay() });
});

export const POST = handle(async (req) => {
  await rateLimit(req, 'minigame-code', 10, 600);
  const code = normalize((await readJson(req))['code']);
  if (!code) throw new HttpError(400, 'Vui lòng nhập code.');
  const day = today();
  if (code !== (await codeFor(day))) throw new HttpError(400, 'Code không đúng hoặc đã hết hạn (code đổi mỗi ngày).');
  return json({ ok: true, day, expiresAt: endOfDay() });
});

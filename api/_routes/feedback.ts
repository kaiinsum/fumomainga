/**
 * /api/feedback - khách đánh giá đơn đã thanh toán để nhận voucher.
 *  POST (khách)  { code, phone, rating, text } → { voucher, offer, expiresAt }
 *  GET  (admin)  → { config, items }
 *  PATCH (admin) { config } | { code, used } → cập nhật cấu hình / đánh dấu voucher đã dùng
 *  DELETE (admin) { code } → xoá đánh giá
 * Lưu trong app_kv: 'feedback:config' + 'feedback:list' (mỗi đơn chỉ đánh giá 1 lần).
 */
import { randomInt } from 'node:crypto';
import { HttpError, Order, digits, getStore, handle, json, normalizeCode, rateLimit, readJson, requireAdmin } from '../_lib/orders';

const CFG_KEY = 'feedback:config';
const LIST_KEY = 'feedback:list';
/** Đơn ở các trạng thái này mới được đánh giá (đã thanh toán). */
const PAID = new Set(['paid', 'shipping', 'done']);

export interface FeedbackConfig {
  enabled: boolean;
  /** Ưu đãi của voucher, vd "Giảm 10% cho đơn tiếp theo". */
  offer: string;
  /** Tiền tố mã voucher, vd CAMON → CAMON7K2QX. */
  prefix: string;
  /** Số ngày voucher còn hạn (0 = không hết hạn). */
  validDays: number;
}

export interface Feedback {
  code: string;
  name: string;
  rating: number;
  text: string;
  voucher: string;
  offer: string;
  createdAt: number;
  expiresAt: number | null;
  used: boolean;
}

const DEFAULT_CFG: FeedbackConfig = { enabled: true, offer: 'Giảm 10% cho đơn hàng tiếp theo', prefix: 'CAMON', validDays: 60 };
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function cleanCfg(raw: unknown): FeedbackConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<FeedbackConfig>;
  return {
    enabled: r.enabled === undefined ? DEFAULT_CFG.enabled : !!r.enabled,
    offer: str(r.offer, 160) || DEFAULT_CFG.offer,
    prefix: (str(r.prefix, 10).toUpperCase().replace(/[^A-Z0-9]/g, '') || DEFAULT_CFG.prefix).slice(0, 10),
    validDays: Math.max(0, Math.min(3650, Math.round(Number(r.validDays ?? DEFAULT_CFG.validDays)) || 0)),
  };
}

export const readConfig = async () => cleanCfg(await getStore().getJson<FeedbackConfig>(CFG_KEY));
export const readList = async () => (await getStore().getJson<Record<string, Feedback>>(LIST_KEY)) ?? {};

/** Thông tin đánh giá kèm theo khi khách tra cứu đơn (đã đánh giá chưa, ưu đãi là gì). */
export async function feedbackInfo(order: Order) {
  const [cfg, list] = await Promise.all([readConfig(), readList()]);
  const done = list[order.code];
  return {
    enabled: cfg.enabled,
    offer: cfg.offer,
    allowed: cfg.enabled && PAID.has(order.status) && !done,
    done: done ? { rating: done.rating, text: done.text, voucher: done.voucher, offer: done.offer, expiresAt: done.expiresAt, used: done.used } : null,
  };
}

function voucherCode(prefix: string, taken: Set<string>): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  for (let t = 0; t < 20; t++) {
    let c = prefix;
    for (let i = 0; i < 5; i++) c += alphabet[randomInt(alphabet.length)];
    if (!taken.has(c)) return c;
  }
  throw new HttpError(500, 'Không tạo được mã voucher, vui lòng thử lại.');
}

export const POST = handle(async (req) => {
  await rateLimit(req, 'feedback', 10, 600);
  const body = await readJson(req);
  const code = normalizeCode(body['code']);
  const phone = digits(typeof body['phone'] === 'string' ? body['phone'] : '');
  const order = code && phone.length >= 9 ? await getStore().get(code) : null;
  if (!order || digits(order.customer.phone).slice(-9) !== phone.slice(-9)) {
    throw new HttpError(404, 'Không tìm thấy đơn hàng với mã và số điện thoại này.');
  }
  const cfg = await readConfig();
  if (!cfg.enabled) throw new HttpError(403, 'Shop đang tạm dừng chương trình đánh giá nhận voucher.');
  if (!PAID.has(order.status)) throw new HttpError(403, 'Đơn hàng cần được thanh toán xong mới đánh giá được.');

  const rating = Math.round(Number(body['rating']));
  if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, 'Vui lòng chọn số sao (1 - 5).');
  const text = str(body['text'], 1000).replace(/[<>]/g, '');
  if (text.length < 10) throw new HttpError(400, 'Nội dung đánh giá tối thiểu 10 ký tự.');

  const list = await readList();
  if (list[order.code]) throw new HttpError(409, 'Đơn hàng này đã được đánh giá rồi.');
  if (Object.keys(list).length >= 20000) throw new HttpError(507, 'Kho đánh giá đã đầy.');

  const now = Date.now();
  const fb: Feedback = {
    code: order.code,
    name: order.customer.name.slice(0, 80),
    rating,
    text,
    voucher: voucherCode(cfg.prefix, new Set(Object.values(list).map((f) => f.voucher))),
    offer: cfg.offer,
    createdAt: now,
    expiresAt: cfg.validDays ? now + cfg.validDays * 86_400_000 : null,
    used: false,
  };
  list[order.code] = fb;
  await getStore().setJson(LIST_KEY, list);
  return json({ voucher: fb.voucher, offer: fb.offer, expiresAt: fb.expiresAt });
});

export const GET = handle(async (req) => {
  await requireAdmin(req);
  const [config, list] = await Promise.all([readConfig(), readList()]);
  return json({ config, items: Object.values(list).sort((a, b) => b.createdAt - a.createdAt) });
});

export const PATCH = handle(async (req) => {
  await requireAdmin(req);
  const body = await readJson(req);
  if (body['config']) {
    const config = cleanCfg(body['config']);
    await getStore().setJson(CFG_KEY, config);
    return json({ config });
  }
  const code = normalizeCode(body['code']);
  const list = await readList();
  if (!list[code]) throw new HttpError(404, 'Không tìm thấy đánh giá.');
  list[code].used = !!body['used'];
  await getStore().setJson(LIST_KEY, list);
  return json({ item: list[code] });
});

export const DELETE = handle(async (req) => {
  await requireAdmin(req);
  const code = normalizeCode((await readJson(req))['code']);
  const list = await readList();
  if (!list[code]) throw new HttpError(404, 'Không tìm thấy đánh giá.');
  delete list[code];
  await getStore().setJson(LIST_KEY, list);
  return json({ ok: true });
});

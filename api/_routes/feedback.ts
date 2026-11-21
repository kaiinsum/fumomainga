/**
 * /api/feedback - khách đánh giá SẢN PHẨM ĐÃ MUA (nhập mã đơn + SĐT), mỗi sản phẩm trong 1 đơn chỉ đánh giá 1 lần.
 * Lần đánh giá đầu tiên của một đơn → tặng 1 mã voucher cho đơn đó.
 *  POST  (khách) { code, phone, productId, rating, text } → { review, voucher }
 *  GET   ?product=<id> (công khai) → { reviews, count, avg }   (đánh giá hiện ở trang sản phẩm)
 *  GET   (admin) → { config, reviews, vouchers }
 *  PATCH (admin) { config } | { voucher, used } | { key, hidden }
 *  DELETE (admin) { key }
 * Lưu trong app_kv: 'feedback:config', 'feedback:reviews', 'feedback:vouchers'.
 */
import { randomInt } from 'node:crypto';
import { HttpError, Order, digits, getStore, handle, json, normalizeCode, rateLimit, readJson, requireAdmin } from '../_lib/orders';

const CFG_KEY = 'feedback:config';
const REVIEWS_KEY = 'feedback:reviews';
const VOUCHERS_KEY = 'feedback:vouchers';
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

export interface Review {
  /** `${mã đơn}:${mã sản phẩm}` */
  key: string;
  code: string;
  productId: string;
  productName: string;
  name: string;
  rating: number;
  text: string;
  createdAt: number;
  /** Admin ẩn khỏi trang sản phẩm. */
  hidden: boolean;
}

export interface Voucher {
  code: string;
  voucher: string;
  offer: string;
  createdAt: number;
  expiresAt: number | null;
  used: boolean;
}

const DEFAULT_CFG: FeedbackConfig = { enabled: true, offer: 'Giảm 10% cho đơn hàng tiếp theo', prefix: 'CAMON', validDays: 60 };
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const pid = (v: unknown) => str(v, 120).replace(/[^A-Za-z0-9_:.-]/g, '');

function cleanCfg(raw: unknown): FeedbackConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<FeedbackConfig>;
  return {
    enabled: r.enabled === undefined ? DEFAULT_CFG.enabled : !!r.enabled,
    offer: str(r.offer, 160) || DEFAULT_CFG.offer,
    prefix: (str(r.prefix, 10).toUpperCase().replace(/[^A-Z0-9]/g, '') || DEFAULT_CFG.prefix).slice(0, 10),
    validDays: Math.max(0, Math.min(3650, Math.round(Number(r.validDays ?? DEFAULT_CFG.validDays)) || 0)),
  };
}

const readConfig = async () => cleanCfg(await getStore().getJson<FeedbackConfig>(CFG_KEY));
const readReviews = async () => (await getStore().getJson<Record<string, Review>>(REVIEWS_KEY)) ?? {};
const readVouchers = async () => (await getStore().getJson<Record<string, Voucher>>(VOUCHERS_KEY)) ?? {};

/** Tên hiện công khai: "Nguyễn Văn An" → "N. V. An" (giữ riêng tư). */
const publicName = (n: string) => {
  const w = n.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return 'Khách hàng';
  return [...w.slice(0, -1).map((x) => x[0].toUpperCase() + '.'), w[w.length - 1]].join(' ');
};

/** Các sản phẩm (không trùng) trong đơn. */
const orderProducts = (o: Order) => {
  const seen = new Map<string, string>();
  for (const it of o.items) if (it.id && !seen.has(it.id)) seen.set(it.id, it.name);
  return [...seen].map(([id, name]) => ({ id, name }));
};

const publicVoucher = (v: Voucher | undefined) =>
  v ? { voucher: v.voucher, offer: v.offer, expiresAt: v.expiresAt, used: v.used } : null;

/** Thông tin đánh giá kèm theo khi khách tra cứu đơn. */
export async function feedbackInfo(order: Order) {
  const [cfg, reviews, vouchers] = await Promise.all([readConfig(), readReviews(), readVouchers()]);
  const paid = PAID.has(order.status);
  return {
    enabled: cfg.enabled,
    offer: cfg.offer,
    paid,
    products: orderProducts(order).map((p) => {
      const r = reviews[`${order.code}:${p.id}`];
      return { ...p, review: r ? { rating: r.rating, text: r.text, createdAt: r.createdAt } : null };
    }),
    voucher: publicVoucher(vouchers[order.code]),
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
  await rateLimit(req, 'feedback', 15, 600);
  const body = await readJson(req);
  const code = normalizeCode(body['code']);
  const phone = digits(typeof body['phone'] === 'string' ? body['phone'] : '');
  const order = code && phone.length >= 9 ? await getStore().get(code) : null;
  if (!order || digits(order.customer.phone).slice(-9) !== phone.slice(-9)) {
    throw new HttpError(404, 'Không tìm thấy đơn hàng với mã và số điện thoại này.');
  }
  const cfg = await readConfig();
  if (!cfg.enabled) throw new HttpError(403, 'Shop đang tạm dừng nhận đánh giá.');
  if (!PAID.has(order.status)) throw new HttpError(403, 'Đơn hàng cần được thanh toán xong mới đánh giá được.');

  const productId = pid(body['productId']);
  const product = orderProducts(order).find((p) => p.id === productId);
  if (!product) throw new HttpError(403, 'Bạn chỉ đánh giá được sản phẩm có trong đơn hàng đã mua.');

  const rating = Math.round(Number(body['rating']));
  if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, 'Vui lòng chọn số sao (1 - 5).');
  const text = str(body['text'], 1000).replace(/[<>]/g, '');
  if (text.length < 10) throw new HttpError(400, 'Nội dung đánh giá tối thiểu 10 ký tự.');

  const [reviews, vouchers] = await Promise.all([readReviews(), readVouchers()]);
  const key = `${order.code}:${product.id}`;
  if (reviews[key]) throw new HttpError(409, 'Bạn đã đánh giá sản phẩm này trong đơn hàng này rồi.');
  if (Object.keys(reviews).length >= 30000) throw new HttpError(507, 'Kho đánh giá đã đầy.');

  const now = Date.now();
  const review: Review = {
    key,
    code: order.code,
    productId: product.id,
    productName: product.name.slice(0, 160),
    name: order.customer.name.slice(0, 80),
    rating,
    text,
    createdAt: now,
    hidden: false,
  };
  reviews[key] = review;
  await getStore().setJson(REVIEWS_KEY, reviews);

  // Lần đánh giá đầu tiên của đơn → tặng voucher
  if (!vouchers[order.code]) {
    vouchers[order.code] = {
      code: order.code,
      voucher: voucherCode(cfg.prefix, new Set(Object.values(vouchers).map((v) => v.voucher))),
      offer: cfg.offer,
      createdAt: now,
      expiresAt: cfg.validDays ? now + cfg.validDays * 86_400_000 : null,
      used: false,
    };
    await getStore().setJson(VOUCHERS_KEY, vouchers);
  }
  return json({
    review: { rating, text, createdAt: now },
    voucher: publicVoucher(vouchers[order.code]),
  });
});

export const GET = handle(async (req) => {
  const product = pid(new URL(req.url).searchParams.get('product'));
  if (product) {
    const list = Object.values(await readReviews())
      .filter((r) => r.productId === product && !r.hidden)
      .sort((a, b) => b.createdAt - a.createdAt);
    const avg = list.length ? Math.round((list.reduce((s, r) => s + r.rating, 0) / list.length) * 10) / 10 : 0;
    return json({
      count: list.length,
      avg,
      reviews: list.slice(0, 50).map((r) => ({ name: publicName(r.name), rating: r.rating, text: r.text, createdAt: r.createdAt, variant: r.productName })),
    });
  }
  await requireAdmin(req);
  const [config, reviews, vouchers] = await Promise.all([readConfig(), readReviews(), readVouchers()]);
  return json({
    config,
    reviews: Object.values(reviews).sort((a, b) => b.createdAt - a.createdAt),
    vouchers: Object.values(vouchers).sort((a, b) => b.createdAt - a.createdAt),
  });
});

export const PATCH = handle(async (req) => {
  await requireAdmin(req);
  const body = await readJson(req);
  if (body['config']) {
    const config = cleanCfg(body['config']);
    await getStore().setJson(CFG_KEY, config);
    return json({ config });
  }
  if (typeof body['voucher'] === 'string') {
    const vouchers = await readVouchers();
    const v = Object.values(vouchers).find((x) => x.voucher === body['voucher']);
    if (!v) throw new HttpError(404, 'Không tìm thấy voucher.');
    v.used = !!body['used'];
    await getStore().setJson(VOUCHERS_KEY, vouchers);
    return json({ voucher: v });
  }
  const reviews = await readReviews();
  const r = reviews[str(body['key'], 160)];
  if (!r) throw new HttpError(404, 'Không tìm thấy đánh giá.');
  r.hidden = !!body['hidden'];
  await getStore().setJson(REVIEWS_KEY, reviews);
  return json({ review: r });
});

export const DELETE = handle(async (req) => {
  await requireAdmin(req);
  const key = str((await readJson(req))['key'], 160);
  const reviews = await readReviews();
  if (!reviews[key]) throw new HttpError(404, 'Không tìm thấy đánh giá.');
  delete reviews[key];
  await getStore().setJson(REVIEWS_KEY, reviews);
  return json({ ok: true });
});

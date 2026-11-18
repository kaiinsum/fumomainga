/**
 * POST /api/orders/confirm — khách bấm "Tôi đã chuyển khoản": ghi lại thời điểm để shop đối soát.
 */
import { HttpError, digits, getStore, handle, json, normalizeCode, rateLimit, readJson } from '../../_lib/orders';

export const POST = handle(async (req) => {
  await rateLimit(req, 'confirm', 20, 600);
  const body = await readJson(req);
  const code = normalizeCode(body['code']);
  const phone = digits(typeof body['phone'] === 'string' ? body['phone'] : '');
  const store = getStore();
  const order = code ? await store.get(code) : null;
  if (!order || digits(order.customer.phone).slice(-9) !== phone.slice(-9)) {
    throw new HttpError(404, 'Không tìm thấy đơn hàng.');
  }
  if (order.status === 'pending' && !order.paidClaimAt) {
    order.paidClaimAt = Date.now();
    order.updatedAt = order.paidClaimAt;
    await store.put(order);
  }
  return json({ ok: true, code: order.code });
});

/**
 * POST /api/orders/lookup - khách tra cứu đơn bằng mã đơn + số điện thoại đã đặt.
 * Dùng POST để số điện thoại không nằm trên URL / log.
 */
import { HttpError, digits, getStore, handle, json, normalizeCode, publicView, rateLimit, readJson } from '../../_lib/orders';
import { feedbackInfo } from '../feedback';

export const POST = handle(async (req) => {
  await rateLimit(req, 'lookup', 30, 600);
  const body = await readJson(req);
  const code = normalizeCode(body['code']);
  const phone = digits(typeof body['phone'] === 'string' ? body['phone'] : '');
  const order = code && phone.length >= 9 ? await getStore().get(code) : null;
  // Sai mã hay sai SĐT đều báo cùng một lỗi để không lộ đơn của người khác.
  if (!order || digits(order.customer.phone).slice(-9) !== phone.slice(-9)) {
    throw new HttpError(404, 'Không tìm thấy đơn hàng với mã và số điện thoại này.');
  }
  return json({ order: publicView(order), feedback: await feedbackInfo(order) });
});

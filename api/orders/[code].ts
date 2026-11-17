/**
 * /api/orders/:code — xem, sửa, xoá một đơn (chỉ admin).
 */
import {
  HttpError,
  getStore,
  handle,
  json,
  normalizeCode,
  orderTotal,
  parseCustomer,
  parseItems,
  parseStatus,
  readJson,
  requireAdmin,
} from '../_lib/orders';

const codeOf = (req: Request) => normalizeCode(decodeURIComponent(new URL(req.url).pathname.split('/').pop() ?? ''));

async function load(req: Request) {
  requireAdmin(req);
  const order = await getStore().get(codeOf(req));
  if (!order) throw new HttpError(404, 'Không tìm thấy đơn hàng.');
  return order;
}

export const GET = handle(async (req) => json({ order: await load(req) }));

export const PUT = handle(async (req) => {
  const order = await load(req);
  const body = await readJson(req);
  if ('status' in body) order.status = parseStatus(body['status']);
  if ('customer' in body) order.customer = parseCustomer(body['customer']);
  if ('items' in body) {
    order.items = parseItems(body['items']);
    order.total = orderTotal(order.items);
  }
  if (typeof body['adminNote'] === 'string') order.adminNote = body['adminNote'].slice(0, 1000);
  order.updatedAt = Date.now();
  await getStore().put(order);
  return json({ order });
});

export const DELETE = handle(async (req) => {
  const order = await load(req);
  await getStore().del(order.code);
  return json({ ok: true });
});

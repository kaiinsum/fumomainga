/**
 * POST /api/orders — khách đặt hàng (công khai). Admin (có x-admin-key) được tạo đơn với trạng thái tuỳ chọn.
 * GET  /api/orders — danh sách đơn (chỉ admin).
 */
import {
  Order,
  getStore,
  handle,
  isAdmin,
  json,
  newOrderCode,
  orderTotal,
  parseCustomer,
  parseItems,
  parseStatus,
  rateLimit,
  readJson,
  requireAdmin,
} from '../_lib/orders';

export const POST = handle(async (req) => {
  const admin = isAdmin(req);
  if (!admin) await rateLimit(req, 'create', 8, 3600);
  const body = await readJson(req);
  const items = parseItems(body['items']);
  const now = Date.now();
  // Khách đã thấy mã đơn trong popup (tạo trên trình duyệt) → dùng lại nếu hợp lệ và chưa trùng.
  const wanted = typeof body['code'] === 'string' ? body['code'].toUpperCase() : '';
  const code = /^FM[A-HJ-NP-Z2-9]{6}$/.test(wanted) && !(await getStore().get(wanted)) ? wanted : await newOrderCode();
  const order: Order = {
    code,
    status: admin && body['status'] ? parseStatus(body['status']) : 'pending',
    customer: parseCustomer(body['customer']),
    items,
    total: orderTotal(items),
    createdAt: now,
    updatedAt: now,
    adminNote: admin && typeof body['adminNote'] === 'string' ? body['adminNote'].slice(0, 1000) : '',
  };
  await getStore().put(order);
  return json({ code: order.code, total: order.total, createdAt: order.createdAt }, 201);
});

export const GET = handle(async (req) => {
  requireAdmin(req);
  return json({ orders: await getStore().list() });
});

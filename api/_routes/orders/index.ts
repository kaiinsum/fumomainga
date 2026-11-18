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
} from '../../_lib/orders';

export const POST = handle(async (req) => {
  const admin = isAdmin(req);
  const body = await readJson(req);
  const items = parseItems(body['items']);
  const customer = parseCustomer(body['customer']);
  const now = Date.now();
  // Khách đã thấy mã đơn trong popup (tạo trên trình duyệt) → dùng lại nếu hợp lệ và chưa trùng.
  const wanted = typeof body['code'] === 'string' ? body['code'].toUpperCase() : '';
  const validWanted = /^FM[A-HJ-NP-Z2-9]{6}$/.test(wanted);
  // Chống spam + kiểm tra mã đơn chạy song song (trước đây chạy lần lượt → chậm gấp đôi).
  const [, existing] = await Promise.all([
    admin ? Promise.resolve() : rateLimit(req, 'create', 8, 3600),
    validWanted ? getStore().get(wanted) : Promise.resolve(null),
  ]);
  // Gửi lại đúng đơn đã lưu (mạng chậm → trình duyệt tự gửi lại) → trả về đơn cũ, không tạo đơn trùng.
  const same = (a: string, b: string) => a.replace(/\D/g, '') === b.replace(/\D/g, '');
  if (existing && same(existing.customer.phone, customer.phone) && existing.total === orderTotal(items)) {
    return json({ code: existing.code, total: existing.total, createdAt: existing.createdAt }, 200);
  }
  const code = validWanted && !existing ? wanted : await newOrderCode();
  const order: Order = {
    code,
    status: admin && body['status'] ? parseStatus(body['status']) : 'pending',
    customer,
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

/**
 * /api/admin/costs - giá nhập hàng (CHỈ admin). Lưu riêng trong app_kv 'admin:costs',
 * KHÔNG nằm trong catalog sản phẩm công khai nên khách không bao giờ thấy.
 *  GET → { costs: { "<productId>": 120000, "<productId>::<variantId>": 150000 } }
 *  PUT { costs } → ghi đè toàn bộ  ·  PATCH { id, cost | null } → sửa 1 mục
 */
import { HttpError, getStore, handle, json, readJson, requireAdmin } from '../_lib/orders';

const KEY = 'admin:costs';
type Costs = Record<string, number>;

const validId = (k: string) => /^[A-Za-z0-9_:.-]{1,120}$/.test(k);
const validCost = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e11;

function clean(raw: unknown): Costs {
  const out: Costs = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (validId(k) && validCost(v)) out[k] = Math.round(v);
  }
  return out;
}

const read = async () => clean(await getStore().getJson<Costs>(KEY));

export const GET = handle(async (req) => {
  await requireAdmin(req);
  return json({ costs: await read() });
});

export const PUT = handle(async (req) => {
  await requireAdmin(req);
  const body = await readJson(req);
  const costs = clean(body['costs']);
  if (Object.keys(costs).length > 5000) throw new HttpError(400, 'Quá nhiều mục giá nhập.');
  await getStore().setJson(KEY, costs);
  return json({ costs });
});

export const PATCH = handle(async (req) => {
  await requireAdmin(req);
  const body = await readJson(req);
  const id = typeof body['id'] === 'string' ? body['id'] : '';
  if (!validId(id)) throw new HttpError(400, 'Mã sản phẩm không hợp lệ.');
  const costs = await read();
  if (body['cost'] === null || body['cost'] === '') delete costs[id];
  else if (validCost(body['cost'])) costs[id] = Math.round(body['cost']);
  else throw new HttpError(400, 'Giá nhập không hợp lệ.');
  await getStore().setJson(KEY, costs);
  return json({ costs });
});

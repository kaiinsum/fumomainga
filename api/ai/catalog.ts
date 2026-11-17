/**
 * /api/ai/catalog — dữ liệu website (sản phẩm, danh mục, tin tức) cho trợ lý AI (chỉ admin).
 * GET: thông tin lần đồng bộ gần nhất · PUT: đồng bộ dữ liệu mới từ trang admin.
 */
import { CATALOG_KEY, CatalogSnapshot, parseCatalog } from '../_lib/ai';
import { getStore, handle, json, readJson, requireAdmin } from '../_lib/orders';

const summary = (c: CatalogSnapshot | null) =>
  c
    ? { syncedAt: c.syncedAt, products: c.products.length, inStock: c.products.filter((p) => p.inStock).length, news: c.news.length }
    : { syncedAt: null, products: 0, inStock: 0, news: 0 };

export const GET = handle(async (req) => {
  requireAdmin(req);
  return json(summary(await getStore().getJson<CatalogSnapshot>(CATALOG_KEY)));
});

export const PUT = handle(async (req) => {
  requireAdmin(req);
  const snapshot = parseCatalog(await readJson(req));
  await getStore().setJson(CATALOG_KEY, snapshot);
  return json(summary(snapshot));
});

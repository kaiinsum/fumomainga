/**
 * /api/catalog — sản phẩm, danh mục, tin tức của shop.
 * GET: công khai — mọi máy đều thấy cùng dữ liệu admin đã lưu.
 * PUT: chỉ admin — trang admin tự gửi lên mỗi khi thêm / sửa / xoá.
 * Ảnh được tải riêng lên /api/media nên dữ liệu ở đây chỉ chứa link ảnh.
 */
import { parseCatalog } from './_lib/ai';
import { HttpError, getStore, handle, readJson, requireAdmin } from './_lib/orders';

const KEY = 'site:catalog';
/** Vercel giới hạn thân yêu cầu ~4.5MB. */
const MAX_BYTES = 4_000_000;

interface Catalog {
  products: unknown[];
  categories: unknown[];
  news: unknown[];
  updatedAt: number;
}

/**
 * Trình duyệt luôn hỏi lại máy chủ (no-cache) để thấy ngay bản admin vừa lưu;
 * chỉ CDN của Vercel được giữ bản sao vài giây cho nhanh.
 */
const reply = (body: unknown, status = 200, cdn = '') =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-cache',
      ...(cdn ? { 'vercel-cdn-cache-control': cdn } : {}),
    },
  });

export const GET = handle(async (req) => {
  const saved = await getStore().getJson<Catalog>(KEY);
  // ?fresh=1 (admin) bỏ qua cache CDN; khách dùng cache ngắn để trang tải nhanh.
  const fresh = new URL(req.url).searchParams.has('fresh');
  return reply(saved ?? { products: null, categories: null, news: null, updatedAt: null }, 200, fresh ? '' : 'max-age=5, stale-while-revalidate=30');
});

export const PUT = handle(async (req) => {
  requireAdmin(req);
  const body = await readJson(req);
  const list = (k: string) => {
    const v = body[k];
    if (!Array.isArray(v)) throw new HttpError(400, `Thiếu danh sách "${k}".`);
    return v;
  };
  const catalog: Catalog = { products: list('products'), categories: list('categories'), news: list('news'), updatedAt: Date.now() };
  if (JSON.stringify(catalog).length > MAX_BYTES) {
    throw new HttpError(413, 'Dữ liệu quá lớn (thường do ảnh chưa tải lên được kho ảnh). Hãy giảm bớt ảnh rồi thử lại.');
  }
  const store = getStore();
  // Lưu dữ liệu cho trang web và cập nhật bảng products (Supabase) cùng lúc.
  // Bảng products lỗi (chưa chạy schema.sql...) thì vẫn lưu được dữ liệu web, chỉ báo cảnh báo cho admin.
  const [, tableError] = await Promise.all([
    store.setJson(KEY, catalog),
    store.syncProducts
      ? store.syncProducts(parseCatalog({ products: catalog.products }).products).then(
          () => '',
          (e: unknown) => (e instanceof Error ? e.message : String(e)),
        )
      : Promise.resolve(''),
  ]);
  if (tableError) console.error('Đồng bộ bảng products lỗi:', tableError);
  return reply({ updatedAt: catalog.updatedAt, warning: tableError ? `Đã lưu, nhưng bảng products chưa cập nhật được: ${tableError}` : '' });
});

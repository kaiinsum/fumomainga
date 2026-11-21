/**
 * /api/news-views - lượt xem từng bài viết (công khai, để hiện "👁 123 lượt xem" ở trang Tin tức).
 * Lấy từ bảng thống kê đang có (khoá 'news:<slug>' - xem analytics.ts). Lưu đệm 5 phút trên CDN.
 */
import { getStore, handle } from '../_lib/orders';

export const GET = handle(async () => {
  let views: Record<string, number> = {};
  try {
    const all = (await getStore().analytics?.games(null)) ?? [];
    views = Object.fromEntries(all.filter((g) => g.game.startsWith('news:')).map((g) => [g.game.slice(5), g.plays]));
  } catch {
    // Chưa có bảng thống kê (chưa chạy schema.sql) → trả về rỗng, trang vẫn hiển thị bình thường.
  }
  return new Response(JSON.stringify({ views }), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' },
  });
});

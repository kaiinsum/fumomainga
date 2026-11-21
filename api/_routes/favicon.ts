/**
 * /site-icon - favicon theo khai báo (Admin → Khai báo SEO → Khai báo chung → Favicon).
 * index.html trỏ thẳng <link rel="icon"> về đây nên Google (đọc HTML gốc, không chạy JavaScript) thấy đúng favicon đã đặt,
 * không chỉ tab trình duyệt. Chưa đặt favicon → chuyển về file mặc định trong /public.
 *  ?apple=1 → icon cho màn hình chính iPhone (mặc định: apple-touch-icon.png).
 *  /favicon.ico cũng trỏ về đây (?ico=1) để mọi nơi (Google, trình duyệt cũ) thấy CÙNG một icon.
 */
import { getStore, handle } from '../_lib/orders';

const CACHE = 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400';
/** Ảnh trả từ tên miền web → chặn mọi mã chạy kèm (vd. SVG có script). */
const SAFE = { 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox", 'x-content-type-options': 'nosniff' };
const IMAGE_TYPES = /^image\/(png|jpe?g|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon|avif)$/i;
const isImage = (v: string) => /^(https?:\/\/|data:image\/|\/)/i.test(v) || /\.(png|jpe?g|webp|gif|svg|ico|avif)(\?|$)/i.test(v);

const fallback = (origin: string, apple: boolean) =>
  new Response(null, { status: 302, headers: { location: `${origin}/${apple ? 'apple-touch-icon.png' : 'favicon.svg'}`, 'cache-control': 'public, max-age=300, s-maxage=300' } });

/** Emoji → favicon SVG (giống cách trình duyệt hiển thị). */
const emojiSvg = (e: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="88">${e.replace(/[<>&"]/g, '')}</text></svg>`;

export const GET = handle(async (req) => {
  const url = new URL(req.url);
  const origin = url.origin;
  const apple = url.searchParams.has('apple');
  const row = await getStore()
    .getJson<{ settings?: { seo?: { favicon?: string } } }>('site:settings')
    .catch(() => null);
  const icon = (row?.settings?.seo?.favicon ?? '').trim();
  if (!icon) return fallback(origin, apple);

  if (!isImage(icon)) {
    // iPhone không dùng SVG cho màn hình chính → giữ icon mặc định.
    if (apple) return fallback(origin, true);
    return new Response(emojiSvg(icon), { headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': CACHE, ...SAFE } });
  }

  // Ảnh nhỏ lưu dạng data: → giải mã trả thẳng.
  const data = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(icon);
  if (data) {
    if (!IMAGE_TYPES.test(data[1])) return fallback(origin, apple);
    return new Response(Buffer.from(data[2], 'base64'), { headers: { 'content-type': data[1], 'cache-control': CACHE, ...SAFE } });
  }

  // Ảnh trên kho / link https → lấy về rồi trả lại từ chính tên miền web (Google ưu tiên favicon cùng tên miền).
  const src = icon.startsWith('/') ? origin + icon : icon;
  if (!/^https:\/\//i.test(src) && !src.startsWith(origin)) return fallback(origin, apple);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(src, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!res.ok || !IMAGE_TYPES.test(type)) return fallback(origin, apple);
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > 1_000_000) return fallback(origin, apple);
    return new Response(bytes, { headers: { 'content-type': type, 'cache-control': CACHE, ...SAFE } });
  } catch {
    return fallback(origin, apple);
  }
});

/**
 * /sitemap.xml và /robots.txt tự động (vercel.json chuyển 2 địa chỉ này về đây).
 * Đọc thẳng dữ liệu web đã lưu → thêm / sửa / ẩn sản phẩm hay bài viết là sitemap tự cập nhật, không cần tải file lên lại.
 * Bỏ qua: sản phẩm ẩn, bài nháp, và mọi trang đặt noindex trong mục SEO.
 */
import { getStore, handle } from '../_lib/orders';

interface P {
  id: string;
  slug?: string;
  name?: string;
  category?: string;
  images?: string[];
  hidden?: boolean;
  createdAt?: number;
  releasedAt?: string;
  seo?: { noindex?: boolean };
}
interface N {
  id: string;
  title?: string;
  cover?: string;
  status?: string;
  createdAt?: number;
  updatedAt?: number;
  seo?: { slug?: string; noindex?: boolean };
}
interface Catalog {
  products?: P[] | null;
  news?: N[] | null;
  categories?: { name: string }[] | null;
  updatedAt?: number | null;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const day = (t?: number) => (t && Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '');
const publicImg = (src?: string) => (src && /^https?:\/\//i.test(src) ? src : '');

export function buildSitemap(origin: string, catalog: Catalog | null): string {
  const products = (catalog?.products ?? []).filter((p) => p && p.id && !p.hidden && !p.seo?.noindex);
  const news = (catalog?.news ?? []).filter((n) => n && n.id && n.status === 'published' && !n.seo?.noindex);
  const usedCats = new Set(products.map((p) => p.category).filter(Boolean));
  const cats = (catalog?.categories ?? []).map((c) => c?.name).filter((c): c is string => !!c && usedCats.has(c));

  const newsLatest = Math.max(0, ...news.map((n) => n.updatedAt ?? n.createdAt ?? 0));
  const prodLatest = Math.max(0, ...products.map((p) => p.createdAt ?? 0));
  const siteLatest = Math.max(newsLatest, prodLatest, catalog?.updatedAt ?? 0);

  const url = (loc: string, lastmod?: number, freq?: string, priority?: string, images: { loc: string; title?: string }[] = []) =>
    [
      '  <url>',
      `    <loc>${esc(origin + loc)}</loc>`,
      day(lastmod) ? `    <lastmod>${day(lastmod)}</lastmod>` : '',
      freq ? `    <changefreq>${freq}</changefreq>` : '',
      priority ? `    <priority>${priority}</priority>` : '',
      ...images.map(
        (i) => `    <image:image><image:loc>${esc(i.loc)}</image:loc>${i.title ? `<image:title>${esc(i.title)}</image:title>` : ''}</image:image>`,
      ),
      '  </url>',
    ]
      .filter(Boolean)
      .join('\n');

  const entries = [
    url('/', siteLatest, 'daily', '1.0'),
    url('/san-pham', prodLatest, 'daily', '0.9'),
    ...cats.map((c) => url(`/san-pham?danhMuc=${encodeURIComponent(c)}`, undefined, 'weekly', '0.7')),
    ...products
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .map((p) => {
        const imgs = (p.images ?? []).map(publicImg).filter(Boolean).slice(0, 5).map((loc) => ({ loc, title: p.name }));
        return url(`/san-pham/${encodeURIComponent(p.slug || p.id)}`, p.createdAt, 'weekly', '0.8', imgs);
      }),
    url('/tin-tuc', newsLatest, 'daily', '0.8'),
    ...news
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .map((n) => {
        const cover = publicImg(n.cover);
        return url(`/tin-tuc/${encodeURIComponent(n.seo?.slug || n.id)}`, n.updatedAt ?? n.createdAt, 'weekly', '0.7', cover ? [{ loc: cover, title: n.title }] : []);
      }),
    url('/mini-game', undefined, 'weekly', '0.6'),
    url('/gioi-thieu', undefined, 'monthly', '0.5'),
    url('/lien-he', undefined, 'monthly', '0.5'),
    url('/chinh-sach', undefined, 'monthly', '0.3'),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.join('\n')}
</urlset>
`;
}

export function buildRobots(origin: string): string {
  return `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /gio-hang
Disallow: /tra-cuu-don-hang

Sitemap: ${origin}/sitemap.xml
`;
}

export const GET = handle(async (req) => {
  const url = new URL(req.url);
  const origin = url.origin;
  const headers = { 'cache-control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600' };
  if (url.searchParams.get('kind') === 'robots') {
    return new Response(buildRobots(origin), { headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' } });
  }
  const catalog = await getStore().getJson<Catalog>('site:catalog').catch(() => null);
  return new Response(buildSitemap(origin, catalog), { headers: { ...headers, 'content-type': 'application/xml; charset=utf-8' } });
});

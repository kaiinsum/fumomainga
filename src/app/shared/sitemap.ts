import { NewsPost, newsPath } from '../models/news';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const day = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * sitemap.xml: trang tin tức + các bài đã đăng (bỏ bài nháp và bài đặt noindex),
 * kèm vài trang chính của website. Bài có ảnh bìa dạng link https được khai báo thêm image:image.
 */
export function buildNewsSitemap(origin: string, posts: NewsPost[]): string {
  const base = origin.replace(/\/+$/, '');
  const published = posts.filter((p) => p.status === 'published' && !p.seo?.noindex);
  const latest = Math.max(0, ...published.map((p) => p.updatedAt));

  const url = (loc: string, lastmod?: number, freq?: string, priority?: string, image?: string) =>
    [
      '  <url>',
      `    <loc>${esc(base + loc)}</loc>`,
      lastmod ? `    <lastmod>${day(lastmod)}</lastmod>` : '',
      freq ? `    <changefreq>${freq}</changefreq>` : '',
      priority ? `    <priority>${priority}</priority>` : '',
      image ? `    <image:image><image:loc>${esc(image)}</image:loc></image:image>` : '',
      '  </url>',
    ]
      .filter(Boolean)
      .join('\n');

  const entries = [
    url('/', latest || undefined, 'daily', '1.0'),
    url('/tin-tuc', latest || undefined, 'daily', '0.9'),
    ...published
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((p) =>
        url(newsPath(p), p.updatedAt, 'weekly', '0.8', /^https?:\/\//i.test(p.cover) ? p.cover : undefined),
      ),
    url('/san-pham', undefined, 'weekly', '0.8'),
    url('/gioi-thieu', undefined, 'monthly', '0.5'),
    url('/lien-he', undefined, 'monthly', '0.5'),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.join('\n')}
</urlset>
`;
}

export function buildRobotsTxt(origin: string): string {
  return `User-agent: *
Allow: /
Disallow: /admin

Sitemap: ${origin.replace(/\/+$/, '')}/sitemap.xml
`;
}

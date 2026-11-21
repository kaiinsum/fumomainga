/**
 * /api/og?p=<đường dẫn trang> — trang HTML nhỏ có thẻ Open Graph cho BOT xem trước link
 * (Messenger / Facebook / Zalo / Discord / Telegram...). Bot không chạy JavaScript nên không thấy
 * ảnh / tiêu đề mà Angular gắn sau; vercel.json chuyển riêng các bot (theo user-agent) tới đây.
 * Người thật không bao giờ vào đây (vercel.json chỉ chuyển user-agent của bot).
 *
 * ?mode=search — dành cho bot TÌM KIẾM (Googlebot, Bing, Cốc Cốc...): trả về ĐÚNG trang web khách nhận (index.html),
 * chỉ điền sẵn <head> (tiêu đề, mô tả, canonical, ảnh thumbnail, robots max-image-preview, JSON-LD có ảnh)
 * để Google thấy ảnh ngay từ HTML gốc, không phải chờ chạy JavaScript. Nội dung trang giữ nguyên → không phải "cloaking".
 * Angular khởi động sẽ xoá các thẻ [data-ssr] này rồi gắn lại thẻ của chính nó.
 */
import { getStore, handle } from '../_lib/orders';

interface P {
  id: string;
  slug?: string;
  oldSlugs?: string[];
  name: string;
  description?: string;
  images?: string[];
  category?: string;
  hidden?: boolean;
  price?: number;
  salePrice?: number | null;
  seo?: { title?: string; description?: string; noindex?: boolean };
}
interface N {
  id: string;
  title: string;
  excerpt?: string;
  cover?: string;
  status?: string;
  seo?: { slug?: string; title?: string; description?: string };
}
interface Catalog {
  products?: P[] | null;
  news?: N[] | null;
  categories?: { name: string; icon?: string }[] | null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const plain = (s: string) => s.replace(/[#*_>`\[\]()!]/g, ' ').replace(/\s+/g, ' ').trim();
const vnd = (n: number) => n.toLocaleString('vi-VN') + ' ₫';

export const GET = handle(async (req) => {
  const url = new URL(req.url);
  const origin = url.origin;
  const raw = url.searchParams.get('p') || '/';
  const path = ('/' + raw.replace(/^\/+/, '')).split('#')[0];
  const [pathname, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  // Vercel nối query gốc (vd. ?danhMuc=...) vào query của /api → gộp lại.
  for (const [k, v] of url.searchParams) if (k !== 'p' && k !== '__path' && !params.has(k)) params.set(k, v);

  const [catalog, settingsRow] = await Promise.all([
    getStore().getJson<Catalog>('site:catalog').catch(() => null),
    getStore().getJson<{ settings?: Record<string, unknown> }>('site:settings').catch(() => null),
  ]);
  const s = settingsRow?.settings ?? {};
  const shop = (typeof s['shopName'] === 'string' && s['shopName']) || 'Fumo Mai Nga';
  const defDesc = (typeof s['heroSubtitle'] === 'string' && s['heroSubtitle']) || 'Thú bông Fumo, móc khóa, figure và phụ kiện dễ thương.';
  const abs = (img: string | undefined) => {
    if (!img || img.startsWith('data:')) return `${origin}/og/og-default.jpg`;
    if (/^https?:\/\//.test(img)) return img;
    return origin + '/' + img.replace(/^\/+/, '');
  };

  // Khai báo SEO (Admin → Khai báo): mô tả / ảnh chia sẻ mặc định + từng trang trên menu.
  const seo = (s['seo'] && typeof s['seo'] === 'object' ? s['seo'] : {}) as {
    defaultDescription?: string;
    defaultOgImage?: string;
    pages?: Record<string, { title?: string; description?: string; ogImage?: string }>;
  };
  let title = shop;
  let desc = seo.defaultDescription?.trim() || defDesc;
  let image = seo.defaultOgImage ? abs(seo.defaultOgImage) : `${origin}/og/og-default.jpg`;
  let type = 'website';
  const products = (catalog?.products ?? []).filter((p) => p && !p.hidden);

  const prod = /^\/san-pham\/([^/]+)$/.exec(pathname);
  const news = /^\/tin-tuc\/([^/]+)$/.exec(pathname);
  if (prod) {
    const key = decodeURIComponent(prod[1]);
    const p = products.find((x) => x.slug === key || x.id === key || (x.oldSlugs ?? []).includes(key));
    if (p) {
      const price = typeof p.salePrice === 'number' && p.salePrice < (p.price ?? Infinity) ? p.salePrice : p.price;
      title = `${p.seo?.title || p.name} — ${shop}`;
      desc = clip(`${typeof price === 'number' ? vnd(price) + ' · ' : ''}${plain(p.seo?.description || p.description || '')}`, 200);
      image = abs(p.images?.[0]);
      type = 'product';
    }
  } else if (news) {
    const key = decodeURIComponent(news[1]);
    const n = (catalog?.news ?? []).find((x) => x && x.status !== 'draft' && (x.seo?.slug === key || x.id === key));
    if (n) {
      title = `${n.seo?.title || n.title} — ${shop}`;
      desc = clip(plain(n.seo?.description || n.excerpt || ''), 200) || defDesc;
      image = abs(n.cover);
      type = 'article';
    }
  } else if (pathname === '/san-pham') {
    const cat = params.get('danhMuc');
    const list = cat ? products.filter((p) => p.category === cat) : products;
    const rawIcon = cat ? (catalog?.categories ?? []).find((c) => c.name === cat)?.icon ?? '' : '';
    // Icon dạng ảnh (link / data) thì không ghi vào tiêu đề.
    const icon = rawIcon.length <= 8 && !/[/.:]/.test(rawIcon) ? rawIcon : '';
    title = cat ? `${icon ? icon + ' ' : ''}${cat} — ${shop}` : `Tất cả sản phẩm — ${shop}`;
    desc = `${list.length} sản phẩm${cat ? ' trong danh mục ' + cat : ''}: ${clip(list.slice(0, 4).map((p) => p.name).join(', '), 150)}`;
    // Danh mục: lấy ảnh sản phẩm đầu tiên của danh mục.
    if (cat && list[0]?.images?.[0]) image = abs(list[0].images[0]);
  } else if (pathname.startsWith('/mini-game')) {
    title = `🎮 Mini game — ${shop}`;
    desc = 'Chơi minigame fumo miễn phí ngay trên trình duyệt, đua top bảng xếp hạng!';
  } else if (pathname === '/tin-tuc') {
    title = `Tin tức — ${shop}`;
  }

  // Trang trên menu có khai báo riêng → ưu tiên (trừ trang danh mục ?danhMuc=).
  const page = seo.pages?.[pathname === '' ? '/' : pathname];
  if (page && !(pathname === '/san-pham' && params.get('danhMuc'))) {
    if (page.title?.trim()) title = page.title.trim();
    if (page.description?.trim()) desc = clip(page.description.trim(), 200);
    if (page.ogImage?.trim()) image = abs(page.ogImage.trim());
  }

  const qs = params.toString();
  const catQs = params.get('danhMuc') && (pathname === '/san-pham' || pathname === '/tin-tuc') ? '?danhMuc=' + encodeURIComponent(params.get('danhMuc')!) : '';
  const pageUrl = origin + pathname + (qs ? '?' + qs : '');

  if (url.searchParams.get('mode') === 'search') {
    return searchPage(origin, { title, desc, image, type, canonical: origin + (pathname || '/') + catQs, shop });
  }
  const html = `<!doctype html>
<html lang="vi"><head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${esc(shop)}">
<meta property="og:locale" content="vi_VN">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<link rel="canonical" href="${esc(pageUrl)}">
</head><body><a href="${esc(pageUrl)}">${esc(title)}</a></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Bot hay hỏi lại nhiều lần → cache ngắn trên CDN.
      'cache-control': 'public, max-age=0',
      'vercel-cdn-cache-control': 'max-age=300, stale-while-revalidate=600',
    },
  });
});

const NO_INDEX = /^\/(admin|gio-hang|tra-cuu-don-hang)(\/|$)/;

/** index.html gốc (đúng bản khách nhận), đọc 1 lần mỗi máy chủ. */
let shell: { at: number; html: string } | null = null;
async function loadShell(origin: string): Promise<string> {
  if (shell && Date.now() - shell.at < 10 * 60_000) return shell.html;
  const res = await fetch(origin + '/index.html', { headers: { 'user-agent': 'fumo-shell' } });
  if (!res.ok) throw new Error('index.html ' + res.status);
  const html = await res.text();
  shell = { at: Date.now(), html };
  return html;
}

function searchPage(origin: string, m: { title: string; desc: string; image: string; type: string; canonical: string; shop: string }): Promise<Response> | Response {
  const headers = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'public, max-age=0',
    'vercel-cdn-cache-control': 'max-age=300, stale-while-revalidate=600',
  };
  return loadShell(origin)
    .then((html) => {
      const path = new URL(m.canonical).pathname;
      // Bỏ thẻ dựng sẵn mặc định của index.html (sẽ thay bằng thẻ của đúng trang này).
      html = html.replace(/<(meta|link)[^>]*\sdata-ssr[^>]*>\s*/gi, '');
      const meta = (attr: string, key: string, val: string) => {
        const re = new RegExp(`<meta\\s+${attr}="${key}"[^>]*>`, 'i');
        const tag = `<meta ${attr}="${key}" content="${esc(val)}">`;
        html = re.test(html) ? html.replace(re, () => tag) : html.replace('</head>', () => tag + '\n</head>');
      };
      html = html.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${esc(m.title)}</title>`);
      meta('name', 'description', m.desc);
      meta('property', 'og:type', m.type === 'product' ? 'product' : m.type);
      meta('property', 'og:title', m.title);
      meta('property', 'og:description', m.desc);
      meta('property', 'og:url', m.canonical);
      meta('property', 'og:image', m.image);
      meta('name', 'twitter:image', m.image);
      const ld = {
        '@context': 'https://schema.org',
        '@type': m.type === 'article' ? 'Article' : 'WebPage',
        ...(m.type === 'article' ? { headline: m.title } : { name: m.title }),
        url: m.canonical,
        description: m.desc,
        image: [m.image],
        thumbnailUrl: m.image,
        ...(m.type === 'article' ? {} : { primaryImageOfPage: { '@type': 'ImageObject', url: m.image } }),
        inLanguage: 'vi-VN',
      };
      const extra = [
        `<link rel="canonical" href="${esc(m.canonical)}" data-ssr>`,
        `<meta name="robots" content="${NO_INDEX.test(path) ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1'}" data-ssr>`,
        `<meta name="thumbnail" content="${esc(m.image)}" data-ssr>`,
        `<link rel="image_src" href="${esc(m.image)}" data-ssr>`,
        `<script type="application/ld+json" data-ssr>${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
      ].join('\n');
      return new Response(html.replace('</head>', () => extra + '\n</head>'), { status: 200, headers });
    })
    .catch(() => fetch(origin + '/index.html').then((r) => new Response(r.body, { status: 200, headers })));
}

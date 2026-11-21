import { DOCUMENT, Injectable, effect, inject, signal } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { SEO_PAGES, SiteSeo, pageSeoOf, siteSeoOf } from '../models/site-seo';
import { SettingsService } from '../services/settings.service';
import { isImageIcon } from '../shared/icon';

/** Ký tự ngăn tiêu đề trang / tên shop (Admin → Khai báo → Khai báo chung). */
export const titleSep = { value: '—' };

const ATTR = 'data-page-seo';
const publicImage = (src: string, origin: string) =>
  !src || src.startsWith('data:') ? '' : /^https?:\/\//i.test(src) ? src : origin + '/' + src.replace(/^\/+/, '');

/** Favicon từ emoji → ảnh SVG. */
const emojiFavicon = (e: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="88">${e}</text></svg>`)}`;

/**
 * Áp dụng khai báo SEO của các trang tĩnh trên menu (Trang chủ, Sản phẩm, Tin tức, Liên hệ...):
 * mô tả meta, robots, canonical, Open Graph, JSON-LD (WebPage, Breadcrumb; Trang chủ có thêm Tổ chức + WebSite/ô tìm kiếm).
 * Trang sản phẩm / bài viết đã có SeoMetaService riêng nên không đụng tới. Đổi favicon theo khai báo.
 */
@Injectable({ providedIn: 'root' })
export class PageSeoService {
  private readonly router = inject(Router);
  private readonly meta = inject(Meta);
  private readonly doc = inject(DOCUMENT);
  private readonly settings = inject(SettingsService).settings;
  private readonly path = signal(this.router.url.split(/[?#]/)[0]);
  /** Query hiện tại (để canonical trang danh mục giữ ?danhMuc=...). */
  private readonly query = signal(this.router.url.split('#')[0].split('?')[1] ?? '');
  private defaultDescription: string | null = null;
  private faviconDefaults: { el: HTMLLinkElement; href: string; type: string }[] | null = null;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    // Thẻ dựng sẵn cho bot tìm kiếm (index.html / máy chủ) → bỏ, dịch vụ SEO tự gắn lại theo trang.
    this.doc.head.querySelectorAll('[data-ssr]').forEach((el) => el.remove());
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      const u = (e as NavigationEnd).urlAfterRedirects.split('#')[0];
      this.path.set(u.split('?')[0] || '/');
      this.query.set(u.split('?')[1] ?? '');
    });
    effect(() => {
      const s = this.settings();
      const seo = siteSeoOf(s);
      titleSep.value = seo.titleSep || '—';
      this.applyFavicon(seo.favicon);
      this.apply(this.path(), seo, s.shopName, this.query());
    });
  }

  private applyFavicon(icon: string): void {
    const links = [...this.doc.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')];
    this.faviconDefaults ??= links.map((el) => ({ el, href: el.getAttribute('href') ?? '', type: el.type }));
    const v = icon.trim();
    const href = !v ? '' : isImageIcon(v) ? v : emojiFavicon(v);
    for (const d of this.faviconDefaults) {
      d.el.setAttribute('href', href || d.href);
      if (href) d.el.removeAttribute('type');
      else if (d.type) d.el.type = d.type;
      if (href) d.el.removeAttribute('sizes');
    }
  }

  private applyFallback(path: string, origin: string): void {
    // Sản phẩm / bài viết đã có canonical riêng (SeoMetaService).
    if (/^\/(san-pham|tin-tuc)\/[^/]+$/.test(path) || path.startsWith('/admin')) return;
    const canonical = this.doc.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = origin + path;
    canonical.setAttribute(ATTR, '');
    this.doc.head.appendChild(canonical);
    if (NOINDEX_PATHS.has(path)) {
      this.meta.removeTag('name="robots"');
      this.meta.addTag({ name: 'robots', content: 'noindex, follow' }, true)?.setAttribute(ATTR, '');
    }
  }

  private clearOwn(): void {
    this.doc.head.querySelectorAll(`[${ATTR}]`).forEach((el) => el.remove());
  }

  private apply(path: string, seo: SiteSeo, shop: string, query = ''): void {
    const def = SEO_PAGES.find((p) => p.path === path);
    this.clearOwn();
    this.defaultDescription ??= this.meta.getTag('name="description"')?.content ?? '';
    const origin = this.doc.location.origin;
    if (!def) return this.applyFallback(path, origin);
    const page = pageSeoOf(seo, path);
    // Trang danh mục (/san-pham?danhMuc=..., /tin-tuc?danhMuc=...) là trang riêng → canonical giữ tham số danh mục.
    const cat = new URLSearchParams(query).get('danhMuc');
    const url = origin + (path === '/' ? '/' : path) + (cat && (path === '/san-pham' || path === '/tin-tuc') ? '?danhMuc=' + encodeURIComponent(cat) : '');
    const title = page.title.trim() || (path === '/' ? shop : `${def.label} ${seo.titleSep || '—'} ${shop}`);
    const description = page.description.trim() || seo.defaultDescription.trim() || this.defaultDescription || '';
    const image = publicImage(page.ogImage || seo.defaultOgImage, origin) || `${origin}/og/og-default.jpg`;

    if (description) this.meta.updateTag({ name: 'description', content: description });
    // Bỏ thẻ trùng (thẻ mặc định trong index.html) rồi thêm thẻ của trang.
    const replaced = ['name="robots"', 'property="og:type"', 'property="og:title"', 'property="og:description"', 'property="og:url"', 'property="og:image"',
      'name="twitter:title"', 'name="twitter:description"', 'name="twitter:image"', 'name="keywords"', 'name="thumbnail"'];
    for (const sel of replaced) this.meta.removeTag(sel);
    const robots = [page.noindex ? 'noindex' : 'index', page.nofollow ? 'nofollow' : 'follow'];
    if (!page.noindex) robots.push('max-image-preview:large', 'max-snippet:-1');
    const tags: Record<string, string>[] = [
      { name: 'robots', content: robots.join(', ') },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: title },
      { property: 'og:url', content: url },
      { property: 'og:image', content: image },
      { name: 'twitter:title', content: title },
      { name: 'twitter:image', content: image },
    ];
    if (description) tags.push({ property: 'og:description', content: description }, { name: 'twitter:description', content: description });
    if (page.focusKeyword.trim()) tags.push({ name: 'keywords', content: page.focusKeyword.trim() });
    tags.push({ name: 'thumbnail', content: image });
    for (const t of tags) {
      const el = this.meta.addTag(t, true);
      el?.setAttribute(ATTR, '');
    }
    const canonical = this.doc.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = (!cat && page.canonical.trim()) || url;
    canonical.setAttribute(ATTR, '');
    this.doc.head.appendChild(canonical);

    const ld = this.doc.createElement('script');
    ld.type = 'application/ld+json';
    ld.setAttribute(ATTR, '');
    ld.textContent = JSON.stringify(buildPageSchema({ path, label: def.label, title, description, url, origin, seo, settings: this.settings(), image })).replace(/</g, '\\u003c');
    this.doc.head.appendChild(ld);
  }
}

/** Trang ngoài danh sách khai báo / sản phẩm / bài viết (vd. từng minigame, giỏ hàng): vẫn có canonical; giỏ hàng noindex. */
const NOINDEX_PATHS = new Set(['/gio-hang']);

export interface PageSchemaInput {
  path: string;
  label: string;
  title: string;
  description: string;
  url: string;
  origin: string;
  seo: SiteSeo;
  /** Ảnh đại diện trang (thumbnail trên Google). */
  image?: string;
  settings: { shopName: string; contactPhone?: string; contactEmail?: string; contactAddress?: string; facebookUrl?: string; tiktokUrl?: string; shopeeUrl?: string };
}

/** JSON-LD cho trang tĩnh: WebPage (+ Breadcrumb). Trang chủ: thêm Tổ chức (Organization / Store...) và WebSite (ô tìm kiếm). */
export function buildPageSchema({ path, label, title, description, url, origin, seo, settings: s, image }: PageSchemaInput): object {
  const page = pageSeoOf(seo, path);
  const orgId = `${origin}/#organization`;
  const graph: object[] = [
    {
      '@type': page.schemaType,
      '@id': `${url}#webpage`,
      url,
      name: title,
      ...(description ? { description } : {}),
      ...(image ? { primaryImageOfPage: { '@type': 'ImageObject', url: image }, thumbnailUrl: image, image } : {}),
      inLanguage: 'vi-VN',
      isPartOf: { '@id': `${origin}/#website` },
      publisher: { '@id': orgId },
    },
  ];
  if (path !== '/') {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: label, item: url },
      ],
    });
  } else {
    const sameAs = [s.facebookUrl, s.tiktokUrl, s.shopeeUrl, ...seo.sameAs.split(/\s+/)].map((x) => (x ?? '').trim()).filter((x) => /^https?:\/\//.test(x));
    const logo = publicImage(seo.orgLogo, origin);
    graph.push({
      '@type': seo.orgType,
      '@id': orgId,
      name: seo.orgName.trim() || s.shopName,
      url: `${origin}/`,
      ...(logo ? { logo, image: logo } : {}),
      ...(seo.orgDescription.trim() ? { description: seo.orgDescription.trim() } : {}),
      ...(s.contactPhone ? { telephone: s.contactPhone } : {}),
      ...(s.contactEmail ? { email: s.contactEmail } : {}),
      ...(s.contactAddress && seo.orgType !== 'Organization' && seo.orgType !== 'OnlineStore'
        ? { address: { '@type': 'PostalAddress', streetAddress: s.contactAddress, addressCountry: 'VN' } }
        : {}),
      ...(seo.priceRange.trim() && seo.orgType !== 'Organization' ? { priceRange: seo.priceRange.trim() } : {}),
      ...(sameAs.length ? { sameAs } : {}),
    });
    graph.push({
      '@type': 'WebSite',
      '@id': `${origin}/#website`,
      url: `${origin}/`,
      name: s.shopName,
      inLanguage: 'vi-VN',
      publisher: { '@id': orgId },
      ...(seo.searchBox
        ? { potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${origin}/san-pham?q={search_term_string}` }, 'query-input': 'required name=search_term_string' } }
        : {}),
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

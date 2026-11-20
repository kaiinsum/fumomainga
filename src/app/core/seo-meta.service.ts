import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { EMPTY_SEO, NewsPost, newsPath } from '../models/news';
import { Product, finalPrice, productPath, productSeoOf, variantsOf } from '../models/product';
import { effectiveProductSeo, effectiveSeo } from '../shared/seo';

export interface ArticleSchemaInput {
  post: NewsPost;
  url: string;
  shopName: string;
  logo?: string;
}

/** Ảnh dạng data: (ảnh tải lên lưu trong trình duyệt) không dùng được cho Google/Facebook. */
const publicImage = (src: string) => (/^https?:\/\//i.test(src) ? src : '');

/** JSON-LD schema.org cho bài viết (Article / NewsArticle / BlogPosting) + Breadcrumb. */
export function buildArticleSchema({ post, url, shopName, logo }: ArticleSchemaInput): object {
  const seo = post.seo;
  const { title, description } = effectiveSeo({ ...post, seo: seo ?? EMPTY_SEO });
  const origin = new URL(url).origin;
  const image = publicImage(post.cover);
  const org = { '@type': 'Organization', name: shopName, url: origin, ...(logo ? { logo } : {}) };
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': seo?.schemaType ?? 'NewsArticle',
        '@id': `${url}#article`,
        headline: title.slice(0, 110),
        description,
        ...(image ? { image: [image] } : {}),
        datePublished: new Date(post.createdAt).toISOString(),
        dateModified: new Date(post.updatedAt).toISOString(),
        author: org,
        publisher: org,
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        inLanguage: 'vi-VN',
        ...(seo?.focusKeyword ? { keywords: seo.focusKeyword } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: `${origin}/` },
          { '@type': 'ListItem', position: 2, name: 'Tin tức', item: `${origin}/tin-tuc` },
          { '@type': 'ListItem', position: 3, name: post.title, item: url },
        ],
      },
    ],
  };
}

export interface ProductSchemaInput {
  product: Product;
  url: string;
  shopName: string;
  logo?: string;
}

/**
 * JSON-LD cho trang sản phẩm: Product (+ Offer / AggregateOffer), bài viết khai báo kèm
 * (Article / BlogPosting / Review) nếu bật, và Breadcrumb Trang chủ › Sản phẩm › Danh mục › Sản phẩm.
 */
export function buildProductSchema({ product: p, url, shopName, logo }: ProductSchemaInput): object {
  const seo = productSeoOf(p);
  const { title, description } = effectiveProductSeo({ name: p.name, description: p.description, seo });
  const origin = new URL(url).origin;
  const images = p.images.map(publicImage).filter(Boolean);
  const org = { '@type': 'Organization', name: shopName, url: origin, ...(logo ? { logo } : {}) };
  const availability = `https://schema.org/${p.inStock ? 'InStock' : 'OutOfStock'}`;
  const condition = `https://schema.org/${seo.condition}`;
  const prices = (variantsOf(p).length ? variantsOf(p) : [p]).map((v) => finalPrice(v));
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const offers =
    low !== high
      ? { '@type': 'AggregateOffer', priceCurrency: 'VND', lowPrice: low, highPrice: high, offerCount: prices.length, availability, itemCondition: condition, url, seller: org }
      : { '@type': 'Offer', priceCurrency: 'VND', price: low, availability, itemCondition: condition, url, seller: org };
  const graph: object[] = [];
  if (seo.productSchema) {
    graph.push({
      '@type': 'Product',
      '@id': `${url}#product`,
      name: p.name,
      description,
      ...(images.length ? { image: images } : {}),
      sku: seo.sku || p.id,
      brand: { '@type': 'Brand', name: seo.brand || shopName },
      category: p.category,
      ...(seo.focusKeyword || p.tags.length ? { keywords: [seo.focusKeyword, ...p.tags].filter(Boolean).join(', ') } : {}),
      offers,
    });
  }
  if (seo.article) {
    const author = seo.author ? { '@type': 'Person', name: seo.author } : org;
    const date = new Date(p.releasedAt || p.createdAt);
    const iso = Number.isNaN(date.getTime()) ? new Date(p.createdAt).toISOString() : date.toISOString();
    const itemRef = seo.productSchema ? { '@id': `${url}#product` } : { '@type': 'Product', name: p.name };
    graph.push({
      '@type': seo.articleType,
      '@id': `${url}#article`,
      ...(seo.articleType === 'Review'
        ? {
            name: (seo.headline || title).slice(0, 110),
            itemReviewed: itemRef,
            reviewRating: { '@type': 'Rating', ratingValue: Math.min(5, Math.max(1, seo.rating || 5)), bestRating: 5, worstRating: 1 },
            reviewBody: description,
          }
        : { headline: (seo.headline || title).slice(0, 110), description, about: itemRef }),
      ...(images.length ? { image: images.slice(0, 3) } : {}),
      datePublished: iso,
      dateModified: iso,
      author,
      publisher: org,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      inLanguage: 'vi-VN',
      ...(seo.focusKeyword ? { keywords: seo.focusKeyword } : {}),
    });
  }
  graph.push({
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: `${origin}/` },
      { '@type': 'ListItem', position: 2, name: 'Sản phẩm', item: `${origin}/san-pham` },
      { '@type': 'ListItem', position: 3, name: p.category, item: `${origin}/san-pham?danhMuc=${encodeURIComponent(p.category)}` },
      { '@type': 'ListItem', position: 4, name: p.name, item: url },
    ],
  });
  return { '@context': 'https://schema.org', '@graph': graph };
}

const MANAGED_META = [
  'property="product:price:amount"',
  'property="product:price:currency"',
  'property="product:availability"',
  'name="robots"',
  'property="og:type"',
  'property="og:title"',
  'property="og:description"',
  'property="og:url"',
  'property="og:image"',
  'property="og:site_name"',
  'property="og:locale"',
  'property="article:published_time"',
  'property="article:modified_time"',
  'property="article:tag"',
  'name="twitter:card"',
  'name="twitter:title"',
  'name="twitter:description"',
  'name="twitter:image"',
  'name="keywords"',
];

/**
 * Ghi các thẻ SEO vào <head> cho bài viết (meta description, robots, canonical, Open Graph,
 * Twitter Card, JSON-LD) và khôi phục lại khi rời trang.
 */
@Injectable({ providedIn: 'root' })
export class SeoMetaService {
  private readonly meta = inject(Meta);
  private readonly doc = inject(DOCUMENT);
  private defaultDescription: string | null = null;

  applyArticle(post: NewsPost, shopName: string): void {
    this.clear();
    const seo = post.seo;
    const origin = this.doc.location.origin;
    const url = origin + newsPath(post);
    const { title, description } = effectiveSeo({ ...post, seo: seo ?? EMPTY_SEO });
    const image = publicImage(post.cover);

    this.defaultDescription ??= this.meta.getTag('name="description"')?.content ?? '';
    this.meta.updateTag({ name: 'description', content: description });

    const robots = [seo?.noindex ? 'noindex' : 'index', seo?.nofollow ? 'nofollow' : 'follow'];
    if (!seo?.noindex) robots.push('max-image-preview:large', 'max-snippet:-1');
    const tags: Record<string, string>[] = [
      { name: 'robots', content: robots.join(', ') },
      { property: 'og:type', content: 'article' },
      { property: 'og:locale', content: 'vi_VN' },
      { property: 'og:site_name', content: shopName },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
      { property: 'article:published_time', content: new Date(post.createdAt).toISOString() },
      { property: 'article:modified_time', content: new Date(post.updatedAt).toISOString() },
      { name: 'twitter:card', content: image ? 'summary_large_image' : 'summary' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
    ];
    if (image) tags.push({ property: 'og:image', content: image }, { name: 'twitter:image', content: image });
    if (seo?.focusKeyword) {
      tags.push({ property: 'article:tag', content: seo.focusKeyword }, { name: 'keywords', content: seo.focusKeyword });
    }
    this.meta.addTags(tags);

    const canonical = this.doc.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = seo?.canonical || url;
    canonical.setAttribute('data-seo', '');
    this.doc.head.appendChild(canonical);

    const ld = this.doc.createElement('script');
    ld.type = 'application/ld+json';
    ld.setAttribute('data-seo', '');
    ld.textContent = JSON.stringify(buildArticleSchema({ post, url, shopName })).replace(/</g, '\\u003c');
    this.doc.head.appendChild(ld);
  }

  /** Thẻ SEO cho trang sản phẩm (meta, robots, canonical, Open Graph, JSON-LD Product / bài viết). */
  applyProduct(p: Product, shopName: string): void {
    this.clear();
    const seo = productSeoOf(p);
    const origin = this.doc.location.origin;
    const url = origin + productPath(p);
    const { title, description } = effectiveProductSeo({ name: p.name, description: p.description, seo });
    const image = p.images.map(publicImage).find(Boolean) ?? '';

    this.defaultDescription ??= this.meta.getTag('name="description"')?.content ?? '';
    this.meta.updateTag({ name: 'description', content: description });

    const robots = [seo.noindex ? 'noindex' : 'index', seo.nofollow ? 'nofollow' : 'follow'];
    if (!seo.noindex) robots.push('max-image-preview:large', 'max-snippet:-1');
    const tags: Record<string, string>[] = [
      { name: 'robots', content: robots.join(', ') },
      { property: 'og:type', content: 'product' },
      { property: 'og:locale', content: 'vi_VN' },
      { property: 'og:site_name', content: shopName },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
      { property: 'product:price:amount', content: String(finalPrice(p)) },
      { property: 'product:price:currency', content: 'VND' },
      { property: 'product:availability', content: p.inStock ? 'in stock' : 'out of stock' },
      { name: 'twitter:card', content: image ? 'summary_large_image' : 'summary' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
    ];
    if (image) tags.push({ property: 'og:image', content: image }, { name: 'twitter:image', content: image });
    if (seo.focusKeyword) tags.push({ name: 'keywords', content: [seo.focusKeyword, ...p.tags].join(', ') });
    this.meta.addTags(tags);

    const canonical = this.doc.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = seo.canonical || url;
    canonical.setAttribute('data-seo', '');
    this.doc.head.appendChild(canonical);

    const ld = this.doc.createElement('script');
    ld.type = 'application/ld+json';
    ld.setAttribute('data-seo', '');
    ld.textContent = JSON.stringify(buildProductSchema({ product: p, url, shopName })).replace(/</g, '\\u003c');
    this.doc.head.appendChild(ld);
  }

  /** Gỡ mọi thẻ đã thêm, trả lại mô tả mặc định của site. */
  clear(): void {
    for (const sel of MANAGED_META) this.meta.removeTag(sel);
    this.doc.head.querySelectorAll('[data-seo]').forEach((el) => el.remove());
    if (this.defaultDescription !== null) this.meta.updateTag({ name: 'description', content: this.defaultDescription });
  }
}

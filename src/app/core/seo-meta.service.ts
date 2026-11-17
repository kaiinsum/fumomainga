import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { EMPTY_SEO, NewsPost, newsPath } from '../models/news';
import { effectiveSeo } from '../shared/seo';

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

const MANAGED_META = [
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

  /** Gỡ mọi thẻ đã thêm, trả lại mô tả mặc định của site. */
  clear(): void {
    for (const sel of MANAGED_META) this.meta.removeTag(sel);
    this.doc.head.querySelectorAll('[data-seo]').forEach((el) => el.remove());
    if (this.defaultDescription !== null) this.meta.updateTag({ name: 'description', content: this.defaultDescription });
  }
}

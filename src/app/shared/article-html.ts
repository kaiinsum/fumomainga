import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { renderMarkdown } from './markdown';

/** Kiểu soạn nội dung bài viết: 'markdown' = soạn thường (## tiêu đề, **đậm**...), 'html' = dán / viết mã HTML. */
export type ContentFormat = 'markdown' | 'html';

const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark', 'small', 'sub', 'sup',
  'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'a', 'img', 'figure', 'figcaption', 'picture', 'source',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col', 'div', 'span', 'section', 'article',
  'aside', 'header', 'footer', 'details', 'summary', 'video', 'audio', 'iframe', 'abbr', 'cite', 'q', 'kbd', 'time',
]);
const ALLOWED_ATTRS = new Set([
  'href', 'src', 'srcset', 'sizes', 'alt', 'title', 'width', 'height', 'class', 'id', 'style', 'target', 'rel', 'loading',
  'colspan', 'rowspan', 'scope', 'align', 'controls', 'poster', 'preload', 'muted', 'loop', 'playsinline', 'type', 'media',
  'allow', 'allowfullscreen', 'frameborder', 'referrerpolicy', 'open', 'datetime', 'start', 'reversed', 'lang', 'dir',
]);
/** Chỉ cho nhúng khung (iframe) từ các nguồn quen thuộc. */
const IFRAME_HOSTS = /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|player\.vimeo\.com|maps\.google\.com|www\.google\.com\/maps|open\.spotify\.com|www\.facebook\.com\/plugins|www\.tiktok\.com\/embed)/i;
const SAFE_URL = /^(https?:|mailto:|tel:|\/|#|\.\/|data:image\/(png|jpe?g|gif|webp|avif);)/i;

/**
 * Lọc HTML bài viết admin dán vào: giữ định dạng (bảng, ảnh, video YouTube, style...), bỏ mọi thứ có thể chạy mã
 * (script, on*=, javascript:, form, object...). Chạy trong trình duyệt bằng DOMParser.
 */
export function sanitizeArticleHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html ?? ''}</body>`, 'text/html');
  const walk = (node: Element) => {
    for (const el of [...node.children]) {
      const tag = el.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        // Thẻ nguy hiểm → bỏ hẳn; thẻ lạ khác → giữ phần chữ bên trong.
        if (/^(script|style|noscript|object|embed|form|input|button|textarea|select|link|meta|base|frame|frameset|applet|svg|math|template)$/.test(tag)) el.remove();
        else {
          walk(el);
          el.replaceWith(...el.childNodes);
        }
        continue;
      }
      for (const a of [...el.attributes]) {
        const name = a.name.toLowerCase();
        const val = a.value.trim();
        if (!ALLOWED_ATTRS.has(name) && !name.startsWith('data-') && !name.startsWith('aria-')) el.removeAttribute(a.name);
        else if ((name === 'href' || name === 'src' || name === 'poster') && !SAFE_URL.test(val)) el.removeAttribute(a.name);
        else if (name === 'srcset' && /javascript:/i.test(val)) el.removeAttribute(a.name);
        else if (name === 'style' && /(expression\s*\(|javascript:|url\s*\(\s*['"]?\s*javascript:|behavior\s*:|-moz-binding)/i.test(val)) el.removeAttribute(a.name);
      }
      if (tag === 'iframe' && !IFRAME_HOSTS.test(el.getAttribute('src') ?? '')) {
        el.remove();
        continue;
      }
      if (tag === 'a' && el.getAttribute('target') === '_blank') el.setAttribute('rel', 'noopener noreferrer');
      if (tag === 'img' && !el.hasAttribute('loading')) el.setAttribute('loading', 'lazy');
      if (tag === 'img' && !el.hasAttribute('alt')) el.setAttribute('alt', '');
      // Tiêu đề bài đã là H1 → H1 trong nội dung hạ thành H2 (mỗi trang chỉ 1 H1).
      if (tag === 'h1') {
        const h2 = doc.createElement('h2');
        for (const at of [...el.attributes]) h2.setAttribute(at.name, at.value);
        h2.append(...el.childNodes);
        el.replaceWith(h2);
        walk(h2);
        continue;
      }
      walk(el);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

/** HTML → dạng "markdown giản lược" chỉ để chấm SEO (tiêu đề H2/H3, ảnh + alt, link) và lấy chữ. */
export function htmlToSeoMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html ?? ''}</body>`, 'text/html');
  doc.body.querySelectorAll('script, style').forEach((e) => e.remove());
  doc.body.querySelectorAll('h2, h3').forEach((h) => h.replaceWith(`\n\n${h.tagName === 'H2' ? '##' : '###'} ${h.textContent?.trim() ?? ''}\n\n`));
  doc.body.querySelectorAll('img').forEach((i) => i.replaceWith(` ![${i.getAttribute('alt') ?? ''}](${i.getAttribute('src') ?? ''}) `));
  doc.body.querySelectorAll('a').forEach((a) => a.replaceWith(`[${a.textContent?.trim() ?? ''}](${a.getAttribute('href') ?? ''})`));
  doc.body.querySelectorAll('p, div, li, br, tr, h1, h4, h5, h6, blockquote').forEach((b) => b.append('\n'));
  return (doc.body.textContent ?? '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Nội dung bài theo dạng Markdown (để chấm SEO / lấy chữ), bất kể bài soạn kiểu gì. */
export function contentAsMarkdown(p: { content: string; format?: ContentFormat }): string {
  return p.format === 'html' ? htmlToSeoMarkdown(p.content) : p.content;
}

/** Hiển thị nội dung bài: soạn thường → Markdown; HTML → lọc an toàn. */
@Pipe({ name: 'articleHtml' })
export class ArticleHtmlPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);
  transform(content: string | null | undefined, format: ContentFormat | undefined = 'markdown'): SafeHtml {
    const html = format === 'html' ? sanitizeArticleHtml(content ?? '') : renderMarkdown(content ?? '');
    // Đã tự lọc ở trên (giữ được iframe YouTube / style) nên báo Angular tin tưởng.
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}

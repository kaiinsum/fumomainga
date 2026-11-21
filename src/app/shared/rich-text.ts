import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Định dạng chữ đơn giản cho mô tả sản phẩm (admin bấm nút B / I / U / màu trên thanh công cụ):
 *   **đậm**   *nghiêng*   __gạch chân__   [color=#e91e63]chữ màu[/color]   [chữ](https://link)
 * Trang khách hiển thị thành chữ đã định dạng; Google / chia sẻ link / tìm kiếm dùng chữ trơn (bỏ ký hiệu).
 */

/** Màu hợp lệ: #rgb / #rrggbb hoặc tên màu tiếng Anh đơn giản (red, blue...). */
const COLOR = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|[a-z]{3,20})$/i;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Mô tả có định dạng → HTML an toàn (mọi thẻ HTML gõ tay đều bị vô hiệu, chỉ còn đậm / nghiêng / gạch chân / màu). */
export function richToHtml(src: string | null | undefined): string {
  let s = escapeHtml(src ?? '');
  // Màu (cho phép lồng bên trong định dạng khác) - lặp để xử lý lồng nhau.
  for (let i = 0; i < 5; i++) {
    const next = s.replace(/\[color=([^\]\s]{1,20})\]([\s\S]*?)\[\/color\]/gi, (m, c: string, body: string) =>
      COLOR.test(c) ? `<span style="color:${c}">${body}</span>` : body,
    );
    if (next === s) break;
    s = next;
  }
  // Link: [chữ](https://...) hoặc [chữ](/san-pham/...) - link ngoài mở tab mới.
  s = s.replace(/\[([^\]\n]+)\]\(((?:https?:\/\/|\/)[^\s)"]+)\)/g, (_m, text: string, url: string) => {
    const ext = !url.startsWith('/');
    return `<a href="${url}"${ext ? ' target="_blank" rel="noopener nofollow"' : ''}>${text}</a>`;
  });
  s = s
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?=\S)([\s\S]*?\S)__/g, '<u>$1</u>')
    .replace(/(^|[^*])\*(?=\S)([^*\n]*?\S)\*(?!\*)/g, '$1<em>$2</em>');
  return s;
}

/** Bỏ ký hiệu định dạng → chữ trơn (cho mô tả meta, schema, tìm kiếm, chấm điểm SEO). */
export function richToText(src: string | null | undefined): string {
  return (src ?? '')
    .replace(/\[([^\]\n]+)\]\(((?:https?:\/\/|\/)[^\s)"]+)\)/g, '$1')
    .replace(/\[color=[^\]]*\]/gi, '')
    .replace(/\[\/color\]/gi, '')
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '$1')
    .replace(/__(?=\S)([\s\S]*?\S)__/g, '$1')
    .replace(/(^|[^*])\*(?=\S)([^*\n]*?\S)\*(?!\*)/g, '$1$2');
}

/** {{ p.description | richText }} → dùng với [innerHTML]. */
@Pipe({ name: 'richText' })
export class RichTextPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);
  transform(v: string | null | undefined): SafeHtml {
    // Đã tự thoát HTML ở trên, chỉ sinh <strong>/<em>/<u>/<span style="color">.
    return this.sanitizer.bypassSecurityTrustHtml(richToHtml(v));
  }
}

/** Bảng màu gợi ý trên thanh công cụ. */
export const RICH_COLORS = ['#e91e63', '#d63638', '#e26f1b', '#dba617', '#00a32a', '#0aa5a5', '#2271b1', '#8c5fd6', '#646970'];

/**
 * Bọc đoạn đang chọn trong ô soạn thảo bằng ký hiệu định dạng (bấm lần nữa khi đã bọc → gỡ ra).
 * Trả về giá trị mới + vị trí chọn mới.
 */
export function wrapSelection(value: string, start: number, end: number, open: string, close: string): { value: string; start: number; end: number } {
  const sel = value.slice(start, end);
  // Đã bọc sẵn → gỡ.
  if (value.slice(start - open.length, start) === open && value.slice(end, end + close.length) === close) {
    return { value: value.slice(0, start - open.length) + sel + value.slice(end + close.length), start: start - open.length, end: end - open.length };
  }
  if (sel.startsWith(open) && sel.endsWith(close) && sel.length >= open.length + close.length) {
    const inner = sel.slice(open.length, sel.length - close.length);
    return { value: value.slice(0, start) + inner + value.slice(end), start, end: start + inner.length };
  }
  const text = sel || 'chữ';
  return { value: value.slice(0, start) + open + text + close + value.slice(end), start: start + open.length, end: start + open.length + text.length };
}

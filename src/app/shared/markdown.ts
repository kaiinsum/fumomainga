import { Pipe, PipeTransform } from '@angular/core';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function safeUrl(url: string): string {
  return /^(https?:|\/|#|data:image\/)/i.test(url) ? url : '#';
}

function inline(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => `<img src="${safeUrl(url)}" alt="${alt}" loading="lazy">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) => `<a href="${safeUrl(url)}">${text}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

/**
 * Bộ chuyển Markdown tối giản cho bài viết: ## tiêu đề, **đậm**, *nghiêng*, [link](url),
 * ![ảnh](url), danh sách "- ", "> trích dẫn". HTML gốc luôn bị escape.
 */
export function renderMarkdown(src: string): string {
  const out: string[] = [];
  let list: string[] = [];
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list.length) out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join('')}</ul>`);
    list = [];
  };

  for (const raw of escapeHtml(src ?? '').split(/\r?\n/)) {
    const line = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if ((m = line.match(/^(#{2,3})\s+(.*)$/))) {
      flushPara();
      flushList();
      const tag = m[1].length === 2 ? 'h2' : 'h3';
      out.push(`<${tag}>${inline(m[2])}</${tag}>`);
    } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      flushPara();
      list.push(m[1]);
    } else if ((m = line.match(/^&gt;\s?(.*)$/))) {
      flushPara();
      flushList();
      out.push(`<blockquote>${inline(m[1])}</blockquote>`);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return out.join('\n');
}

@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return renderMarkdown(value ?? '');
  }
}

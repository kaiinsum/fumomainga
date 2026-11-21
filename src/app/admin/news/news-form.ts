import { Component, ElementRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { animate } from 'animejs';
import { buildArticleSchema } from '../../core/seo-meta.service';
import { EMPTY_SEO, NewsInput, NewsPost, NewsSchemaType, NewsSeo, NewsStatus, newsPath } from '../../models/news';
import { NewsService } from '../../services/news.service';
import { SettingsService } from '../../services/settings.service';
import { fileToResizedDataUrl } from '../../shared/image-utils';
import { renderMarkdown } from '../../shared/markdown';
import { ArticleHtmlPipe, ContentFormat, contentAsMarkdown, htmlToSeoMarkdown } from '../../shared/article-html';
import { SEO_LIMITS, SeoReport, analyzeSeo, markdownToText, scoreLevel, slugify } from '../../shared/seo';
import { AdminToastService } from '../toast.service';

interface ToolButton {
  label: string;
  title: string;
  before: string;
  after?: string;
  placeholder: string;
  block?: boolean;
}

@Component({
  selector: 'app-admin-news-form',
  imports: [FormsModule, RouterLink, DatePipe, ArticleHtmlPipe],
  templateUrl: './news-form.html',
  styleUrl: './news-form.scss',
})
export class AdminNewsForm {
  readonly id = input<string>();

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly service = inject(NewsService);
  private readonly router = inject(Router);
  private readonly toast = inject(AdminToastService);
  readonly settings = inject(SettingsService).settings;

  readonly editing = computed(() => {
    const id = this.id();
    return id ? this.service.getById(id) : undefined;
  });

  title = '';
  excerpt = '';
  content = '';
  status: NewsStatus = 'draft';
  seo: NewsSeo = { ...EMPTY_SEO };
  readonly seoTab = signal<'general' | 'advanced' | 'schema'>('general');
  readonly limits = SEO_LIMITS;
  readonly origin = location.origin;
  readonly siteHost = location.host;
  readonly path = newsPath;
  readonly scoreLevel = scoreLevel;
  readonly schemaTypes: { value: NewsSchemaType; label: string }[] = [
    { value: 'NewsArticle', label: 'NewsArticle — Tin tức' },
    { value: 'BlogPosting', label: 'BlogPosting — Bài blog' },
    { value: 'Article', label: 'Article — Bài viết chung' },
  ];
  readonly cover = signal('');
  readonly coverUrl = signal('');
  readonly mode = signal<'write' | 'preview'>('write');
  /** Soạn thường (Markdown) hoặc viết / dán mã HTML. */
  readonly format = signal<ContentFormat>('markdown');
  readonly submitted = signal(false);
  readonly uploading = signal(false);

  readonly mdHint = 'Viết nội dung bài... Hỗ trợ: ## tiêu đề, **đậm**, *nghiêng*, - danh sách, [link](url), > trích dẫn';
  readonly htmlHint = 'Dán hoặc viết mã HTML... VD: <h2>Tiêu đề</h2><p>Nội dung</p> — hỗ trợ bảng, ảnh, màu chữ, video YouTube (script sẽ tự bị bỏ).';
  /** Nút chèn nhanh khi soạn HTML. */
  readonly htmlTools: ToolButton[] = [
    { label: 'H2', title: 'Tiêu đề lớn', before: '<h2>', after: '</h2>', placeholder: 'Tiêu đề', block: true },
    { label: 'H3', title: 'Tiêu đề nhỏ', before: '<h3>', after: '</h3>', placeholder: 'Tiêu đề nhỏ', block: true },
    { label: '¶', title: 'Đoạn văn', before: '<p>', after: '</p>', placeholder: 'Nội dung đoạn văn', block: true },
    { label: 'B', title: 'In đậm', before: '<strong>', after: '</strong>', placeholder: 'chữ đậm' },
    { label: 'I', title: 'In nghiêng', before: '<em>', after: '</em>', placeholder: 'chữ nghiêng' },
    { label: '🔗', title: 'Chèn liên kết', before: '<a href="https://">', after: '</a>', placeholder: 'văn bản liên kết' },
    { label: '• List', title: 'Danh sách', before: '<ul>\n  <li>', after: '</li>\n</ul>', placeholder: 'mục danh sách', block: true },
    { label: '▦ Bảng', title: 'Bảng 2 cột', before: '<table>\n  <tr><th>Tiêu đề 1</th><th>Tiêu đề 2</th></tr>\n  <tr><td>', after: '</td><td>…</td></tr>\n</table>', placeholder: 'ô 1', block: true },
    { label: '▶ YouTube', title: 'Nhúng video YouTube (thay MÃ_VIDEO)', before: '<iframe width="560" height="315" src="https://www.youtube.com/embed/', after: '" title="YouTube" allowfullscreen></iframe>', placeholder: 'MÃ_VIDEO', block: true },
  ];

  readonly tools: ToolButton[] = [
    { label: 'H2', title: 'Tiêu đề lớn', before: '## ', placeholder: 'Tiêu đề', block: true },
    { label: 'H3', title: 'Tiêu đề nhỏ', before: '### ', placeholder: 'Tiêu đề nhỏ', block: true },
    { label: 'B', title: 'In đậm', before: '**', after: '**', placeholder: 'chữ đậm' },
    { label: 'I', title: 'In nghiêng', before: '*', after: '*', placeholder: 'chữ nghiêng' },
    { label: '🔗', title: 'Chèn liên kết', before: '[', after: '](https://)', placeholder: 'văn bản liên kết' },
    { label: '• List', title: 'Danh sách', before: '- ', placeholder: 'mục danh sách', block: true },
    { label: '❝', title: 'Trích dẫn', before: '> ', placeholder: 'trích dẫn', block: true },
  ];

  constructor() {
    // Mở từ Admin → Khai báo (?seo=1) → cuộn tới khung SEO.
    if (new URLSearchParams(location.search).get('seo')) {
      setTimeout(() => this.host.querySelector<HTMLElement>('.adm-box.seo')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
    }
    effect(() => {
      const id = this.id();
      untracked(() => {
        const p = id ? this.service.getById(id) : undefined;
        this.title = p?.title ?? '';
        this.excerpt = p?.excerpt ?? '';
        this.content = p?.content ?? '';
        this.format.set(p?.format === 'html' ? 'html' : 'markdown');
        this.status = p?.status ?? 'draft';
        this.seo = { ...EMPTY_SEO, ...p?.seo };
        this.cover.set(p?.cover ?? '');
        this.submitted.set(false);
        this.mode.set('write');
      });
    });
  }

  // ---------- SEO ----------
  /** Slug sẽ dùng nếu chưa nhập: tạo từ tiêu đề. */
  autoSlug(): string {
    return slugify(this.title) || this.editing()?.id || '';
  }

  report(): SeoReport {
    return analyzeSeo(
      { title: this.title, excerpt: this.excerpt, content: this.content, cover: this.cover(), seo: this.seo, format: this.format() },
      this.autoSlug(),
    );
  }

  /** Bản xem trước JSON-LD sẽ được chèn vào trang. */
  schemaPreview(): string {
    const now = Date.now();
    const cur = this.editing();
    const post: NewsPost = {
      id: cur?.id ?? 'moi',
      title: this.title || 'Tiêu đề bài viết',
      excerpt: this.excerpt,
      format: this.format(),
      content: this.content,
      cover: this.cover(),
      status: this.status,
      createdAt: cur?.createdAt ?? now,
      updatedAt: cur?.updatedAt ?? now,
      seo: { ...this.seo, slug: this.seo.slug || this.autoSlug() },
    };
    return JSON.stringify(
      buildArticleSchema({ post, url: this.origin + newsPath(post), shopName: this.settings().shopName }),
      null,
      2,
    );
  }

  normalizeSlug(): void {
    this.seo.slug = slugify(this.seo.slug);
  }

  /** Slug chưa ai dùng: thêm -2, -3... nếu trùng. */
  private uniqueSlug(base: string): string {
    const selfId = this.editing()?.id;
    const taken = (s: string) => {
      const other = this.service.findByPath(s);
      return !!other && other.id !== selfId;
    };
    let slug = base;
    for (let i = 2; taken(slug); i++) slug = `${base}-${i}`;
    return slug;
  }

  // ---------- Trình soạn thảo ----------
  apply(tool: ToolButton, textarea: HTMLTextAreaElement): void {
    const { selectionStart: s, selectionEnd: e, value } = textarea;
    const selected = value.slice(s, e) || tool.placeholder;
    const needsNewline = tool.block && s > 0 && value[s - 1] !== '\n';
    const insert = (needsNewline ? '\n' : '') + tool.before + selected + (tool.after ?? '');
    this.content = value.slice(0, s) + insert + value.slice(e);
    textarea.value = this.content;
    const start = s + (needsNewline ? 1 : 0) + tool.before.length;
    textarea.focus();
    textarea.setSelectionRange(start, start + selected.length);
  }

  async insertImage(event: Event, textarea: HTMLTextAreaElement): Promise<void> {
    const el = event.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    try {
      const url = await fileToResizedDataUrl(file, 900, 0.8);
      const pos = textarea.selectionStart;
      const alt = file.name.replace(/\.[^.]+$/, '');
      const snippet = this.format() === 'html' ? `\n<img src="${url}" alt="${alt}" />\n` : `\n![${alt}](${url})\n`;
      this.content = this.content.slice(0, pos) + snippet + this.content.slice(pos);
      textarea.value = this.content;
      this.toast.ok('Đã chèn ảnh vào nội dung');
    } catch {
      this.toast.err('Không đọc được ảnh.');
    }
  }

  /** Đổi kiểu soạn: tự chuyển nội dung đang có sang kiểu mới (Markdown → HTML giữ nguyên định dạng). */
  setFormat(f: ContentFormat): void {
    if (f === this.format()) return;
    if (this.content.trim()) {
      if (f === 'html') this.content = renderMarkdown(this.content);
      else {
        if (!confirm('Chuyển sang soạn thường sẽ bỏ các định dạng HTML phức tạp (bảng, màu, video...). Tiếp tục?')) return;
        this.content = htmlToSeoMarkdown(this.content);
      }
    }
    this.format.set(f);
  }

  setMode(m: 'write' | 'preview'): void {
    this.mode.set(m);
    requestAnimationFrame(() => {
      const el = this.host.querySelector('.editor-body');
      if (el) animate(el, { opacity: [0, 1], duration: 300, ease: 'outQuad' });
    });
  }

  // ---------- Ảnh bìa ----------
  async onCover(event: Event): Promise<void> {
    const el = event.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    this.uploading.set(true);
    try {
      this.cover.set(await fileToResizedDataUrl(file, 1200, 0.82));
      this.popCover();
    } catch {
      this.toast.err('Không đọc được ảnh.');
    } finally {
      this.uploading.set(false);
    }
  }

  setCoverUrl(): void {
    const url = this.coverUrl().trim();
    if (!/^https?:\/\/\S+$/i.test(url)) return this.toast.err('Link ảnh phải bắt đầu bằng http:// hoặc https://');
    this.cover.set(url);
    this.coverUrl.set('');
    this.popCover();
  }

  private popCover(): void {
    requestAnimationFrame(() => {
      const img = this.host.querySelector('.cover-preview');
      if (img) animate(img, { scale: [0.8, 1], opacity: [0, 1], duration: 600, ease: 'outBack' });
    });
  }

  // ---------- Lưu ----------
  save(status: NewsStatus): void {
    this.submitted.set(true);
    if (this.title.trim().length < 3 || !this.content.trim()) {
      animate(this.host.querySelector('.adm-edit')!, { translateX: [0, -12, 10, -8, 6, 0], duration: 500, ease: 'inOutSine' });
      this.toast.err('Vui lòng điền các trường đang tô đỏ: tiêu đề (tối thiểu 3 ký tự) và nội dung.');
      setTimeout(() => this.host.querySelector<HTMLElement>('.invalid, .invalid-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    this.status = status;
    const data: NewsInput = {
      title: this.title.trim(),
      excerpt: this.excerpt.trim() || markdownToText(contentAsMarkdown({ content: this.content, format: this.format() })).slice(0, 160),
      format: this.format(),
      content: this.content,
      cover: this.cover(),
      status,
      seo: { ...this.seo, slug: this.seo.slug ? slugify(this.seo.slug) : this.uniqueSlug(this.autoSlug()) },
    };
    this.seo = { ...data.seo! };
    const msg = status === 'published' ? 'Đã đăng bài viết' : 'Đã lưu bản nháp';
    const current = this.editing();
    if (current) {
      this.toast.run(() => this.service.update(current.id, data), current.status === status ? 'Đã cập nhật bài viết' : msg);
    } else {
      let newId = '';
      if (this.toast.run(() => (newId = this.service.add(data).id), msg)) this.router.navigate(['/admin/tin-tuc', newId]);
    }
  }

  remove(): void {
    const p = this.editing();
    if (!p || !confirm(`Xoá bài viết "${p.title}"?`)) return;
    if (this.toast.run(() => this.service.remove(p.id), 'Đã xoá bài viết')) this.router.navigate(['/admin/tin-tuc']);
  }
}

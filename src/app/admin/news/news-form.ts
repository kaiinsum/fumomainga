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
import { MarkdownPipe } from '../../shared/markdown';
import { SEO_LIMITS, SeoReport, analyzeSeo, scoreLevel, slugify } from '../../shared/seo';
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
  imports: [FormsModule, RouterLink, DatePipe, MarkdownPipe],
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
  readonly submitted = signal(false);
  readonly uploading = signal(false);

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
    effect(() => {
      const id = this.id();
      untracked(() => {
        const p = id ? this.service.getById(id) : undefined;
        this.title = p?.title ?? '';
        this.excerpt = p?.excerpt ?? '';
        this.content = p?.content ?? '';
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
      { title: this.title, excerpt: this.excerpt, content: this.content, cover: this.cover(), seo: this.seo },
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
      const snippet = `\n![${file.name.replace(/\.[^.]+$/, '')}](${url})\n`;
      this.content = this.content.slice(0, pos) + snippet + this.content.slice(pos);
      textarea.value = this.content;
      this.toast.ok('Đã chèn ảnh vào nội dung');
    } catch {
      this.toast.err('Không đọc được ảnh.');
    }
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
      this.toast.err('Cần có tiêu đề (tối thiểu 3 ký tự) và nội dung.');
      return;
    }
    this.status = status;
    const data: NewsInput = {
      title: this.title.trim(),
      excerpt: this.excerpt.trim() || this.content.replace(/[#*>\-\[\]()!]/g, '').trim().slice(0, 160),
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

import { Injectable, computed, signal } from '@angular/core';
import { STORAGE_KEYS, hasJson, loadJson, saveJson } from '../core/storage';
import { EMPTY_SEO, NewsInput, NewsPost, NewsSeo } from '../models/news';
import { placeholderImage } from '../shared/placeholder';
import { isValidSlug, slugify } from '../shared/seo';

const day = 86_400_000;
const base = Date.UTC(2026, 10, 1);

export const SEED_NEWS: NewsPost[] = [
  {
    id: 'news-1',
    title: 'Ra mắt bộ sưu tập Fumo mùa đông 2026',
    excerpt: 'Những bé fumo khoác áo len, quàng khăn ấm áp đã chính thức lên kệ.',
    content:
      '## Bộ sưu tập mới đã có mặt\n\nMùa đông năm nay, chúng tôi mang đến **6 mẫu fumo mới** với trang phục len ấm áp.\n\n- Chất liệu nhung mềm\n- Áo len có thể tháo rời\n- Số lượng giới hạn\n\nGhé trang [Sản phẩm](/san-pham) để xem ngay nhé!',
    cover: placeholderImage('Mùa đông', 1),
    status: 'published',
    createdAt: base - 2 * day,
    updatedAt: base - 2 * day,
  },
  {
    id: 'news-2',
    title: 'Mẹo giữ fumo luôn sạch và mềm',
    excerpt: 'Vài cách đơn giản để chăm sóc thú bông yêu quý của bạn.',
    content:
      '## Vệ sinh định kỳ\n\nDùng *bàn chải mềm* để chải bụi mỗi tuần.\n\n## Giặt tay nhẹ nhàng\n\n- Nước ấm pha chút xà phòng dịu nhẹ\n- Không vắt mạnh\n- Phơi nơi thoáng mát, tránh nắng gắt\n\nChúc bạn và bé fumo luôn vui vẻ!',
    cover: placeholderImage('Chăm sóc', 3),
    status: 'published',
    createdAt: base - 6 * day,
    updatedAt: base - 6 * day,
  },
  {
    id: 'news-3',
    title: 'Sắp có: Fumo phiên bản Tết',
    excerpt: 'Bản nháp — chưa công bố.',
    content: 'Nội dung đang được chuẩn bị...',
    cover: placeholderImage('Tết', 5),
    status: 'draft',
    createdAt: base - 1 * day,
    updatedAt: base - 1 * day,
  },
];

@Injectable({ providedIn: 'root' })
export class NewsService {
  // Máy chưa từng tải dữ liệu → để trống chờ máy chủ.
  private readonly _posts = signal<NewsPost[]>(
    // Làm mới ảnh bìa SVG tự sinh của bài mẫu (bản cũ nhiều màu) sang bản một tông màu.
    loadJson<NewsPost[]>(STORAGE_KEYS.news, () => []).map((p) => {
      const seed = SEED_NEWS.find((s) => s.id === p.id);
      return seed && p.cover.startsWith('data:image/svg+xml') ? { ...p, cover: seed.cover } : p;
    }),
  );
  /** Tăng mỗi khi admin thay đổi dữ liệu → tự gửi lên máy chủ. */
  readonly changes = signal(0);

  /** Tất cả bài (kể cả nháp) — dùng trong admin. */
  readonly posts = computed(() => [...this._posts()].sort((a, b) => b.createdAt - a.createdAt));
  /** Chỉ bài đã xuất bản — dùng ngoài trang công khai. */
  readonly published = computed(() => this.posts().filter((p) => p.status === 'published'));

  getById(id: string): NewsPost | undefined {
    return this._posts().find((p) => p.id === id);
  }

  /** Tìm theo slug (đường dẫn SEO) hoặc id — link cũ dạng /tin-tuc/<id> vẫn hoạt động. */
  findByPath(key: string): NewsPost | undefined {
    return this._posts().find((p) => p.seo?.slug === key) ?? this.getById(key);
  }

  add(input: NewsInput): NewsPost {
    const now = Date.now();
    const id = crypto.randomUUID();
    const post: NewsPost = { ...input, seo: this.checkSeo(input.seo, id), id, createdAt: now, updatedAt: now };
    this.commit([post, ...this._posts()]);
    return post;
  }

  update(id: string, patch: Partial<NewsInput>): void {
    const seo = patch.seo ? { seo: this.checkSeo(patch.seo, id) } : {};
    this.commit(this._posts().map((p) => (p.id === id ? { ...p, ...patch, ...seo, updatedAt: Date.now() } : p)));
  }

  remove(id: string): void {
    this.commit(this._posts().filter((p) => p.id !== id));
  }

  replaceAll(posts: NewsPost[]): void {
    this.commit(posts);
  }

  /** Chuẩn hoá slug, kiểm tra trùng và canonical hợp lệ. */
  private checkSeo(seo: NewsSeo | undefined, selfId: string): NewsSeo {
    const next: NewsSeo = { ...EMPTY_SEO, ...seo };
    next.slug = slugify(next.slug);
    next.canonical = next.canonical.trim();
    if (next.slug && !isValidSlug(next.slug)) throw new Error('Đường dẫn chỉ gồm chữ thường không dấu, số và dấu "-".');
    if (next.slug && this._posts().some((p) => p.id !== selfId && (p.seo?.slug === next.slug || p.id === next.slug))) {
      throw new Error(`Đường dẫn "${next.slug}" đã được bài khác sử dụng.`);
    }
    if (next.canonical && !/^https?:\/\/\S+$/i.test(next.canonical)) {
      throw new Error('URL chuẩn (canonical) phải bắt đầu bằng http:// hoặc https://');
    }
    return next;
  }

  /** Nạp dữ liệu từ máy chủ (hoặc bài mẫu) — không tính là thay đổi của admin. */
  hydrate(list: NewsPost[]): void {
    try {
      saveJson(STORAGE_KEYS.news, list);
    } catch {
      /* bỏ qua */
    }
    this._posts.set(list);
  }

  useSeedIfEmpty(): void {
    // Không ghi vào bộ nhớ trình duyệt (xem ProductService.useSeedIfEmpty).
    if (!hasJson(STORAGE_KEYS.news)) this._posts.set(structuredClone(SEED_NEWS));
  }

  private commit(next: NewsPost[]): void {
    saveJson(STORAGE_KEYS.news, next);
    this._posts.set(next);
    this.changes.update((n) => n + 1);
  }
}

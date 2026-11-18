import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { STORAGE_KEYS, hasJson } from '../core/storage';
import { Category, Product } from '../models/product';
import { NewsPost } from '../models/news';
import { AuthService } from './auth.service';
import { CategoryService } from './category.service';
import { NewsService } from './news.service';
import { ApiError, OrderApiService } from './order-api.service';
import { ProductService } from './product.service';

interface RemoteCatalog {
  products: Product[] | null;
  categories: Category[] | null;
  news: NewsPost[] | null;
  updatedAt: number | null;
}

export type SyncState = 'idle' | 'saving' | 'saved' | 'error';

/** Ảnh dạng data URL (ảnh admin chọn từ máy) — cần tải lên kho ảnh. Ảnh SVG mẫu nhỏ, giữ nguyên. */
const DATA_IMG = /data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+/g;
const isDataImg = (s: string) => /^data:image\/(?:jpeg|png|webp|gif);base64,/.test(s);
const hasDataImg = (s: string) => /data:image\/(?:jpeg|png|webp|gif);base64,/.test(s);

/**
 * Đồng bộ sản phẩm / danh mục / tin tức với máy chủ (/api/catalog):
 * - Mọi máy khi mở web đều tải dữ liệu admin đã lưu → khách ở máy khác cũng thấy.
 * - Admin thêm / sửa / xoá → tự tải ảnh lên kho ảnh (/api/media) rồi gửi dữ liệu lên máy chủ.
 * - Gửi lỗi (mất mạng...) → nhớ "còn thay đổi chưa lưu", lần sau mở admin tự gửi lại.
 */
@Injectable({ providedIn: 'root' })
export class CatalogSyncService {
  private readonly products = inject(ProductService);
  private readonly categories = inject(CategoryService);
  private readonly news = inject(NewsService);
  private readonly auth = inject(AuthService);
  private readonly api = inject(OrderApiService);

  /** Đã có dữ liệu từ máy chủ (hoặc đã chắc chắn dùng dữ liệu trên máy). */
  readonly loaded = signal(false);
  readonly state = signal<SyncState>('idle');
  readonly message = signal('');
  readonly lastSaved = signal<number | null>(null);
  /** Còn thay đổi chưa gửi lên máy chủ. */
  readonly dirty = signal(readDirty());

  /** Máy chủ trả lời nhưng chưa có dữ liệu nào (chưa từng lưu). */
  private remoteEmpty = false;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private again = false;
  /** Ảnh đã tải lên trong phiên: data URL → link. */
  private readonly uploaded = new Map<string, string>();
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.load();

    // Admin thay đổi dữ liệu → đánh dấu và gửi lên sau 1.2 giây (gộp nhiều thao tác liên tiếp).
    let first = true;
    effect(() => {
      this.products.changes();
      this.categories.changes();
      this.news.changes();
      if (first) {
        first = false;
        return;
      }
      untracked(() => {
        this.setDirty(true);
        this.schedule();
      });
    });

    // Admin vừa đăng nhập: còn thay đổi chưa lưu, hoặc máy chủ chưa có dữ liệu (lần đầu) → gửi dữ liệu máy này lên.
    effect(() => {
      if (!this.auth.loggedIn()) return;
      untracked(() =>
        this.ready.then(() => {
          if (this.remoteEmpty) this.setDirty(true);
          if (this.dirty()) this.schedule(0);
        }),
      );
    });
  }

  /** Gửi ngay (nút "Lưu lại" khi lỗi). */
  saveNow(): Promise<void> {
    clearTimeout(this.timer);
    return this.push();
  }

  private schedule(delay = 1200): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.push(), delay);
  }

  private async load(): Promise<void> {
    const admin = this.auth.loggedIn();
    let remote: RemoteCatalog | null = null;
    try {
      const res = await fetch(admin ? '/api/catalog?fresh=1' : '/api/catalog', { cache: 'no-cache' });
      if (res.ok) remote = (await res.json()) as RemoteCatalog;
    } catch {
      /* chưa có máy chủ (chạy thử ở máy) → dùng dữ liệu trên máy */
    }
    const hasRemote = !!remote?.updatedAt && Array.isArray(remote.products);

    if (hasRemote && !this.dirty()) {
      this.products.hydrate(remote!.products!);
      if (Array.isArray(remote!.categories) && remote!.categories.length) this.categories.hydrate(remote!.categories);
      if (Array.isArray(remote!.news)) this.news.hydrate(remote!.news);
      this.lastSaved.set(remote!.updatedAt);
    } else {
      this.products.useSeedIfEmpty();
      this.news.useSeedIfEmpty();
      // Máy chủ chưa có dữ liệu → admin đăng nhập sẽ đưa dữ liệu trên máy này lên (lần đầu).
      // Chỉ khi máy này có dữ liệu admin đã lưu — không bao giờ đẩy dữ liệu mẫu đè lên.
      const hasLocal = hasJson(STORAGE_KEYS.products) || hasJson(STORAGE_KEYS.news) || hasJson(STORAGE_KEYS.categories);
      this.remoteEmpty = !hasRemote && !!remote && hasLocal;
      if (this.remoteEmpty && admin) this.setDirty(true);
    }
    this.loaded.set(true);
    if (this.dirty() && admin) this.schedule(0);
  }

  private push(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.doPush().finally(() => {
      this.running = undefined;
      if (this.again) {
        this.again = false;
        void this.push();
      }
    });
    return this.running;
  }

  private async doPush(): Promise<void> {
    if (!this.auth.loggedIn()) return;
    if (!this.api.adminKey()) {
      this.fail('Chưa có mã quản trị (ADMIN_API_KEY) — vào Đơn hàng để nhập mã, dữ liệu mới lưu lên máy chủ được.');
      return;
    }
    this.state.set('saving');
    this.message.set('');
    try {
      await this.uploadImages();
      const body = {
        products: this.products.products(),
        categories: this.categories.categories(),
        news: this.news.posts(),
      };
      const res = await this.api.call<{ updatedAt: number }>('PUT', '/api/catalog', body, true, { timeoutMs: 30000 });
      this.lastSaved.set(res.updatedAt);
      this.setDirty(false);
      this.remoteEmpty = false;
      this.state.set('saved');
    } catch (e) {
      this.fail(e instanceof Error ? e.message : 'Không gửi được lên máy chủ.');
    }
  }

  /** Tải mọi ảnh data URL lên kho ảnh rồi thay bằng link (máy chủ không phải Supabase → giữ nguyên). */
  private async uploadImages(): Promise<void> {
    const found = new Set<string>();
    for (const p of this.products.products()) for (const img of p.images) if (isDataImg(img)) found.add(img);
    for (const n of this.news.posts()) {
      if (isDataImg(n.cover)) found.add(n.cover);
      for (const m of n.content.match(DATA_IMG) ?? []) found.add(m);
    }
    const todo = [...found].filter((d) => !this.uploaded.has(d));
    if (todo.length) this.message.set(`Đang tải ${todo.length} ảnh lên…`);

    let i = 0;
    let unsupported = false;
    const worker = async () => {
      while (i < todo.length && !unsupported) {
        const dataUrl = todo[i++];
        try {
          const { url } = await this.api.call<{ url: string }>('POST', '/api/media', { dataUrl }, true, { timeoutMs: 30000 });
          this.uploaded.set(dataUrl, url);
        } catch (e) {
          if (e instanceof ApiError && e.status === 501) unsupported = true;
          else throw e;
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (!this.uploaded.size) return;

    const swap = (s: string) => this.uploaded.get(s) ?? s;
    const prods = this.products.products();
    if (prods.some((p) => p.images.some((img) => this.uploaded.has(img)))) {
      this.products.hydrate(prods.map((p) => ({ ...p, images: p.images.map(swap) })));
    }
    const posts = this.news.posts();
    if (posts.some((n) => this.uploaded.has(n.cover) || hasDataImg(n.content))) {
      this.news.hydrate(posts.map((n) => ({ ...n, cover: swap(n.cover), content: n.content.replace(DATA_IMG, swap) })));
    }
  }

  private fail(msg: string): void {
    this.state.set('error');
    this.message.set(msg);
  }

  private setDirty(on: boolean): void {
    this.dirty.set(on);
    try {
      if (on) localStorage.setItem(STORAGE_KEYS.catalogDirty, '1');
      else localStorage.removeItem(STORAGE_KEYS.catalogDirty);
    } catch {
      /* bỏ qua */
    }
  }
}

function readDirty(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.catalogDirty) === '1';
  } catch {
    return false;
  }
}

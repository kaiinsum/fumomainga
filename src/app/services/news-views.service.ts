import { Injectable, signal } from '@angular/core';
import { NewsPost } from '../models/news';

/** Lượt xem bài viết (công khai) - tải 1 lần mỗi lần mở web, lỗi thì coi như 0. */
@Injectable({ providedIn: 'root' })
export class NewsViewsService {
  readonly views = signal<Record<string, number>>({});
  readonly loaded = signal(false);
  private loading?: Promise<void>;

  load(): Promise<void> {
    this.loading ??= fetch('/api/news-views')
      .then((r) => (r.ok ? r.json() : { views: {} }))
      .then((d: { views?: Record<string, number> }) => this.views.set(d.views ?? {}))
      .catch(() => undefined)
      .finally(() => this.loaded.set(true));
    return this.loading;
  }

  /** Lượt xem của bài (khách có thể mở bằng slug hoặc mã bài → cộng cả hai). */
  of(p: Pick<NewsPost, 'id' | 'seo'>): number {
    const v = this.views();
    const slug = p.seo?.slug;
    return (slug ? v[slug] ?? 0 : 0) + (slug !== p.id ? v[p.id] ?? 0 : 0);
  }
}

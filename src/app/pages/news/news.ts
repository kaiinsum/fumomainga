import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { newsPath } from '../../models/news';
import { NewsService } from '../../services/news.service';
import { AnimateInDirective } from '../../shared/animate-in.directive';

@Component({
  selector: 'app-news',
  imports: [RouterLink, DatePipe, AnimateInDirective],
  template: `
    <section class="page-head">
      <div class="container">
        <h1 appAnimateIn>Tin <span>tức</span></h1>
        <p appAnimateIn [animDelay]="100">Sản phẩm mới, sự kiện và những mẹo hay dành cho bạn.</p>
      </div>
    </section>

    <div class="container list">
      @for (n of posts(); track n.id; let i = $index) {
        <a class="item card-surface" [routerLink]="path(n)" [appAnimateIn]="i % 2 ? 'right' : 'left'">
          @if (n.cover) { <img [src]="n.cover" [alt]="n.title" loading="lazy" /> }
          <div class="body">
            <small>{{ n.createdAt | date: 'dd/MM/yyyy' }}</small>
            <h2>{{ n.title }}</h2>
            <p>{{ n.excerpt }}</p>
            <span class="more">Đọc tiếp →</span>
          </div>
        </a>
      } @empty {
        <p class="empty">Chưa có bài viết nào.</p>
      }
    </div>
  `,
  styles: `
    .page-head { padding: 48px 0 24px; text-align: center; }
    .page-head h1 { font-size: clamp(2rem, 4vw, 2.8rem); }
    .page-head h1 span { color: var(--primary); }
    .page-head p { color: var(--muted); margin: 0; }
    .list { display: flex; flex-direction: column; gap: 22px; max-width: 900px; padding-bottom: 48px; }
    .item { display: grid; grid-template-columns: 280px 1fr; overflow: hidden; transition: transform .25s; }
    .item:hover { transform: translateY(-4px); }
    .item img { width: 100%; height: 100%; object-fit: cover; aspect-ratio: 16 / 10; }
    .body { padding: 20px 24px; display: flex; flex-direction: column; }
    .body small, .body p { color: var(--muted); }
    .body h2 { font-size: 1.3rem; margin: 4px 0 8px; }
    .body p { margin: 0 0 12px; }
    .more { margin-top: auto; color: var(--primary); font-weight: 800; }
    .empty { text-align: center; color: var(--muted); }
    @media (max-width: 680px) { .item { grid-template-columns: 1fr; } }
  `,
})
export class NewsPage {
  readonly posts = inject(NewsService).published;
  readonly path = newsPath;
}

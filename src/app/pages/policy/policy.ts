import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnimateInDirective } from '../../shared/animate-in.directive';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-policy',
  imports: [RouterLink, AnimateInDirective],
  template: `
    <section class="hero">
      <div class="container">
        <h1>Chính sách <span>mua hàng</span></h1>
        @if (s().policyIntro) { <p class="lead">{{ s().policyIntro }}</p> }
        @if (sections().length > 1) {
          <nav class="toc" aria-label="Mục lục chính sách">
            @for (p of sections(); track $index; let i = $index) {
              <a [href]="'#cs-' + i" (click)="jump($event, i)">{{ p.icon }} {{ p.title }}</a>
            }
          </nav>
        }
      </div>
    </section>

    <section class="section">
      <div class="container list">
        @for (p of sections(); track $index; let i = $index) {
          <article class="policy card-surface" [id]="'cs-' + i" appAnimateIn [animDelay]="(i % 2) * 100">
            <span class="icon" aria-hidden="true">{{ p.icon }}</span>
            <div class="body">
              <h2>{{ p.title }}</h2>
              <ul>
                @for (line of p.lines; track $index) { <li>{{ line }}</li> }
              </ul>
            </div>
          </article>
        } @empty {
          <p class="empty">Chính sách đang được cập nhật.</p>
        }

        <div class="ask card-surface" appAnimateIn>
          <span aria-hidden="true">💬</span>
          <p>Còn điều gì chưa rõ? Shop luôn sẵn sàng giải đáp.</p>
          <a class="btn" routerLink="/lien-he">Liên hệ shop</a>
        </div>
      </div>
    </section>
  `,
  styles: `
    .hero { text-align: center; padding: 64px 0 28px; }
    .hero h1 { font-size: clamp(2rem, 5vw, 3rem); margin: 0 0 12px; }
    .hero h1 span { color: var(--primary); }
    .lead { max-width: 640px; margin: 0 auto; color: var(--muted); font-size: 1.08rem; }
    .toc { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 24px; }
    .toc a {
      padding: 8px 16px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface);
      color: var(--text); font-weight: 700; font-size: .92rem; text-decoration: none; transition: .2s;
    }
    .toc a:hover { border-color: var(--primary); color: var(--primary); transform: translateY(-2px); }
    .list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 22px; max-width: 1040px; }
    .policy { display: flex; gap: 18px; padding: 26px; scroll-margin-top: 96px; transition: transform .25s, box-shadow .25s; }
    .policy:hover { transform: translateY(-4px); box-shadow: 0 14px 34px color-mix(in srgb, var(--primary) 22%, transparent); }
    .icon {
      flex: none; width: 56px; height: 56px; display: grid; place-items: center; font-size: 1.8rem;
      border-radius: 16px; background: color-mix(in srgb, var(--primary) 14%, transparent);
    }
    .body { min-width: 0; }
    h2 { font-size: 1.2rem; margin: 4px 0 10px; }
    ul { margin: 0; padding-left: 1.1em; color: var(--muted); line-height: 1.7; }
    li + li { margin-top: 4px; }
    li::marker { color: var(--primary); }
    .ask {
      grid-column: 1 / -1; display: flex; align-items: center; gap: 14px; padding: 20px 26px; flex-wrap: wrap;
    }
    .ask span { font-size: 1.8rem; }
    .ask p { flex: 1; margin: 0; font-weight: 600; min-width: 200px; }
    .empty { grid-column: 1 / -1; text-align: center; color: var(--muted); }
    @media (max-width: 760px) {
      .hero { padding: 40px 0 16px; }
      .list { grid-template-columns: 1fr; gap: 16px; }
      .policy { padding: 20px; gap: 14px; }
      .icon { width: 46px; height: 46px; font-size: 1.5rem; border-radius: 13px; }
    }
  `,
})
export class PolicyPage {
  readonly s = inject(SettingsService).settings;

  readonly sections = computed(() =>
    (this.s().policies ?? [])
      .filter((p) => p.title.trim() || p.text.trim())
      .map((p) => ({
        ...p,
        lines: p.text.split('\n').map((l) => l.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean),
      })),
  );

  jump(e: Event, i: number): void {
    e.preventDefault();
    document.getElementById('cs-' + i)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

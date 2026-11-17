import { AfterViewInit, Component, ElementRef, OnDestroy, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { JSAnimation, animate, stagger } from 'animejs';
import { AnimateInDirective } from '../../shared/animate-in.directive';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-about',
  imports: [RouterLink, AnimateInDirective],
  template: `
    <section class="hero">
      <div class="container">
        <div class="dots" aria-hidden="true">
          @for (d of dots; track $index) { <span></span> }
        </div>
        <h1>{{ s().aboutTitle }} <span>{{ s().shopName }}</span></h1>
        <p class="lead">{{ s().aboutIntro }}</p>
      </div>
    </section>

    <section class="section">
      <div class="container values">
        @for (v of s().aboutValues; track $index; let i = $index) {
          <div class="value card-surface" appAnimateIn [animDelay]="i * 120">
            <span class="icon">{{ v.icon }}</span>
            <h3>{{ v.title }}</h3>
            <p>{{ v.text }}</p>
          </div>
        }
      </div>
    </section>

    <section class="section timeline-section">
      <div class="container">
        @if (timelineTitle().length) {
          <h2 class="section-title" appAnimateIn>
            @for (p of timelineTitle(); track $index) {
              @if (p.hl) { <span>{{ p.text }}</span> } @else { {{ p.text }} }
            }
          </h2>
        }
        <ol class="timeline">
          @for (m of s().aboutMilestones; track $index; let i = $index) {
            <li [appAnimateIn]="i % 2 ? 'right' : 'left'">
              <strong>{{ m.year }}</strong>
              <p>{{ m.text }}</p>
            </li>
          }
        </ol>
        <div class="center" appAnimateIn>
          <a routerLink="/san-pham" class="btn primary">Khám phá sản phẩm</a>
        </div>
      </div>
    </section>
  `,
  styles: `
    .hero { position: relative; text-align: center; padding: 72px 0 48px; overflow: hidden; }
    .hero h1 { font-size: clamp(2.2rem, 5vw, 3.4rem); }
    .hero h1 span { color: var(--primary); }
    .lead { max-width: 640px; margin: 0 auto; color: var(--muted); font-size: 1.1rem; }
    .dots { position: absolute; inset: 0; pointer-events: none; }
    .dots span { position: absolute; width: 14px; height: 14px; border-radius: 50%; background: var(--primary); opacity: .25; }
    .values { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
    .value { padding: 28px; text-align: center; }
    .value .icon { font-size: 2.6rem; }
    .value p { color: var(--muted); margin: 0; }
    .timeline-section { background: var(--primary-100); }
    .timeline { list-style: none; padding: 0; margin: 32px auto; max-width: 720px; position: relative; }
    .timeline::before { content: ''; position: absolute; left: 50%; top: 0; bottom: 0; width: 3px; background: var(--border); translate: -50% 0; }
    .timeline li { position: relative; width: 50%; padding: 12px 32px; }
    .timeline li:nth-child(odd) { text-align: right; }
    .timeline li:nth-child(even) { margin-left: 50%; }
    .timeline li::after { content: ''; position: absolute; top: 20px; width: 16px; height: 16px; border-radius: 50%;
      background: var(--primary); border: 3px solid #fff; }
    .timeline li:nth-child(odd)::after { right: -8px; }
    .timeline li:nth-child(even)::after { left: -8px; }
    .timeline strong { color: var(--primary); font-size: 1.3rem; }
    .timeline p { margin: 4px 0 0; color: var(--muted); }
    .center { text-align: center; }
    @media (max-width: 760px) {
      .values { grid-template-columns: 1fr; }
      .timeline::before { left: 8px; }
      .timeline li, .timeline li:nth-child(even) { width: 100%; margin-left: 0; text-align: left; padding-left: 36px; }
      .timeline li:nth-child(odd)::after, .timeline li:nth-child(even)::after { left: 1px; right: auto; }
    }
  `,
})
export class AboutPage implements AfterViewInit, OnDestroy {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private loop?: JSAnimation;

  readonly dots = Array.from({ length: 14 });

  readonly s = inject(SettingsService).settings;
  /** "Hành trình *của chúng tôi*" → phần thường + phần tô màu. */
  readonly timelineTitle = computed(() =>
    (this.s().aboutTimelineTitle ?? '')
      .trim()
      .split(/\*([^*]+)\*/)
      .map((text, i) => ({ text, hl: i % 2 === 1 }))
      .filter((p) => p.text),
  );

  ngAfterViewInit(): void {
    const dots = this.host.querySelectorAll<HTMLElement>('.dots span');
    dots.forEach((d) => {
      d.style.left = `${Math.random() * 100}%`;
      d.style.top = `${Math.random() * 100}%`;
    });
    this.loop = animate(dots, {
      translateY: () => [0, -20 - Math.random() * 40],
      scale: () => [0.6, 1 + Math.random()],
      opacity: [0.1, 0.4],
      delay: stagger(150),
      duration: 2400,
      loop: true,
      alternate: true,
      ease: 'inOutSine',
    });
  }

  ngOnDestroy(): void {
    this.loop?.pause();
  }
}

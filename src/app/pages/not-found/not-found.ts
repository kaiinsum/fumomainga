import { AfterViewInit, Component, ElementRef, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { animate, stagger } from 'animejs';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <section class="nf container">
      <h1>
        @for (c of chars; track $index) { <span>{{ c }}</span> }
      </h1>
      <p>Ôi, bé fumo đi lạc rồi! Trang bạn tìm không tồn tại.</p>
      <a routerLink="/" class="btn primary">Về trang chủ</a>
    </section>
  `,
  styles: `
    .nf { text-align: center; padding: 96px 0; }
    h1 { font-size: clamp(5rem, 18vw, 10rem); color: var(--primary); margin: 0; }
    h1 span { display: inline-block; }
    p { color: var(--muted); font-size: 1.1rem; }
  `,
})
export class NotFoundPage implements AfterViewInit {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  readonly chars = ['4', '0', '4'];

  ngAfterViewInit(): void {
    animate(this.host.querySelectorAll('h1 span'), {
      translateY: [-120, 0],
      opacity: [0, 1],
      rotate: [-30, 0],
      delay: stagger(120),
      duration: 1200,
      ease: 'outBounce',
    });
  }
}

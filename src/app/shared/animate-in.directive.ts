import { Directive, ElementRef, OnDestroy, OnInit, inject, input } from '@angular/core';
import { animate } from 'animejs';

type Direction = 'up' | 'left' | 'right' | 'zoom' | '';

/** Hiệu ứng xuất hiện khi phần tử cuộn vào khung nhìn (anime.js + IntersectionObserver). */
@Directive({ selector: '[appAnimateIn]' })
export class AnimateInDirective implements OnInit, OnDestroy {
  readonly appAnimateIn = input<Direction>('up');
  readonly animDelay = input(0);

  private readonly el: HTMLElement = inject(ElementRef).nativeElement;
  private observer?: IntersectionObserver;

  ngOnInit(): void {
    this.el.style.opacity = '0';
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          this.play();
          this.observer?.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    this.observer.observe(this.el);
  }

  private play(): void {
    const kind = this.appAnimateIn() || 'up';
    const from: Record<string, number[]> =
      kind === 'left' ? { translateX: [-60, 0] }
      : kind === 'right' ? { translateX: [60, 0] }
      : kind === 'zoom' ? { scale: [0.85, 1] }
      : { translateY: [40, 0] };
    animate(this.el, {
      opacity: [0, 1],
      ...from,
      duration: 800,
      delay: this.animDelay(),
      ease: 'outExpo',
      // Xong thì bỏ transform gắn trên phần tử để hiệu ứng :hover bằng CSS (nhấc lên, phóng to) hoạt động.
      onComplete: () => this.el.style.removeProperty('transform'),
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}

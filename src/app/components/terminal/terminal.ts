import { AfterViewInit, Component, ElementRef, OnDestroy, computed, inject, input, signal } from '@angular/core';
import { JSAnimation, animate, stagger } from 'animejs';

export interface TerminalLine {
  /** 'cmd' = dòng lệnh ($ ...), 'out' = kết quả. */
  kind: 'cmd' | 'out';
  text: string;
}

/** Cửa sổ terminal giả lập, gõ từng ký tự bằng anime.js (dùng ở trang chủ chế độ tối). */
@Component({
  selector: 'app-terminal',
  template: `
    <div class="term" role="img" [attr.aria-label]="ariaLabel()">
      <div class="bar">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
        <span class="title">{{ title() }}</span>
      </div>
      <pre class="body" aria-hidden="true">@for (l of shown(); track $index) {<span class="line" [class.cmd]="l.kind === 'cmd'">{{ l.kind === 'cmd' ? '$ ' : '' }}{{ l.text }}</span>}<span class="caret">▍</span></pre>
    </div>
  `,
  styles: `
    :host { display: block; width: min(440px, 100%); }
    .term {
      border-radius: 12px; overflow: hidden;
      background: color-mix(in srgb, var(--primary) 6%, #04070a);
      border: 1px solid color-mix(in srgb, var(--primary) 35%, transparent);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 12%, transparent),
        0 0 48px color-mix(in srgb, var(--primary) 28%, transparent), 0 30px 60px rgba(0, 0, 0, .55);
    }
    .bar { display: flex; align-items: center; gap: 7px; padding: 10px 14px;
      background: color-mix(in srgb, var(--primary) 12%, #070b10);
      border-bottom: 1px solid color-mix(in srgb, var(--primary) 22%, transparent); }
    /* Ba chấm cửa sổ: các sắc của màu chủ đạo (không dùng đỏ/vàng/xanh lá) */
    .dot { width: 11px; height: 11px; border-radius: 50%; background: var(--primary); }
    .dot:nth-child(2) { opacity: .6; }
    .dot:nth-child(3) { opacity: .3; }
    .title { margin-left: 8px; font: 600 .78rem var(--font-mono); color: color-mix(in srgb, var(--primary) 50%, #8b96a1); }
    .body { margin: 0; padding: 18px 18px 22px; min-height: 230px; white-space: pre-wrap; word-break: break-word;
      font: 500 .92rem/1.75 var(--font-mono); color: color-mix(in srgb, var(--primary) 18%, #dbe4ec); }
    .line { display: inline; }
    .cmd { color: var(--primary); font-weight: 700; }
    .caret { color: var(--primary); animation: blink 1s steps(1) infinite; }
    @keyframes blink { 50% { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .caret { animation: none; } }
  `,
})
export class TerminalComponent implements AfterViewInit, OnDestroy {
  readonly lines = input.required<TerminalLine[]>();
  readonly title = input('bash');

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly typed = signal(0);
  private typing?: JSAnimation;

  readonly ariaLabel = computed(() => this.lines().map((l) => l.text).join('. '));

  /** Cắt nội dung theo số ký tự đã "gõ". */
  readonly shown = computed(() => {
    let left = this.typed();
    const out: TerminalLine[] = [];
    for (const l of this.lines()) {
      if (left <= 0) break;
      out.push({ kind: l.kind, text: l.text.slice(0, left) });
      left -= l.text.length;
    }
    return out;
  });

  ngAfterViewInit(): void {
    const total = this.lines().reduce((n, l) => n + l.text.length, 0);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.typed.set(total);
      return;
    }
    animate(this.host.querySelector('.term')!, {
      opacity: [0, 1],
      translateY: [30, 0],
      rotateX: [12, 0],
      duration: 900,
      ease: 'out(4)',
    });
    animate(this.host.querySelectorAll('.dot'), { scale: [0, 1], delay: stagger(90, { start: 300 }), duration: 500, ease: 'outBack' });

    const counter = { n: 0 };
    this.typing = animate(counter, {
      n: total,
      delay: 500,
      duration: total * 38,
      ease: 'linear',
      modifier: Math.round,
      onUpdate: () => this.typed.set(counter.n),
    });
  }

  ngOnDestroy(): void {
    this.typing?.pause();
  }
}

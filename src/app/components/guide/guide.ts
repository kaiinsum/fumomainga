import { Component, ElementRef, computed, effect, inject, untracked, viewChild } from '@angular/core';
import { GuideService, guideStage } from './guide.service';

/**
 * Người hướng dẫn (Cirno ở giao diện sáng / Reimu ở giao diện tối) bay từ ảnh nền ra phía trước rồi nói chuyện.
 * Nội dung & thời gian chỉnh trong Admin → Marketing & tương tác → Người hướng dẫn.
 */
@Component({
  selector: 'app-guide',
  template: `
    @let st = guide.step();
    @if (st !== 'hidden') {
      <div class="guide" [class.hub]="st === 'hub'" [class.dark]="guide.dark()" role="dialog" [attr.aria-label]="guide.name() + ' nói'">
        <img #fig class="fig" [src]="guide.image()" [alt]="guide.name()" draggable="false" />
        <div class="bubble" aria-live="polite">
          <button class="x" type="button" (click)="close()" aria-label="Đóng">✕</button>
          <b class="nm">{{ guide.name() }}</b>
          <p>{{ text() }}</p>
          @switch (st) {
            @case ('ask') {
              <div class="acts">
                <button class="b yes" type="button" (click)="guide.answer(true)">{{ guide.cfg().yesLabel }}</button>
                <button class="b no" type="button" (click)="guide.answer(false)">{{ guide.cfg().noLabel }}</button>
              </div>
            }
            @case ('yes') {
              <div class="acts"><button class="b yes" type="button" (click)="go()">{{ guide.cfg().okLabel }}</button></div>
            }
            @case ('no') {
              <div class="acts"><button class="b no" type="button" (click)="close()">Ừm!</button></div>
            }
          }
        </div>
      </div>
    }
  `,
  styles: `
    .guide { position: fixed; left: 14px; bottom: 14px; z-index: 990; display: flex; align-items: flex-end; gap: 0; pointer-events: none;
      max-width: min(520px, calc(100vw - 28px)); }
    .fig { height: 230px; width: auto; flex: none; pointer-events: auto; transform-origin: 0 0;
      filter: drop-shadow(0 10px 18px rgba(0, 0, 0, .25)); animation: bob 3s ease-in-out 1s infinite; user-select: none; }
    .bubble { position: relative; pointer-events: auto; margin: 0 0 120px -18px; padding: 14px 16px 14px; border-radius: 18px;
      background: var(--surface); color: var(--text); border: 2px solid var(--primary); min-width: 200px; max-width: 300px;
      box-shadow: 0 14px 34px -10px color-mix(in srgb, var(--primary) 55%, transparent);
      animation: pop .45s cubic-bezier(.2, 1.4, .4, 1) .75s both; }
    /* Đuôi bong bóng chỉ về nhân vật */
    .bubble::before { content: ''; position: absolute; left: -11px; bottom: 22px; width: 18px; height: 18px; background: var(--surface);
      border-left: 2px solid var(--primary); border-bottom: 2px solid var(--primary); transform: rotate(45deg); }
    .nm { display: block; font-size: .78rem; color: var(--primary-dark); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 2px; }
    p { margin: 0; font-weight: 700; line-height: 1.45; font-size: .95rem; }
    .x { position: absolute; top: 6px; right: 8px; border: 0; background: none; color: var(--muted); cursor: pointer; font-size: .85rem; padding: 2px 4px; }
    .acts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .b { font: inherit; font-weight: 800; font-size: .88rem; padding: 8px 14px; border-radius: 999px; cursor: pointer; border: 2px solid var(--primary); }
    .b.yes { background: var(--primary); color: var(--on-primary); }
    .b.no { background: var(--surface); color: var(--primary-dark); }
    .b:hover { transform: translateY(-1px); }
    /* Giao diện tối: viền neon */
    .guide.dark .bubble { background: color-mix(in srgb, #ff2d55 6%, #0b0f14); border-color: #ff2d55;
      box-shadow: 0 0 22px rgba(255, 45, 85, .45); }
    .guide.dark .bubble::before { background: color-mix(in srgb, #ff2d55 6%, #0b0f14); border-color: #ff2d55; }
    /* Trang Mini game: nhỏ gọn hơn */
    .guide.hub .fig { height: 170px; }
    .guide.hub .bubble { margin-bottom: 80px; }
    @keyframes pop { from { opacity: 0; transform: scale(.6) translateY(14px); } to { opacity: 1; transform: none; } }
    @keyframes bob { 50% { translate: 0 -6px; } }
    @media (max-width: 600px) {
      .guide { left: 6px; bottom: 6px; }
      .fig { height: 150px; }
      .guide.hub .fig { height: 110px; }
      .bubble { margin: 0 0 70px -14px; min-width: 0; max-width: calc(100vw - 130px); padding: 11px 12px; }
      .guide.hub .bubble { margin-bottom: 50px; }
      p { font-size: .84rem; }
      .b { font-size: .8rem; padding: 6px 11px; }
    }
    @media (prefers-reduced-motion: reduce) { .fig, .bubble { animation: none; } }
  `,
})
export class GuideComponent {
  readonly guide = inject(GuideService);
  private readonly fig = viewChild<ElementRef<HTMLImageElement>>('fig');
  private shown = false;

  readonly text = computed(() => {
    const c = this.guide.cfg();
    switch (this.guide.step()) {
      case 'ask':
        return c.askText;
      case 'yes':
        return c.yesReply;
      case 'no':
        return c.noReply;
      case 'hub':
        return this.guide.hubLine() || c.hubWelcome;
      default:
        return '';
    }
  });

  constructor() {
    this.guide.start();
    // Vừa hiện → bay từ chỗ nhân vật trên ảnh nền ra góc màn hình.
    effect(() => {
      const visible = this.guide.step() !== 'hidden';
      const el = this.fig()?.nativeElement;
      untracked(() => {
        if (visible && el && !this.shown) {
          this.shown = true;
          guideStage.out = true;
          this.flyIn(el);
        } else if (!visible && this.shown) {
          this.shown = false;
          guideStage.out = false;
        }
      });
    });
    // Câu "Không" tự ẩn sau vài giây. Trang Mini game trên điện thoại: chào xong tự thu lại để không che thẻ game.
    effect(() => {
      const st = this.guide.step();
      if (st === 'no') setTimeout(() => this.guide.step() === 'no' && this.guide.close(), 5000);
      if (st === 'hub' && innerWidth < 700) setTimeout(() => this.guide.step() === 'hub' && this.guide.step.set('hidden'), 6000);
    });
  }

  private flyIn(el: HTMLImageElement): void {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const run = () => {
      const end = el.getBoundingClientRect();
      if (!end.height) return;
      // Vị trí nhân vật trên ảnh nền (sky-bg báo), không có thì đoán theo bố cục nền.
      const b = guideStage.box ?? { x: innerWidth * 0.1 - end.width * 1.2, y: innerHeight * 0.44 - end.height * 1.2, w: end.width * 2.4, h: end.height * 2.4 };
      const s = b.h / end.height;
      el.animate(
        [
          { transform: `translate(${b.x - end.left}px, ${b.y - end.top}px) scale(${s})`, opacity: 0.18, filter: 'blur(2px) drop-shadow(0 0 0 transparent)' },
          { opacity: 0.7, offset: 0.5 },
          { transform: 'translate(0, 0) scale(1)', opacity: 1, filter: 'blur(0) drop-shadow(0 10px 18px rgba(0,0,0,.25))' },
        ],
        { duration: 900, easing: 'cubic-bezier(.2, .9, .25, 1.15)' },
      );
    };
    if (el.complete) run();
    else el.addEventListener('load', run, { once: true });
  }

  go(): void {
    this.guide.goPlay();
  }

  close(): void {
    this.guide.close();
  }
}

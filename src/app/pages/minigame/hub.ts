import { Component, ElementRef, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';

interface GameCard {
  path: string | null;
  title: string;
  tag: string;
  desc: string;
  art: 'shmup' | 'gacha' | 'soon';
}

/** Trang chọn mini game: carousel thẻ game, mặc định đen trắng — rê chuột / chọn mới hiện màu. */
@Component({
  selector: 'app-minigame-hub',
  imports: [RouterLink, NgTemplateOutlet],
  template: `
    <div class="container wrap">
      <header class="head">
        <span class="chip">🎮 Mini game</span>
        <h1>Chọn <span class="hl">trò chơi</span></h1>
        <p class="muted">Rê chuột (hoặc chạm) vào một tựa game để xem, bấm để chơi ngay.</p>
      </header>

      <div class="carousel">
        <button class="arrow left" type="button" (click)="scroll(-1)" aria-label="Game trước">‹</button>
        <div class="track" #track>
          @for (g of games; track g.title) {
            @if (g.path) {
              <a class="card" [routerLink]="g.path" [attr.aria-label]="'Chơi ' + g.title">
                <ng-container *ngTemplateOutlet="body; context: { $implicit: g }" />
              </a>
            } @else {
              <div class="card locked" aria-disabled="true">
                <ng-container *ngTemplateOutlet="body; context: { $implicit: g }" />
              </div>
            }
          }
        </div>
        <button class="arrow right" type="button" (click)="scroll(1)" aria-label="Game sau">›</button>
      </div>
    </div>

    <ng-template #body let-g>
      <div class="art" [class]="'art art-' + g.art" aria-hidden="true">
        @switch (g.art) {
          @case ('shmup') {
            <span class="blt b1"></span><span class="blt b2"></span><span class="blt b3"></span><span class="blt b4"></span><span class="blt b5"></span>
            <span class="boss"></span>
            <span class="ship"></span>
          }
          @case ('gacha') {
            <span class="ray"></span>
            <span class="bag"><b>?</b></span>
            <span class="spark s1">✦</span><span class="spark s2">✦</span><span class="spark s3">✦</span>
          }
          @default {
            <span class="lock">🔒</span>
          }
        }
        <span class="shine"></span>
      </div>
      <div class="info">
        <span class="tag">{{ g.tag }}</span>
        <h2>{{ g.title }}</h2>
        <p>{{ g.desc }}</p>
        <span class="play">{{ g.path ? '▶ Chơi ngay' : 'Sắp ra mắt' }}</span>
      </div>
    </ng-template>
  `,
  styles: `
    .wrap { padding: 28px 0 64px; }
    .head { text-align: center; margin-bottom: 28px; }
    .head h1 { margin: 8px 0 6px; font-size: clamp(1.8rem, 4vw, 2.6rem); }
    .hl { color: var(--primary); }
    .muted { color: var(--muted); }

    .carousel { position: relative; }
    .track {
      display: flex; gap: 24px; overflow-x: auto; scroll-snap-type: x mandatory; scroll-behavior: smooth;
      /* Chừa chỗ cho nút ‹ › hai bên; thẻ đầu tiên nằm sát lề trái, không bị khoảng trống. */
      padding: 24px 60px; scroll-padding-inline: 60px; scrollbar-width: none;
    }
    .track::-webkit-scrollbar { display: none; }
    .arrow {
      position: absolute; top: 50%; z-index: 2; transform: translateY(-50%); width: 44px; height: 44px; border-radius: 50%;
      border: 1.5px solid var(--border); background: var(--surface); color: var(--primary-dark); font-size: 1.6rem; line-height: 1;
      cursor: pointer; box-shadow: var(--shadow);
    }
    .arrow.left { left: 0; }
    .arrow.right { right: 0; }

    /* Thẻ game: mặc định mờ + đen trắng; hover / focus mới hiện màu và hiệu ứng. */
    .card {
      position: relative; flex: 0 0 min(340px, 78vw); scroll-snap-align: start; display: flex; flex-direction: column;
      border-radius: 20px; overflow: hidden; background: var(--surface); border: 1.5px solid var(--border); color: inherit;
      filter: grayscale(1) brightness(.8); opacity: .55; transform: scale(.94);
      transition: filter .45s ease, opacity .45s ease, transform .45s cubic-bezier(.2,1.3,.4,1), box-shadow .45s ease, border-color .45s ease;
    }
    a.card:hover, a.card:focus-visible {
      filter: none; opacity: 1; transform: scale(1.03) translateY(-6px); outline: none;
      border-color: var(--primary); box-shadow: 0 24px 50px -10px color-mix(in srgb, var(--primary) 55%, transparent), 0 0 0 4px var(--primary-100);
    }
    .card.locked { cursor: not-allowed; }

    .art { position: relative; height: 230px; overflow: hidden; }
    .shine {
      position: absolute; inset: 0; pointer-events: none;
      background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,.45) 45%, transparent 60%);
      transform: translateX(-120%);
    }
    a.card:hover .shine, a.card:focus-visible .shine { transition: transform .9s ease; transform: translateX(120%); }

    .info { padding: 18px 20px 22px; display: flex; flex-direction: column; gap: 6px; }
    .info h2 { margin: 0; font-size: 1.35rem; }
    .info p { margin: 0; color: var(--muted); font-size: .92rem; }
    .tag { align-self: flex-start; font-size: .72rem; font-weight: 800; padding: 3px 10px; border-radius: 999px; background: var(--surface-2); color: var(--primary-dark); }
    .play { margin-top: 8px; align-self: flex-start; font-weight: 800; padding: 9px 18px; border-radius: 999px; background: var(--primary); color: var(--on-primary); }
    .locked .play { background: var(--surface-2); color: var(--muted); }

    /* --- Ảnh minh hoạ: game bắn đạn --- */
    .art-shmup { background: linear-gradient(#1a0f2e, #0b1630); }
    .blt { position: absolute; top: -12px; width: 12px; height: 12px; border-radius: 50%; background: radial-gradient(#fff 40%, #ff7ac6 55%, transparent 70%); animation: fall 2.2s linear infinite paused; }
    .b1 { left: 15%; } .b2 { left: 35%; animation-delay: -.5s; background: radial-gradient(#fff 40%, #4dabff 55%, transparent 70%); }
    .b3 { left: 55%; animation-delay: -1s; } .b4 { left: 72%; animation-delay: -1.5s; background: radial-gradient(#fff 40%, #b06bff 55%, transparent 70%); }
    .b5 { left: 88%; animation-delay: -.8s; }
    .boss { position: absolute; top: 26px; left: 50%; width: 90px; height: 50px; margin-left: -45px; border-radius: 50%;
      background: radial-gradient(ellipse at 30% 50%, #a77bff 55%, transparent 56%), radial-gradient(ellipse at 70% 50%, #a77bff 55%, transparent 56%);
      filter: drop-shadow(0 0 12px #ff7ac6); }
    .ship { position: absolute; bottom: 22px; left: 50%; width: 30px; height: 30px; margin-left: -15px; border-radius: 50%;
      background: radial-gradient(circle at 50% 40%, #ffe2c4 55%, #7ec8ff 56%); box-shadow: 0 0 14px #ff9ec4; animation: dodge 2.2s ease-in-out infinite paused; }

    /* --- Ảnh minh hoạ: túi mù --- */
    .art-gacha { background: radial-gradient(circle at 50% 55%, #ffd23f55, transparent 60%), linear-gradient(135deg, #2a1050, #5a1f6e); display: grid; place-items: center; }
    .ray { position: absolute; width: 400px; height: 400px; background: repeating-conic-gradient(#ffd23f22 0 10deg, transparent 10deg 20deg); animation: spin 12s linear infinite paused; }
    .bag { position: relative; width: 110px; height: 130px; border-radius: 18px 18px 28px 28px; display: grid; place-items: center;
      background: linear-gradient(145deg, #ff7ac6, #b06bff); box-shadow: 0 14px 30px rgba(0,0,0,.4), inset 0 -10px 20px rgba(0,0,0,.2); animation: shake 1.2s ease-in-out infinite paused; }
    .bag::before { content: ''; position: absolute; top: -14px; width: 60px; height: 24px; border: 6px solid #ffd23f; border-bottom: none; border-radius: 30px 30px 0 0; }
    .bag b { font-size: 3.4rem; color: #fff; text-shadow: 0 0 16px #ffd23f; }
    .spark { position: absolute; color: #ffd23f; font-size: 1.4rem; animation: twinkle 1.6s ease-in-out infinite paused; }
    .s1 { top: 30px; left: 60px; } .s2 { top: 60px; right: 55px; animation-delay: -.6s; } .s3 { bottom: 40px; left: 80px; animation-delay: -1.1s; }

    .art-soon { background: repeating-linear-gradient(45deg, var(--surface-2) 0 14px, var(--surface) 14px 28px); display: grid; place-items: center; font-size: 3rem; }

    /* Chỉ chạy hoạt ảnh khi đang hover / chọn thẻ. */
    a.card:hover .art *, a.card:focus-visible .art * { animation-play-state: running; }

    @keyframes fall { to { transform: translateY(260px); } }
    @keyframes dodge { 25% { transform: translateX(-50px); } 75% { transform: translateX(50px); } }
    @keyframes spin { to { transform: rotate(1turn); } }
    @keyframes shake { 0%, 100% { transform: rotate(0); } 20% { transform: rotate(-6deg); } 40% { transform: rotate(6deg); } 60% { transform: rotate(-3deg); } }
    @keyframes twinkle { 50% { opacity: .2; transform: scale(.6); } }

    /* Màn hình cảm ứng không có hover: hiện màu sẵn. */
    @media (max-width: 600px) { .track { padding: 24px 16px; scroll-padding-inline: 16px; } .arrow { display: none; } }
    @media (hover: none) { .card:not(.locked) { filter: none; opacity: 1; transform: none; } .card:not(.locked) .art * { animation-play-state: running; } }
    @media (prefers-reduced-motion: reduce) { .art * { animation: none !important; } .card { transition: filter .3s, opacity .3s; } }
  `,
})
export class MiniGameHubPage {
  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');

  readonly games: GameCard[] = [
    {
      path: '/mini-game/tui-mu',
      title: 'Túi mù may mắn',
      tag: '🎁 Gacha · Mới',
      desc: 'Bóc túi mù xem hôm nay số phận chọn bé thú bông nào cho bạn!',
      art: 'gacha',
    },
    {
      path: '/mini-game/dai-chien-mot-vai',
      title: 'Đại chiến Mọt Vải',
      tag: '🚀 Bắn đạn · Né đạn',
      desc: 'Né mưa đạn, hạ bầy mọt vải và đánh bại Nữ hoàng Mọt.',
      art: 'shmup',
    },
    {
      path: null,
      title: 'Game bí mật',
      tag: '⏳ Sắp ra mắt',
      desc: 'Một trò chơi mới đang được chuẩn bị. Quay lại sau nhé!',
      art: 'soon',
    },
  ];

  scroll(dir: -1 | 1): void {
    const el = this.track().nativeElement;
    el.scrollBy({ left: dir * Math.min(364, el.clientWidth * 0.8), behavior: 'smooth' });
  }
}

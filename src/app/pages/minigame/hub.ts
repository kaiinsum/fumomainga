import { AfterViewInit, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { startFireworks } from './fireworks';
import { sfx } from '../../shared/sfx';
import { SoundToggleComponent } from '../../shared/sound-toggle';

const HIDE_INTRO_KEY = 'fumo.minigame.hideIntro';
function readHideIntro(): boolean {
  try {
    return localStorage.getItem(HIDE_INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

interface GameCard {
  path: string | null;
  title: string;
  tag: string;
  desc: string;
  art: 'shmup' | 'gacha' | 'dle' | 'ninja' | 'jp' | 'soon';
}

/** Trang chọn mini game: carousel thẻ game, mặc định đen trắng — rê chuột / chọn mới hiện màu. */
@Component({
  selector: 'app-minigame-hub',
  imports: [RouterLink, NgTemplateOutlet, SoundToggleComponent],
  template: `
    <div class="container wrap">
      <header class="head">
        <span class="chip">🎮 Mini game</span>
        <h1>Chọn <span class="hl">trò chơi</span></h1>
        <p class="muted">Rê chuột (hoặc chạm) vào một tựa game để xem, bấm để chơi ngay.</p>
        <app-sound-toggle />
      </header>

      <div class="carousel" [class.show]="!intro()">
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
      @if (!intro()) {
        <p class="replay"><button type="button" (click)="replayIntro()">🎆 Xem lại màn mở đầu</button></p>
      }
    </div>

    @if (intro()) {
      <div class="fw-layer" (click)="skipIntro()" title="Bấm để bỏ qua">
        <canvas #fw aria-hidden="true"></canvas>
        <span class="fw-title">🎆 Mini game 🎆</span>
        <label class="fw-hide" (click)="$event.stopPropagation()">
          <input type="checkbox" [checked]="hideIntro()" (change)="setHideIntro($any($event.target).checked)" />
          Không hiện lại lần sau
        </label>
        <!-- Hai cánh màn sân khấu kéo sang hai bên -->
        <span class="curtain left" aria-hidden="true"></span>
        <span class="curtain right" aria-hidden="true"></span>
        <span class="valance" aria-hidden="true"></span>
        <button class="fw-skip" type="button" (click)="skipIntro()">Bỏ qua ›</button>
      </div>
    }

    <ng-template #body let-g>
      <div class="art" [class]="'art art-' + g.art" aria-hidden="true">
        @switch (g.art) {
          @case ('shmup') {
            <span class="blt b1"></span><span class="blt b2"></span><span class="blt b3"></span><span class="blt b4"></span><span class="blt b5"></span>
            <span class="boss"></span>
            <span class="ship"></span>
          }
          @case ('jp') {
            <img class="jpf f1" src="jp-type/remilia.webp" alt="" /><b class="jpw w1">猫</b>
            <img class="jpf f2" src="jp-type/cirno.webp" alt="" /><b class="jpw w2">さくら</b>
            <img class="jpf f3" src="jp-type/teto.webp" alt="" /><b class="jpw w3">幻想郷</b>
            <span class="jpkey">neko_</span>
          }
          @case ('ninja') {
            <img class="nj n1" src="fumo-ninja/cirno.webp" alt="" />
            <img class="nj n2" src="fumo-ninja/yukari.webp" alt="" />
            <img class="nj bomb" src="fumo-ninja/reimu.webp" alt="" />
            <span class="slash"></span>
          }
          @case ('dle') {
            <span class="dle-grid">
              <i class="g"></i><i class="y"></i><i class="r"></i><i class="g"></i>
              <i class="r"></i><i class="g"></i><i class="g"></i><i class="y"></i>
              <i class="g"></i><i class="g"></i><i class="g"></i><i class="g"></i>
            </span>
            <span class="who">?</span>
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

    .carousel { position: relative; opacity: 0; transform: translateY(30px) scale(.97); transition: opacity .7s ease, transform .8s cubic-bezier(.2,1.2,.4,1); }
    .carousel.show { opacity: 1; transform: none; }
    .carousel.show .card { animation: card-in .7s cubic-bezier(.2,1.3,.4,1) both; }
    .carousel.show .card:nth-child(2) { animation-delay: .12s; }
    .carousel.show .card:nth-child(3) { animation-delay: .24s; }
    .carousel.show .card:nth-child(4) { animation-delay: .36s; }
    @keyframes card-in { from { opacity: 0; transform: translateY(40px) scale(.85) rotate(-3deg); } }
    .fw-layer { position: fixed; inset: 0; z-index: 90; cursor: pointer; background: radial-gradient(circle at 50% 60%, rgba(30,10,50,.55), rgba(5,3,15,.88));
      display: grid; place-items: center; animation: fw-in .35s ease both; }
    .fw-layer canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
    .fw-title { position: relative; z-index: 1; font-size: clamp(2rem, 6vw, 3.6rem); font-weight: 900; color: #fff; text-shadow: 0 0 24px #ff7ac6, 0 0 48px #b06bff; animation: fw-pop 1s cubic-bezier(.2,1.5,.4,1) 1.2s both; }
    .curtain { position: absolute; top: 0; bottom: 0; width: 51%; z-index: 2; pointer-events: none;
      background:
        linear-gradient(90deg, rgba(0,0,0,.35), transparent 8%, transparent 92%, rgba(0,0,0,.35)),
        repeating-linear-gradient(90deg, #7d0f1f 0 18px, #a3172b 18px 34px, #c42a3e 34px 42px, #a3172b 42px 58px, #7d0f1f 58px 72px);
      box-shadow: inset 0 -30px 40px rgba(0,0,0,.35); }
    .curtain.left { left: 0; border-right: 6px solid #e8b83a; animation: open-left 1.5s cubic-bezier(.7,0,.2,1) .35s both; transform-origin: left center; }
    .curtain.right { right: 0; border-left: 6px solid #e8b83a; animation: open-right 1.5s cubic-bezier(.7,0,.2,1) .35s both; transform-origin: right center; }
    .valance { position: absolute; top: 0; left: 0; right: 0; height: 54px; z-index: 3; pointer-events: none;
      background: radial-gradient(circle at 30px -10px, #a3172b 34px, transparent 35px) 0 0 / 60px 54px repeat-x, linear-gradient(#7d0f1f, #a3172b);
      border-bottom: 4px solid #e8b83a; box-shadow: 0 6px 16px rgba(0,0,0,.4); animation: lift 1s ease 1.6s both; }
    @keyframes open-left { from { transform: translateX(0) scaleX(1); } to { transform: translateX(-96%) scaleX(.6); } }
    @keyframes open-right { from { transform: translateX(0) scaleX(1); } to { transform: translateX(96%) scaleX(.6); } }
    @keyframes lift { to { transform: translateY(-100%); } }
    .fw-hide { position: absolute; z-index: 3; top: calc(50% + clamp(2.4rem, 6vw, 3.6rem)); display: inline-flex; align-items: center; gap: 8px;
      padding: 6px 14px; border-radius: 999px; background: rgba(0,0,0,.35); color: #fff; font-weight: 700; font-size: .9rem; cursor: pointer;
      animation: fw-pop .8s ease 1.6s both; }
    .fw-hide input { width: 16px; height: 16px; accent-color: #ff7ac6; cursor: pointer; }
    .replay { text-align: center; margin: 18px 0 0; }
    .replay button { font: inherit; font-size: .85rem; font-weight: 700; padding: 6px 14px; border-radius: 999px; border: 1.5px solid var(--border); background: var(--surface); color: var(--muted); cursor: pointer; }
    .replay button:hover { color: var(--primary); border-color: var(--primary); }
    .fw-skip { z-index: 4; position: absolute; right: 18px; bottom: 18px; font: inherit; font-weight: 700; padding: 8px 16px; border-radius: 999px; border: 1.5px solid rgba(255,255,255,.6); background: rgba(255,255,255,.1); color: #fff; cursor: pointer; }
    @keyframes fw-in { from { opacity: 0; } }
    @keyframes fw-pop { from { opacity: 0; transform: scale(.4); } }
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

    .art-ninja { background: linear-gradient(#3b2416, #1f130c); }
    .nj { position: absolute; width: 92px; height: 92px; object-fit: contain; animation: nj-toss 2.4s ease-in-out infinite paused; filter: drop-shadow(0 6px 8px rgba(0,0,0,.5)); }
    .nj.n1 { left: 24px; top: 70px; }
    .nj.n2 { left: 122px; top: 30px; animation-delay: -.8s; }
    .nj.bomb { right: 26px; top: 60px; animation-delay: -1.6s; filter: drop-shadow(0 0 10px #ff1744) drop-shadow(0 0 18px #ff1744); }
    .slash { position: absolute; left: 10%; top: 55%; width: 80%; height: 6px; border-radius: 6px; background: linear-gradient(90deg, transparent, #fff, transparent);
      transform: rotate(-18deg) scaleX(0); box-shadow: 0 0 14px #bfe8ff; animation: nj-slash 2.4s ease-in-out infinite paused; }
    @keyframes nj-toss { 0%, 100% { transform: translateY(40px) rotate(-10deg); } 50% { transform: translateY(-10px) rotate(12deg); } }
    @keyframes nj-slash { 0%, 40% { transform: rotate(-18deg) scaleX(0); opacity: 0; } 50% { transform: rotate(-18deg) scaleX(1); opacity: 1; } 65%, 100% { transform: rotate(-18deg) scaleX(1); opacity: 0; } }
    .art-jp { background: linear-gradient(#120c2e, #3b1d5c 60%, #a8467a); }
    .jpf { position: absolute; width: 64px; height: 64px; object-fit: contain; animation: jp-fall 3s linear infinite paused; filter: drop-shadow(0 4px 6px rgba(0,0,0,.5)); }
    .jpw { position: absolute; padding: 2px 8px; border-radius: 8px; background: #fff; color: #2b2140; font-size: .95rem; animation: jp-fall 3s linear infinite paused; }
    .f1, .w1 { left: 22px; } .f2, .w2 { left: 112px; animation-delay: -1s; } .f3, .w3 { left: 200px; animation-delay: -2s; }
    .jpf { top: 34px; } .jpw { top: 10px; }
    .jpkey { position: absolute; left: 50%; bottom: 10px; translate: -50% 0; padding: 4px 14px; border-radius: 8px; background: rgba(20,12,40,.85);
      color: #ffd23f; font: 700 1rem ui-monospace, Consolas, monospace; border: 2px solid #6b4fd6; }
    @keyframes jp-fall { 0% { transform: translateY(-70px); opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { transform: translateY(80px); opacity: 0; } }
    .art-dle { background: linear-gradient(135deg, #1b2a4a, #3a1c5c); display: grid; place-items: center; }
    .dle-grid { display: grid; grid-template-columns: repeat(4, 34px); gap: 6px; }
    .dle-grid i { width: 34px; height: 34px; border-radius: 7px; animation: tile 2.4s ease-in-out infinite paused; }
    .dle-grid i:nth-child(4n+2) { animation-delay: .15s; } .dle-grid i:nth-child(4n+3) { animation-delay: .3s; } .dle-grid i:nth-child(4n+4) { animation-delay: .45s; }
    .dle-grid .g { background: #2fbf71; } .dle-grid .y { background: #e2a72e; } .dle-grid .r { background: #d9534f; }
    .who { position: absolute; right: 26px; bottom: 18px; width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center;
      font-size: 2.2rem; font-weight: 900; color: #fff; background: rgba(255,255,255,.12); border: 2px dashed rgba(255,255,255,.6); }
    @keyframes tile { 0%, 100% { transform: rotateX(0); } 50% { transform: rotateX(180deg); } }
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
export class MiniGameHubPage implements AfterViewInit {
  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');
  private readonly fw = viewChild<ElementRef<HTMLCanvasElement>>('fw');
  /** Người xem đã chọn "Không hiện lại lần sau" (lưu trên máy người xem). */
  readonly hideIntro = signal(readHideIntro());
  /** Đang chiếu màn mở + pháo hoa (carousel chưa hiện). */
  readonly intro = signal(!this.hideIntro() && !matchMedia('(prefers-reduced-motion: reduce)').matches);
  private stopFw?: () => void;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopFw?.());
  }

  ngAfterViewInit(): void {
    if (this.intro()) this.playIntro();
  }

  private playIntro(): void {
    const canvas = this.fw()?.nativeElement;
    if (!canvas) return;
    sfx.play('curtain');
    // Màn mở ra trong ~1.8s đầu, pháo hoa bắn phía sau rồi tiếp tục sau khi màn mở.
    this.stopFw = startFireworks(canvas, 3000, () => this.intro.set(false));
  }

  skipIntro(): void {
    this.stopFw?.();
    this.intro.set(false);
  }

  setHideIntro(hide: boolean): void {
    this.hideIntro.set(hide);
    try {
      if (hide) localStorage.setItem(HIDE_INTRO_KEY, '1');
      else localStorage.removeItem(HIDE_INTRO_KEY);
    } catch {
      /* bỏ qua */
    }
  }

  /** Xem lại màn mở đầu (cũng là chỗ bật lại nếu đã chọn "không hiện lại"). */
  replayIntro(): void {
    this.intro.set(true);
    requestAnimationFrame(() => this.playIntro());
  }

  readonly games: GameCard[] = [
    {
      path: '/mini-game/go-chu-diet-fumo',
      title: 'Gõ chữ diệt Fumo',
      tag: '⌨️ Gõ chữ · Tiếng Nhật · Mới',
      desc: 'Fumo mang chữ tiếng Nhật rơi từ trời xuống — gõ đúng cách đọc để tiêu diệt, phản đòn boss. 3 mức từ hiragana tới kanji khó!',
      art: 'jp',
    },
    {
      path: '/mini-game/tui-mu',
      title: 'Túi mù may mắn',
      tag: '🎁 Gacha · Mới',
      desc: 'Bóc túi mù xem hôm nay số phận chọn bé thú bông nào cho bạn!',
      art: 'gacha',
    },
    {
      path: '/mini-game/doan-nhan-vat',
      title: 'Đoán nhân vật (Touhoudle)',
      tag: '🔎 Đố vui · Mỗi ngày',
      desc: 'Đoán nhân vật bí ẩn qua chủng loài, game đầu tiên, nơi ở, màu tóc... Mỗi ngày một nhân vật mới!',
      art: 'dle',
    },
    {
      path: '/mini-game/fumo-ninja',
      title: 'Fumo Ninja',
      tag: '🗡️ Chém fumo · Mới',
      desc: 'Vuốt để chém các bé fumo bay lên. Cẩn thận Reimu viền neon đỏ — chém trúng là thua!',
      art: 'ninja',
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

import { AfterViewInit, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GameArt, GameCategory, gameCategories, resolveGames } from '../../models/minigames';
import { GuideService } from '../../components/guide/guide.service';
import { MinigameAccessService } from '../../services/minigame-access.service';
import { SettingsService } from '../../services/settings.service';
import { startFireworks } from './fireworks';
import { sfx } from '../../shared/sfx';
import { SoundToggleComponent } from '../../shared/sound-toggle';
import { IconComponent } from '../../shared/icon';

const HIDE_INTRO_KEY = 'fumo.minigame.hideIntro';
const VIEW_KEY = 'fumo.minigame.view';
type HubView = 'scroll' | 'list';
function readView(): HubView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'scroll';
  } catch {
    return 'scroll';
  }
}
function readHideIntro(): boolean {
  try {
    return localStorage.getItem(HIDE_INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

interface GameCard {
  id: string;
  path: string | null;
  /** Game đang mở nhưng hôm nay cần code mới chơi được. */
  needCode: boolean;
  /** Đang giới hạn và game này nằm trong các trò miễn phí hôm nay. */
  freeToday: boolean;
  title: string;
  tag: string;
  desc: string;
  art: GameArt | 'soon';
  /** Có nội dung = game đang bị khoá. */
  lockMsg: string;
  cats: GameCategory[];
}

/** Trang chọn mini game: carousel thẻ game, mặc định đen trắng - rê chuột / chọn mới hiện màu. */
@Component({
  selector: 'app-minigame-hub',
  imports: [RouterLink, NgTemplateOutlet, SoundToggleComponent, IconComponent],
  template: `
    <div class="container wrap">
      <header class="head">
        <span class="chip">🎮 Mini game</span>
        <h1>Chọn <span class="hl">trò chơi</span></h1>
        <p class="muted">Rê chuột (hoặc chạm) vào một tựa game để xem, bấm để chơi ngay.</p>
        <app-sound-toggle />
      </header>

      @if (access.limited()) {
        <section class="daily" [class.ok]="access.unlocked()" id="code-box">
          @if (access.unlocked()) {
            <p class="daily-ok">🎉 <b>Đã mở khoá tất cả trò chơi</b> đến hết hôm nay (23:59). Chơi thả ga nhé!</p>
          } @else {
            <div class="daily-text">
              <b>🎟 Hôm nay mở miễn phí {{ freeTitles().length }} trò:</b> {{ freeTitles().join(' · ') }}
              <small>Có <b>code hôm nay</b> thì mở được tất cả trò chơi đến hết ngày. Code đổi mỗi ngày.</small>
            </div>
            <form class="code-form" (submit)="$event.preventDefault(); submitCode()">
              <input #codeInput [value]="code()" (input)="code.set($any($event.target).value); codeError.set('')" placeholder="Nhập code" maxlength="12"
                autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Code mở khoá minigame" [class.bad]="!!codeError()" />
              <button class="btn primary" type="submit" [disabled]="checking() || !code().trim()">{{ checking() ? 'Đang kiểm tra…' : '🔓 Mở khoá' }}</button>
            </form>
            @if (codeError()) { <p class="code-err" role="alert">⚠ {{ codeError() }}</p> }
            @if (codeFor(); as c) { <p class="code-for">🔒 <b>{{ c.title }}</b> hôm nay cần code mới chơi được.</p> }
          }
        </section>
      }

      @if (blockedGame(); as b) {
        <p class="blocked" role="alert">🔒 <b>{{ b.title }}</b> {{ b.status === 'hidden' ? 'hiện không mở cho người chơi.' : 'đang tạm khoá - ' + b.lockMsg }}
          <button type="button" (click)="blockedId.set(null)" aria-label="Đóng">✕</button></p>
      }
      @if (!intro()) {
        <div class="view-switch" role="radiogroup" aria-label="Kiểu xem trò chơi">
          <button type="button" role="radio" [attr.aria-checked]="view() === 'scroll'" [class.on]="view() === 'scroll'" (click)="setView('scroll')">↔ Cuộn ngang</button>
          <button type="button" role="radio" [attr.aria-checked]="view() === 'list'" [class.on]="view() === 'list'" (click)="setView('list')">▦ Danh sách</button>
        </div>
      }
      @if (!intro() && cats().length) {
        <div class="cat-filter" role="radiogroup" aria-label="Lọc theo phân loại">
          <button type="button" role="radio" [attr.aria-checked]="!catFilter()" [class.on]="!catFilter()" (click)="catFilter.set(null)">Tất cả</button>
          @for (c of cats(); track c.id) {
            <button type="button" role="radio" [attr.aria-checked]="catFilter() === c.id" [class.on]="catFilter() === c.id" (click)="catFilter.set(c.id)"><app-icon [icon]="c.icon" /> {{ c.name }}</button>
          }
        </div>
      }
      <div class="carousel" [class.show]="!intro()" [class.list]="view() === 'list'">
        @if (view() === 'scroll') {
          <button class="arrow left" type="button" (click)="scroll(-1)" aria-label="Game trước">‹</button>
        }
        <div class="track" #track (mouseleave)="guide.hoverGame(null)">
          @for (g of shown(); track g.id) {
            @if (g.path && g.needCode) {
              <button type="button" class="card need-code" (mouseenter)="guide.hoverGame(g.id)" (focus)="guide.hoverGame(g.id)" (click)="askCode(g)" [attr.aria-label]="g.title + ' - cần code hôm nay'">
                <ng-container *ngTemplateOutlet="body; context: { $implicit: g }" />
              </button>
            } @else if (g.path) {
              <a class="card" (mouseenter)="guide.hoverGame(g.id)" (focus)="guide.hoverGame(g.id)" [routerLink]="g.path" [attr.aria-label]="'Chơi ' + g.title">
                <ng-container *ngTemplateOutlet="body; context: { $implicit: g }" />
              </a>
            } @else {
              <div class="card locked" aria-disabled="true" (mouseenter)="guide.hoverGame(g.id)">
                <ng-container *ngTemplateOutlet="body; context: { $implicit: g }" />
              </div>
            }
          }
        </div>
        @if (view() === 'scroll') {
          <button class="arrow right" type="button" (click)="scroll(1)" aria-label="Game sau">›</button>
        }
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
          @case ('merge') {
            <span class="mg-box"></span>
            <img class="mg m1" src="fumo-ninja/cirno.webp" alt="" />
            <img class="mg m2" src="fumo-ninja/cirno.webp" alt="" />
            <img class="mg m3" src="fumo-ninja/meiling.webp" alt="" />
            <img class="mg m4" src="fumo-ninja/reimu.webp" alt="" />
            <span class="mg-plus">+</span>
          }
          @case ('crush') {
            <span class="cr-grid">
              @for (f of crushArt; track $index) {
                <img [class]="'cr ' + f.c" [src]="'fumo-ninja/' + f.id + '.webp'" alt="" />
              }
            </span>
            <span class="cr-zap"></span>
          }
          @case ('piano') {
            <span class="pn-lanes"><i></i><i></i><i></i><i></i></span>
            <span class="pn-tile t1"></span><span class="pn-tile t2"></span><span class="pn-tile t3"></span>
            <img class="pn-fumo" src="jp-type/cirno.webp" alt="" />
            <span class="pn-note n1">♪</span><span class="pn-note n2">♫</span>
            <span class="pn-perfect">PERFECT!</span>
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
        @if (g.lockMsg || g.needCode) {
          <!-- Dây xích chéo + ổ khoá -->
          <span class="chains" [class.code]="g.needCode" aria-hidden="true">
            <i class="chain c1"></i><i class="chain c2"></i>
            <svg class="padlock" viewBox="0 0 48 56">
              <path d="M12 24V16a12 12 0 0 1 24 0v8" fill="none" stroke="#cfd6de" stroke-width="6" stroke-linecap="round"/>
              <rect x="4" y="22" width="40" height="32" rx="7" fill="#f4b400" stroke="#9a6b00" stroke-width="2.5"/>
              <circle cx="24" cy="35" r="4.5" fill="#5a3d00"/><rect x="22" y="37" width="4" height="9" rx="2" fill="#5a3d00"/>
            </svg>
          </span>
        }
      </div>
      <div class="info">
        <span class="tag">{{ g.tag }}</span>
        @if (g.cats.length) {
          <span class="cats">@for (c of g.cats; track c.id) { <i><app-icon [icon]="c.icon" /> {{ c.name }}</i> }</span>
        }
        @if (g.freeToday) { <span class="free-badge">🎟 Miễn phí hôm nay</span> }
        <h2>{{ g.title }}</h2>
        <p>{{ g.desc }}</p>
        @if (g.lockMsg) { <span class="lock-msg">🔒 {{ g.lockMsg }}</span> }
        <span class="play">{{ g.needCode ? '🔑 Nhập code để chơi' : g.path ? '▶ Chơi ngay' : g.lockMsg ? '🔒 Tạm khoá' : 'Sắp ra mắt' }}</span>
      </div>
    </ng-template>
  `,
  styles: `
    .wrap { padding: 28px 0 64px; }
    /* Lọc theo phân loại */
    .cat-filter { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin: 10px auto 2px; }
    .cat-filter button { font: inherit; font-weight: 700; font-size: .85rem; padding: 6px 14px; border-radius: 999px; cursor: pointer;
      border: 1.5px solid var(--border); background: var(--surface); color: var(--muted); transition: background .2s, color .2s, border-color .2s; }
    .cat-filter button.on { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
    .cat-filter button:not(.on):hover { border-color: var(--primary); color: var(--primary-dark); }
    .cats { display: flex; flex-wrap: wrap; gap: 4px; }
    .cats i { font-style: normal; font-size: .68rem; font-weight: 800; padding: 2px 8px; border-radius: 999px;
      background: color-mix(in srgb, var(--primary) 12%, var(--surface)); color: var(--primary-dark); }
    /* --- Ảnh minh hoạ: piano tiles --- */
    .art-piano { background: linear-gradient(160deg, #2b1055, #7597de); }
    .pn-lanes { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(4, 1fr); }
    .pn-lanes i { border-right: 1px solid rgba(255, 255, 255, .18); }
    .pn-tile { position: absolute; width: 25%; height: 70px; background: linear-gradient(#111, #333); border: 2px solid #ff7ac6;
      box-shadow: 0 0 14px #ff7ac6; border-radius: 6px; top: -80px; animation: pn-fall 2.4s linear infinite paused; }
    .pn-tile.t1 { left: 0; } .pn-tile.t2 { left: 50%; animation-delay: -.8s; } .pn-tile.t3 { left: 75%; animation-delay: -1.6s; border-color: #7af0ff; box-shadow: 0 0 14px #7af0ff; }
    .pn-fumo { position: absolute; left: 6%; bottom: 6px; height: 92px; filter: drop-shadow(0 4px 6px rgba(0,0,0,.4)); }
    .pn-note { position: absolute; color: #fff; font-size: 1.5rem; text-shadow: 0 0 8px #ff7ac6; animation: pn-note 2s ease-in-out infinite paused; }
    .pn-note.n1 { left: 30%; top: 40%; } .pn-note.n2 { left: 40%; top: 25%; animation-delay: -1s; }
    .pn-perfect { position: absolute; right: 8%; bottom: 18%; font-weight: 900; font-style: italic; color: #ffe066; text-shadow: 0 0 10px #ff7ac6, 2px 2px 0 #b0005b;
      font-size: 1.2rem; transform: rotate(-8deg); }
    a.card:hover .art-piano *, a.card:focus-visible .art-piano * { animation-play-state: running; }
    @keyframes pn-fall { to { top: 110%; } }
    @keyframes pn-note { 50% { transform: translateY(-14px) rotate(10deg); opacity: .6; } }
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
    /* Chọn kiểu xem: cuộn ngang / danh sách */
    .view-switch { display: flex; justify-content: center; gap: 0; margin: 0 auto 4px; width: fit-content;
      border: 1.5px solid var(--border); border-radius: 999px; padding: 3px; background: var(--surface); }
    .view-switch button { border: 0; background: none; font: inherit; font-weight: 700; font-size: .88rem; color: var(--muted);
      padding: 6px 14px; border-radius: 999px; cursor: pointer; transition: background .2s, color .2s; }
    .view-switch button.on { background: var(--primary); color: var(--on-primary); }
    .view-switch button:not(.on):hover { color: var(--primary-dark); }
    /* Kiểu danh sách: thẻ xếp lưới, xuống dòng, không cuộn ngang */
    .carousel.list .track { flex-wrap: wrap; justify-content: center; overflow: visible; scroll-snap-type: none; padding: 24px 0; }
    .carousel.list .card { flex: 1 1 280px; max-width: 360px; }
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
    /* Dây xích bắt chéo + ổ khoá trên ảnh thẻ game bị khoá / cần code */
    .chains { position: absolute; inset: 0; z-index: 3; pointer-events: none; overflow: hidden; display: grid; place-items: center; }
    .chain { position: absolute; left: -15%; width: 130%; height: 20px; top: calc(50% - 10px);
      background: radial-gradient(ellipse 11px 7px at center, transparent 52%, #c3cbd3 54%, #8a939c 72%, transparent 74%) 0 0 / 24px 20px repeat-x;
      filter: drop-shadow(0 3px 3px rgba(0, 0, 0, .55)); }
    .chain.c1 { transform: rotate(28deg); }
    .chain.c2 { transform: rotate(-28deg); }
    .padlock { position: relative; width: 58px; height: 68px; filter: drop-shadow(0 6px 8px rgba(0, 0, 0, .5)); }
    .chains.code .padlock rect { fill: #ffd23f; }
    a.card:hover .chains, a.card:focus-visible .chains, button.card:hover .chains { opacity: .9; }
    @media (max-width: 600px) { .padlock { width: 46px; height: 54px; } .chain { height: 16px; background-size: 20px 16px; } }
    button.card { font: inherit; color: inherit; text-align: left; padding: 0; cursor: pointer; }
    .need-code .play { background: #ffb800; color: #3a2a00; }
    .free-badge { align-self: flex-start; font-size: .72rem; font-weight: 800; padding: 3px 10px; border-radius: 999px; background: color-mix(in srgb, #3fcf74 20%, var(--surface)); color: #1f8a4c; }
    .daily { max-width: 820px; margin: 0 auto 18px; padding: 14px 18px; border-radius: 16px; display: grid; gap: 10px;
      background: color-mix(in srgb, #ffb800 12%, var(--surface)); border: 1.5px dashed #ffb800; scroll-margin-top: 90px; }
    .daily.ok { background: color-mix(in srgb, #3fcf74 14%, var(--surface)); border: 1.5px solid #3fcf74; }
    .daily-ok { margin: 0; text-align: center; }
    .daily-text { display: flex; flex-direction: column; gap: 2px; }
    .daily-text small { color: var(--muted); }
    .code-form { display: flex; gap: 8px; flex-wrap: wrap; }
    .code-form input { flex: 1 1 160px; min-width: 0; font: 800 1.05rem ui-monospace, Consolas, monospace; letter-spacing: .18em; text-transform: uppercase;
      padding: 10px 14px; border-radius: 12px; border: 2px solid var(--border); background: var(--surface); color: var(--text); }
    .code-form input:focus { outline: none; border-color: var(--primary); }
    .code-form input.bad { border-color: #d63638; background: color-mix(in srgb, #d63638 8%, var(--surface)); }
    .code-err { margin: 0; color: #d63638; font-weight: 700; font-size: .9rem; }
    .code-for { margin: 0; font-size: .9rem; }

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
    .lock-msg { margin-top: 4px; font-size: .82rem; font-weight: 700; color: #d63638; }
    .blocked { max-width: 720px; margin: 0 auto 16px; padding: 10px 14px; border-radius: 12px; display: flex; align-items: center; gap: 8px;
      background: color-mix(in srgb, #d63638 12%, var(--surface)); border: 1.5px solid #d63638; color: var(--text); }
    .blocked button { margin-left: auto; border: 0; background: none; color: inherit; cursor: pointer; font-size: 1rem; }

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
    .art-merge { background: radial-gradient(circle at 50% 30%, #fff3f8, #ffb8d4); }
    .mg-box { position: absolute; left: 50%; bottom: 10px; width: 230px; height: 150px; transform: translateX(-50%); border: 5px solid #ff9ec4; border-top: 0;
      border-radius: 0 0 26px 26px; background: rgba(255,255,255,.45); }
    .mg { position: absolute; border-radius: 50%; object-fit: contain; background: #fff; filter: drop-shadow(0 4px 6px rgba(150,40,90,.3)); animation: mg-fall 2.6s ease-in infinite paused; }
    .mg.m1 { width: 44px; height: 44px; left: calc(50% - 58px); top: 20px; box-shadow: 0 0 0 3px #2f9bff; }
    .mg.m2 { width: 44px; height: 44px; left: calc(50% + 14px); top: 20px; box-shadow: 0 0 0 3px #2f9bff; animation-delay: -.3s; }
    .mg.m3 { width: 60px; height: 60px; left: calc(50% - 30px); bottom: 20px; box-shadow: 0 0 0 3px #21d07a; animation-name: mg-pop; }
    .mg.m4 { width: 92px; height: 92px; right: calc(50% - 110px); bottom: 16px; box-shadow: 0 0 0 4px #ff4040; animation: none; }
    .mg-plus { position: absolute; left: calc(50% - 8px); top: 30px; font: 900 1.6rem/1 sans-serif; color: #ff5f9c; }
    @keyframes mg-fall { 0%, 20% { transform: translateY(0); } 60%, 100% { transform: translateY(70px); opacity: 0; } }
    @keyframes mg-pop { 0%, 55% { transform: scale(0); } 70% { transform: scale(1.2); } 100% { transform: scale(1); } }
    .art-crush { background: radial-gradient(circle at 50% 40%, #4b2a8a, #160b2e); }
    .cr-grid { position: absolute; inset: 14px 30px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    .cr { width: 100%; aspect-ratio: 1; object-fit: contain; border-radius: 10px; padding: 3px; border: 2px solid var(--g);
      background: radial-gradient(circle, color-mix(in srgb, var(--g) 55%, transparent), transparent 70%); filter: drop-shadow(0 0 6px var(--g));
      animation: cr-pop 2.4s ease-in-out infinite paused; }
    .cr.b { --g: #2f9bff; } .cr.g { --g: #21d07a; } .cr.y { --g: #ffd21f; } .cr.r { --g: #ff3b5c; } .cr.p { --g: #a35cff; } .cr.k { --g: #ff7ad9; }
    .cr:nth-child(5), .cr:nth-child(6), .cr:nth-child(7) { animation-name: cr-match; }
    .cr-zap { position: absolute; left: 20px; right: 20px; top: 50%; height: 6px; border-radius: 6px; background: #fff;
      box-shadow: 0 0 12px #ffd21f, 0 0 26px #ffd21f; opacity: 0; animation: cr-zap 2.4s ease-in-out infinite paused; }
    @keyframes cr-pop { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
    @keyframes cr-match { 0%, 40% { transform: scale(1); } 52% { transform: scale(1.25); filter: brightness(2) drop-shadow(0 0 12px var(--g)); } 64%, 100% { transform: scale(1); } }
    @keyframes cr-zap { 0%, 48% { opacity: 0; transform: scaleX(0); } 55% { opacity: 1; transform: scaleX(1); } 70%, 100% { opacity: 0; transform: scaleX(1); } }
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
    @media (max-width: 600px) { .track { padding: 18px 16px; scroll-padding-inline: 16px; gap: 12px; } .arrow { display: none; }
      /* Điện thoại: thẻ nhỏ gọn như thẻ sản phẩm - cuộn ngang ~1.7 thẻ / màn, danh sách 2 cột */
      .card { flex: 0 0 min(200px, 56vw); border-radius: 16px; }
      .art { height: 120px; }
      .info { padding: 10px 11px 12px; gap: 4px; }
      .info h2 { font-size: .98rem; line-height: 1.25; }
      .info p { font-size: .76rem; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .tag, .free-badge { font-size: .6rem; padding: 2px 7px; }
      .cats i { font-size: .58rem; padding: 1px 6px; }
      .play { margin-top: 4px; font-size: .78rem; padding: 6px 12px; }
      .lock-msg { font-size: .72rem; }
      .carousel.list .track { padding: 14px 0; gap: 10px; }
      .carousel.list .card { flex: 1 1 calc(50% - 5px); max-width: calc(50% - 5px); }
      .pn-fumo { height: 60px; } .pn-tile { height: 44px; } .pn-perfect { font-size: .85rem; }
      .cat-filter button { font-size: .76rem; padding: 5px 11px; } }
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

  private readonly settings = inject(SettingsService).settings;
  readonly guide = inject(GuideService);
  /** Phân loại (lọc). */
  readonly cats = computed(() => gameCategories(this.settings().gameCategories));
  readonly catFilter = signal<string | null>(null);
  /** Thẻ đang hiện theo bộ lọc phân loại. */
  readonly shown = computed(() => {
    const f = this.catFilter();
    return f ? this.games().filter((g) => g.cats.some((c) => c.id === f)) : this.games();
  });
  readonly access = inject(MinigameAccessService);
  private readonly router = inject(Router);
  private readonly codeInput = viewChild<ElementRef<HTMLInputElement>>('codeInput');
  /** Thẻ game theo thứ tự admin xếp; game bị ẩn không hiện, game bị khoá hiện mờ kèm lời nhắn. */
  readonly games = computed<GameCard[]>(() => {
    const limited = this.access.limited() && !this.access.unlocked();
    const free = this.access.freeIds();
    const list: GameCard[] = resolveGames(this.settings().minigames)
      .filter((g) => g.status !== 'hidden')
      .map((g) => ({
        id: g.id,
        path: g.status === 'open' ? g.path : null,
        needCode: g.status === 'open' && limited && !free.has(g.id),
        freeToday: g.status === 'open' && limited && free.has(g.id),
        title: g.title,
        tag: g.tag,
        desc: g.desc,
        art: g.art,
        lockMsg: g.status === 'locked' ? g.lockMsg : '',
        cats: g.cats.map((id) => this.cats().find((c) => c.id === id)).filter((c): c is GameCategory => !!c),
      }));
    if (this.settings().minigameComingSoon) {
      list.push({ id: 'soon', path: null, needCode: false, freeToday: false, title: 'Game bí mật', tag: '⏳ Sắp ra mắt', desc: 'Một trò chơi đang được chuẩn bị. Quay lại sau nhé!', art: 'soon', lockMsg: '', cats: [] });
    }
    // Trò đang chơi được lên trước, trò cần code / bị khoá dồn ra sau (trong mỗi nhóm giữ thứ tự admin xếp).
    const rank = (g: GameCard) => (g.id === 'soon' ? 3 : !g.path ? 2 : g.needCode ? 1 : 0);
    return list.map((g, i) => ({ g, i })).sort((a, b) => rank(a.g) - rank(b.g) || a.i - b.i).map((x) => x.g);
  });
  /** Tên các trò miễn phí hôm nay (theo thứ tự trên trang). */
  readonly freeTitles = computed(() => this.games().filter((g) => g.freeToday).map((g) => g.title));

  // ---------- Code mở khoá trong ngày ----------
  readonly code = signal('');
  readonly codeError = signal('');
  readonly checking = signal(false);
  /** Game khách vừa bấm (hoặc bị chuyển về từ link ?code=id) cần code. */
  readonly codeForId = signal<string | null>(inject(ActivatedRoute).snapshot.queryParamMap.get('code'));
  readonly codeFor = computed(() => {
    const id = this.codeForId();
    return id ? this.games().find((g) => g.id === id && g.needCode) : undefined;
  });

  askCode(g: GameCard): void {
    this.codeForId.set(g.id);
    document.getElementById('code-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => this.codeInput()?.nativeElement.focus({ preventScroll: true }), 350);
  }

  async submitCode(): Promise<void> {
    if (!this.code().trim() || this.checking()) return;
    this.checking.set(true);
    const err = await this.access.unlock(this.code());
    this.checking.set(false);
    this.codeError.set(err);
    if (!err) {
      this.code.set('');
      // Vừa mở khoá từ một game cụ thể → vào chơi luôn.
      const g = this.codeForId() ? this.games().find((x) => x.id === this.codeForId()) : undefined;
      this.codeForId.set(null);
      if (g?.path) void this.router.navigateByUrl(g.path);
    }
  }
  /** Bị chuyển về từ link của game đang khoá (?khoa=id). */
  readonly blockedGame = computed(() => {
    const id = this.blockedId();
    return id ? resolveGames(this.settings().minigames).find((g) => g.id === id) : undefined;
  });
  readonly blockedId = signal<string | null>(inject(ActivatedRoute).snapshot.queryParamMap.get('khoa'));

  readonly view = signal<HubView>(readView());
  /** Ảnh minh hoạ thẻ Fumo Crush Saga: lưới 4x2, hàng dưới có 3 bé cùng màu đang ghép. */
  readonly crushArt = [
    { id: 'cirno', c: 'b' }, { id: 'teto', c: 'r' }, { id: 'yukari', c: 'p' }, { id: 'meiling', c: 'g' },
    { id: 'flandre', c: 'y' }, { id: 'flandre', c: 'y' }, { id: 'flandre', c: 'y' }, { id: 'yuyuko', c: 'k' },
  ];

  setView(v: HubView): void {
    this.view.set(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* bỏ qua */
    }
  }

  scroll(dir: -1 | 1): void {
    const el = this.track().nativeElement;
    el.scrollBy({ left: dir * Math.min(364, el.clientWidth * 0.8), behavior: 'smooth' });
  }
}

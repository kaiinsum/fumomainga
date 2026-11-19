import { AfterViewInit, Component, DestroyRef, ElementRef, NgZone, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { gameParams } from '../../models/game-params';
import { SettingsService } from '../../services/settings.service';
import { GameSuggestComponent } from './game-suggest';
import { LeaderboardComponent } from './leaderboard';
import { SoundToggleComponent } from '../../shared/sound-toggle';
import { H, MergeGame, MergeResult, MergeState, TIERS, W } from './merge-engine';

@Component({
  selector: 'app-merge-fumo',
  imports: [RouterLink, SoundToggleComponent, GameSuggestComponent, LeaderboardComponent],
  template: `
    <div class="container wrap">
      <nav class="crumbs"><a routerLink="/mini-game">← Chọn game khác</a><app-sound-toggle /></nav>
      <header class="head">
        <span class="chip">🫧 Thả & gộp</span>
        <h1>Merge <span class="hl">Fumo</span></h1>
        <p class="muted">Thả các bé fumo vào hộp quà — 2 bé giống nhau chạm vào nhau sẽ gộp thành bé lớn hơn. Đừng để hộp tràn qua vạch đỏ nhé!</p>
      </header>

      <div class="layout">
        <app-leaderboard class="lb-slot" game="merge" [score]="state() === 'over' ? result()?.score : null" />
        <div class="stage" [style.aspect-ratio]="ratio">
          <canvas #cv aria-label="Màn chơi Merge Fumo"></canvas>
          @if (state() === 'title') {
            <div class="overlay">
              <h2>🫧 Merge Fumo</h2>
              <p>Di chuột / vuốt để chọn chỗ, bấm hoặc thả tay để thả bé xuống. Bàn phím: ← → và phím cách.</p>
              <button class="btn primary big" type="button" (click)="start()">▶ Bắt đầu</button>
              @if (best()) { <small>Kỷ lục: {{ best().toLocaleString('vi-VN') }}</small> }
            </div>
          }
          @if (state() === 'over') {
            <div class="overlay over">
              <h2>📦 Hộp quà tràn rồi!</h2>
              <p class="score">{{ result()?.score?.toLocaleString('vi-VN') }} điểm</p>
              <p>Gộp {{ result()?.merges }} lần · bé lớn nhất: <b>{{ tiers[result()?.biggest ?? 0].name }}</b></p>
              @if (result()?.newBest) { <p class="new">🏆 Kỷ lục mới!</p> }
              <button class="btn primary big" type="button" (click)="start()">🔁 Chơi lại</button>
            </div>
          }
        </div>

        <aside class="guide card-surface">
          <h2>Chuỗi tiến hoá</h2>
          <ol class="chain">
            @for (t of tiers; track t.id; let i = $index) {
              <li [style.--c]="t.color">
                <img [src]="'fumo-ninja/' + t.id + '.webp'" [alt]="t.name" [style.width.px]="22 + i * 3" [style.height.px]="22 + i * 3" />
                <span>{{ t.name }}</span><b>+{{ t.points }}</b>
              </li>
            }
          </ol>
          <p class="muted small">Gộp 2 bé <b>{{ tiers[tiers.length - 1].name }}</b> (lớn nhất) → nổ tung, thưởng <b>+500</b>! Bé nằm vượt vạch đỏ quá 2 giây là thua.</p>
        </aside>
      </div>
    </div>
    <app-game-suggest current="merge" />
  `,
  styles: `
    .wrap { padding: 24px 0 64px; }
    .crumbs { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
    .crumbs a { color: var(--muted); font-weight: 700; }
    .crumbs a:hover { color: var(--primary); }
    .head { text-align: center; margin: 8px 0 18px; }
    .head h1 { margin: 8px 0 6px; font-size: clamp(1.8rem, 4vw, 2.6rem); }
    .hl { color: var(--primary); }
    .muted { color: var(--muted); }
    .small { font-size: .85rem; }
    .layout { display: grid; grid-template-columns: auto 300px; grid-template-areas: 'stage lb' 'stage guide'; grid-template-rows: auto 1fr; gap: 16px 22px; justify-content: center; align-items: start; }
    .layout > .stage { grid-area: stage; } .layout > .lb-slot { grid-area: lb; } .layout > .guide { grid-area: guide; }
    .stage { position: relative; width: min(460px, calc(100vw - 32px), calc((100dvh - 100px) * ${W / H})); border-radius: 22px; overflow: hidden;
      touch-action: none; user-select: none; -webkit-user-select: none; cursor: pointer; box-shadow: 0 18px 44px rgba(255, 110, 160, .3), 0 0 0 3px #ff9ec4; background: #fff3f8; }
    canvas { display: block; width: 100%; height: 100%; }
    .overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; text-align: center;
      padding: 24px; color: #fff; background: radial-gradient(circle, rgba(255,110,160,.75), rgba(90,20,60,.9)); animation: fade .25s ease; }
    .overlay h2 { margin: 0; font-size: clamp(1.5rem, 4vw, 2.1rem); }
    .overlay p { margin: 0; opacity: .92; max-width: 340px; }
    .overlay .score { font-size: 2.2rem; font-weight: 900; color: #ffd23f; opacity: 1; }
    .overlay .new { color: #ffd23f; font-weight: 800; }
    .btn.big { font-size: 1.1rem; padding: 12px 26px; }
    .guide { padding: 16px 18px; }
    .guide h2 { margin: 0 0 10px; font-size: 1.05rem; }
    .chain { list-style: none; margin: 0 0 8px; padding: 0; display: grid; gap: 4px; }
    .chain li { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-radius: 10px; font-size: .85rem; font-weight: 700;
      background: color-mix(in srgb, var(--c) 10%, var(--surface)); border-left: 3px solid var(--c); }
    .chain img { object-fit: contain; border-radius: 50%; background: #fff; box-shadow: 0 0 0 2px var(--c); }
    .chain span { flex: 1; }
    .chain b { color: var(--primary-dark); font-size: .8rem; }
    @keyframes fade { from { opacity: 0; } }
    @media (max-width: 900px) {
      .layout { grid-template-columns: minmax(0, 460px); grid-template-areas: 'lb' 'stage' 'guide'; gap: 10px; }
      .wrap { padding-top: 12px; }
      .stage { width: min(460px, 100%); }
    }
  `,
})
export class MergeFumoPage implements AfterViewInit {
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
  private readonly zone = inject(NgZone);
  /** Thông số game admin chỉnh. */
  private readonly gp = inject(SettingsService).settings;
  private game?: MergeGame;

  readonly ratio = `${W} / ${H}`;
  readonly tiers = TIERS;
  readonly state = signal<MergeState>('title');
  readonly result = signal<MergeResult | null>(null);
  readonly best = signal(0);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.game?.destroy());
  }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.game = new MergeGame(this.canvas().nativeElement, (s, r) =>
        this.zone.run(() => {
          this.state.set(s);
          if (r) this.result.set(r);
          this.best.set(this.game?.bestScore ?? 0);
        }),
      );
    });
    this.best.set(this.game?.bestScore ?? 0);
  }

  start(): void {
    this.result.set(null);
    this.canvas().nativeElement.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (this.game) this.game.params = gameParams(this.gp().gameParams, 'merge');
    this.zone.runOutsideAngular(() => this.game?.start());
  }
}

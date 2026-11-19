import { AfterViewInit, Component, DestroyRef, ElementRef, NgZone, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameSuggestComponent } from './game-suggest';
import { LeaderboardComponent } from './leaderboard';
import { SoundToggleComponent } from '../../shared/sound-toggle';
import { CHAPTERS, CrushGame, CrushResult, CrushState, GEMS, H, W } from './crush-engine';

@Component({
  selector: 'app-fumo-crush',
  imports: [RouterLink, SoundToggleComponent, GameSuggestComponent, LeaderboardComponent],
  template: `
    <div class="container wrap">
      <nav class="crumbs"><a routerLink="/mini-game">← Chọn game khác</a><app-sound-toggle /></nav>
      <header class="head">
        <span class="chip">💎 Ghép fumo · Thủ đền</span>
        <h1>Fumo <span class="hl">Crush Saga</span></h1>
        <p class="muted">Đổi chỗ 2 bé cạnh nhau để ghép 3 bé cùng màu trở lên — mỗi lần ghép là một đòn đánh lũ yêu quái đang kéo tới đền Hakurei!</p>
      </header>

      <div class="layout">
        <app-leaderboard class="lb-slot" game="crush" [score]="state() === 'over' ? result()?.score : null" />
        <div class="stage" [style.aspect-ratio]="ratio">
          <canvas #cv aria-label="Màn chơi Fumo Crush Saga"></canvas>

          @if (state() === 'title') {
            <div class="overlay">
              <h2>💎 Fumo Crush Saga</h2>
              <p>Gensokyo đang có dị biến! Yêu quái kéo về đền Hakurei — ghép các bé fumo để bảo vệ đền.</p>
              <button class="btn primary big" type="button" (click)="start()">▶ Bắt đầu</button>
              @if (best()) { <small>Kỷ lục: {{ best().toLocaleString('vi-VN') }}</small> }
            </div>
          }
          @if (state() === 'over') {
            <div class="overlay over">
              <h2>⛩ Đền Hakurei đã thất thủ!</h2>
              <p class="score">{{ result()?.score?.toLocaleString('vi-VN') }} điểm</p>
              <p>Tới {{ result()!.loop > 1 ? 'vòng ' + result()!.loop + ' · ' : '' }}chương {{ result()?.chapter }}: {{ result()?.place }}</p>
              <p>Hạ {{ result()?.kills }} yêu quái · {{ result()?.bosses }} boss</p>
              @if (result()?.newBest) { <p class="new">🏆 Kỷ lục mới!</p> }
              <button class="btn primary big" type="button" (click)="start()">🔁 Chơi lại</button>
            </div>
          }
        </div>

        <aside class="guide card-surface">
          <h2>Cách chơi</h2>
          <ul class="moves">
            <li><b class="n">3</b><span>⚔️ <b>Chém</b> 1 nhát vào con quái gần đền nhất</span></li>
            <li><b class="n">4</b><span>💣 <b>Bom</b> nổ lan, trúng cả cụm quái</span></li>
            <li><b class="n">5</b><span>⚡ <b>Laser Zap</b> xuyên cả hàng quái</span></li>
            <li><b class="n">6+</b><span>✨ <b>Mộng Tưởng Phong Ấn</b> — trúng mọi quái và hồi máu đền</span></li>
          </ul>
          <p class="muted small">Ghép dây chuyền (combo) để tăng sát thương. Bé bị <b>❄ đóng băng</b> không đổi chỗ được — ghép trúng hoặc ghép sát bên cạnh để phá băng. Bàn luôn có nước đi; hết nước sẽ tự xáo bàn.</p>

          <h3>6 bé fumo</h3>
          <div class="gems">
            @for (g of gems; track g.id) {
              <span class="gem" [style.--c]="g.color"><img [src]="'fumo-ninja/' + g.id + '.webp'" [alt]="g.name" width="40" height="40" />{{ g.name }}</span>
            }
          </div>

          <h3>Cốt truyện</h3>
          <ol class="story">
            @for (c of chapters; track c.boss; let i = $index) {
              <li [style.--c]="c.aura"><b>{{ c.place }}</b> — boss {{ c.boss }}</li>
            }
          </ol>
          <p class="muted small">Hạ hết 5 boss sẽ sang vòng mới: quái đông hơn, khoẻ hơn, điểm cũng cao hơn. Chơi vô tận!</p>
        </aside>
      </div>
    </div>
    <app-game-suggest current="crush" />
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
    .layout { display: grid; grid-template-columns: auto minmax(260px, 380px); grid-template-areas: 'stage lb' 'stage guide'; grid-template-rows: auto 1fr; gap: 16px 22px; justify-content: center; align-items: start; }
    .layout > .stage { grid-area: stage; } .layout > .lb-slot { grid-area: lb; } .layout > .guide { grid-area: guide; max-width: none; }
    @media (max-width: 900px) { .layout { grid-template-columns: minmax(0, 500px); grid-template-areas: 'lb' 'stage' 'guide'; } }
    .stage { position: relative; width: min(500px, 100%, calc((100dvh - 90px) * ${W / H})); flex-shrink: 0; border-radius: 18px; overflow: hidden;
      touch-action: none; user-select: none; -webkit-user-select: none; box-shadow: 0 20px 50px rgba(0,0,0,.35), 0 0 0 3px #4b2c7a; background: #140d26; }
    canvas { display: block; width: 100%; height: 100%; }
    .overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; text-align: center;
      padding: 24px; color: #fff; background: radial-gradient(circle, rgba(60,25,100,.7), rgba(10,5,25,.92)); animation: fade .25s ease; }
    .overlay.over { background: radial-gradient(circle, rgba(140,20,50,.6), rgba(20,0,10,.93)); }
    .overlay h2 { margin: 0; font-size: clamp(1.4rem, 4vw, 2.1rem); }
    .overlay p { margin: 0; opacity: .9; max-width: 380px; }
    .overlay .score { font-size: 2.2rem; font-weight: 900; color: #ffd23f; opacity: 1; }
    .overlay .new { color: #ffd23f; font-weight: 800; }
    .btn.big { font-size: 1.1rem; padding: 12px 26px; }
    .guide { flex: 1 1 280px; max-width: 380px; padding: 18px 20px; }
    .guide h2 { margin: 0 0 10px; font-size: 1.15rem; }
    .guide h3 { margin: 16px 0 8px; font-size: 1rem; }
    .moves { list-style: none; margin: 0 0 8px; padding: 0; display: grid; gap: 6px; }
    .moves li { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-radius: 12px; background: var(--surface-2); font-size: .9rem; }
    .moves .n { min-width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px; background: var(--primary); color: var(--on-primary); font-weight: 900; }
    .gems { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .gem { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px; border-radius: 12px; font-size: .78rem; font-weight: 800;
      border: 2px solid var(--c); background: color-mix(in srgb, var(--c) 14%, var(--surface)); box-shadow: 0 0 12px color-mix(in srgb, var(--c) 45%, transparent); }
    .gem img { width: 40px; height: 40px; object-fit: contain; filter: drop-shadow(0 0 6px var(--c)); }
    .story { margin: 0; padding-left: 20px; display: grid; gap: 4px; font-size: .88rem; }
    .story li::marker { color: var(--c); font-weight: 900; }
    .story b { color: var(--c); }
    @keyframes fade { from { opacity: 0; } }
    @media (max-width: 600px) { .wrap { padding-top: 12px; } .head p { font-size: .9rem; } .stage { width: 100%; } }
  `,
})
export class FumoCrushPage implements AfterViewInit {
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
  private readonly zone = inject(NgZone);
  private game?: CrushGame;

  readonly ratio = `${W} / ${H}`;
  readonly gems = GEMS;
  readonly chapters = CHAPTERS;
  readonly state = signal<CrushState>('title');
  readonly result = signal<CrushResult | null>(null);
  readonly best = signal(0);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.game?.destroy());
  }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.game = new CrushGame(this.canvas().nativeElement, (s, r) =>
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
    // Đưa cả khung chơi vào giữa màn hình.
    this.canvas().nativeElement.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    this.zone.runOutsideAngular(() => this.game?.start());
  }
}

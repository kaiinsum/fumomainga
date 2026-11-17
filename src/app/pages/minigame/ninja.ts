import { AfterViewInit, Component, DestroyRef, ElementRef, NgZone, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SoundToggleComponent } from '../../shared/sound-toggle';
import { BOMB, H, KINDS, NinjaGame, NinjaResult, NinjaState, W } from './ninja-engine';

@Component({
  selector: 'app-fumo-ninja',
  imports: [RouterLink, SoundToggleComponent],
  template: `
    <div class="container wrap">
      <nav class="crumbs"><a routerLink="/mini-game">← Chọn game khác</a><app-sound-toggle /></nav>
      <header class="head">
        <span class="chip">🗡️ Chém fumo</span>
        <h1>Fumo <span class="hl">Ninja</span></h1>
        <p class="muted">Vuốt chuột / ngón tay để chém các bé fumo bay lên. Tránh <b class="bomb">Reimu viền neon đỏ</b> — chém trúng là thua ngay!</p>
      </header>

      <div class="stage" [style.aspect-ratio]="ratio">
        <canvas #cv aria-label="Màn chơi Fumo Ninja"></canvas>

        @if (state() === 'title') {
          <div class="overlay">
            <h2>🗡️ Fumo Ninja</h2>
            <p>Chém càng nhiều càng tốt · để rơi 3 bé là thua · càng chơi càng nhanh</p>
            <button class="btn primary big" type="button" (click)="start()">▶ Bắt đầu chém</button>
            @if (best()) { <small>Kỷ lục: {{ best() }}</small> }
          </div>
        }
        @if (state() === 'over') {
          <div class="overlay" [class.boom]="result()?.reason === 'bomb'">
            <h2>{{ result()?.reason === 'bomb' ? '💥 Chém trúng Reimu!' : '😵 Để rơi 3 bé rồi!' }}</h2>
            <p class="score">{{ result()?.score }} điểm</p>
            <p>Đã chém {{ result()?.sliced }} bé</p>
            @if (result()?.newBest) { <p class="new">🏆 Kỷ lục mới!</p> }
            <button class="btn primary big" type="button" (click)="start()">🔁 Chơi lại</button>
          </div>
        }
      </div>

      <section class="table card-surface">
        <h2>Bảng điểm</h2>
        <ul>
          @for (k of kinds; track k.id) {
            <li><img [src]="'fumo-ninja/' + k.id + '.webp'" [alt]="k.name" width="44" height="44" /><span>{{ k.name }}</span><b>+{{ k.points }}</b></li>
          }
          <li class="bad"><img [src]="'fumo-ninja/' + bomb.id + '.webp'" [alt]="bomb.name" width="44" height="44" /><span>{{ bomb.name }} (bom)</span><b>Thua!</b></li>
        </ul>
        <p class="muted small">Bé <b>nhỏ</b> được x2 điểm · chém từ 3 bé trở lên trong một nhát được thưởng <b>COMBO</b>.</p>
      </section>
    </div>
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
    .bomb { color: #ff1744; text-shadow: 0 0 10px rgba(255, 23, 68, .6); }
    .stage { position: relative; width: min(900px, 100%); margin: 0 auto; border-radius: 18px; overflow: hidden; touch-action: none; user-select: none;
      box-shadow: 0 20px 50px rgba(0,0,0,.35), 0 0 0 3px #6b4226; cursor: crosshair; }
    canvas { display: block; width: 100%; height: 100%; }
    .overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; text-align: center;
      padding: 20px; color: #fff; background: radial-gradient(circle, rgba(60,30,15,.55), rgba(15,8,4,.85)); animation: fade .25s ease; }
    .overlay.boom { background: radial-gradient(circle, rgba(255,23,68,.45), rgba(30,0,8,.9)); }
    .overlay h2 { margin: 0; font-size: clamp(1.6rem, 4vw, 2.4rem); }
    .overlay p { margin: 0; opacity: .9; }
    .overlay .score { font-size: 2.2rem; font-weight: 900; color: #ffd23f; opacity: 1; }
    .overlay .new { color: #ffd23f; font-weight: 800; }
    .btn.big { font-size: 1.1rem; padding: 12px 26px; }
    .table { max-width: 900px; margin: 22px auto 0; padding: 18px 20px; }
    .table h2 { margin: 0 0 10px; font-size: 1.15rem; }
    .table ul { list-style: none; margin: 0 0 8px; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
    .table li { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 12px; background: var(--surface-2); }
    .table li img { width: 44px; height: 44px; object-fit: contain; }
    .table li span { flex: 1; font-weight: 700; font-size: .9rem; }
    .table li b { color: var(--primary-dark); }
    .table li.bad { background: color-mix(in srgb, #ff1744 14%, var(--surface)); box-shadow: inset 0 0 0 2px #ff1744; }
    .table li.bad b { color: #ff1744; }
    @keyframes fade { from { opacity: 0; } }
  `,
})
export class FumoNinjaPage implements AfterViewInit {
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
  private readonly zone = inject(NgZone);
  private game?: NinjaGame;

  readonly ratio = `${W} / ${H}`;
  readonly kinds = [...KINDS].sort((a, b) => a.points - b.points);
  readonly bomb = BOMB;
  readonly state = signal<NinjaState>('title');
  readonly result = signal<NinjaResult | null>(null);
  readonly best = signal(0);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.game?.destroy());
  }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.game = new NinjaGame(this.canvas().nativeElement, (s, r) =>
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
    this.zone.runOutsideAngular(() => this.game?.start());
  }
}

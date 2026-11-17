import { AfterViewInit, Component, DestroyRef, ElementRef, NgZone, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DanmakuGame, Difficulty, GameResult, GameState, H, W } from './engine';

@Component({
  selector: 'app-minigame',
  imports: [RouterLink],
  template: `
    <div class="container wrap">
      <header class="head">
        <span class="chip">🎮 Mini game</span>
        <h1>Đại chiến <span class="hl">Mọt Vải</span></h1>
        <p class="muted">Bầy mọt vải kéo tới gặm thú bông! Điều khiển bé thú bông né đạn, bắn hạ từng đợt quân địch và đánh bại Nữ hoàng Mọt.</p>
      </header>

      <div class="layout">
        <div class="stage" [style.aspect-ratio]="ratio">
          <canvas #cv [attr.width]="w" [attr.height]="h" aria-label="Màn chơi"></canvas>

          @switch (state()) {
            @case ('title') {
              <div class="overlay">
                <h2>Sẵn sàng chưa?</h2>
                <p>Bé tự động bắn — bạn chỉ cần di chuyển và né đạn.</p>
                <div class="btns">
                  <button class="btn primary" type="button" (click)="start('normal')">▶ Chơi (Thường)</button>
                  <button class="btn ghost light" type="button" (click)="start('easy')">Chế độ Dễ</button>
                </div>
                @if (hi()) { <small>Kỷ lục: {{ hi().toLocaleString('vi-VN') }}</small> }
              </div>
            }
            @case ('paused') {
              <div class="overlay">
                <h2>⏸ Tạm dừng</h2>
                <div class="btns">
                  <button class="btn primary" type="button" (click)="resume()">Tiếp tục</button>
                  <button class="btn ghost light" type="button" (click)="toTitle()">Về màn hình chính</button>
                </div>
              </div>
            }
            @case ('over') {
              <div class="overlay">
                <h2>💥 Thua rồi!</h2>
                <p class="score">{{ result()?.score?.toLocaleString('vi-VN') }} điểm</p>
                @if (result()?.newHi) { <p class="new-hi">🏆 Kỷ lục mới!</p> }
                <div class="btns">
                  <button class="btn primary" type="button" (click)="start(lastDiff)">Chơi lại</button>
                  <button class="btn ghost light" type="button" (click)="toTitle()">Đổi chế độ</button>
                </div>
              </div>
            }
            @case ('win') {
              <div class="overlay win">
                <h2>🎉 Chiến thắng!</h2>
                <p>Tiệm thú bông đã an toàn nhờ bạn.</p>
                <p class="score">{{ result()?.score?.toLocaleString('vi-VN') }} điểm</p>
                @if (result()?.newHi) { <p class="new-hi">🏆 Kỷ lục mới!</p> }
                <div class="btns">
                  <button class="btn primary" type="button" (click)="start(lastDiff)">Chơi lại</button>
                  <a class="btn ghost light" routerLink="/san-pham">Xem các bé thú bông</a>
                </div>
              </div>
            }
          }

          @if (state() === 'playing') {
            <div class="touch-ctrl">
              <button type="button" class="round" (click)="pause()" aria-label="Tạm dừng">⏸</button>
              <button type="button" class="round bomb" (click)="bomb()" aria-label="Thả bom">★</button>
            </div>
          }
        </div>

        <aside class="help card-surface">
          <h2>Cách chơi</h2>
          <ul>
            <li><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> hoặc <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>: di chuyển</li>
            <li><kbd>Shift</kbd>: đi chậm để luồn lách, hiện điểm trúng đạn</li>
            <li><kbd>X</kbd>: bom ★ — xoá sạch đạn trên màn hình</li>
            <li><kbd>P</kbd> / <kbd>Esc</kbd>: tạm dừng</li>
            <li>📱 Điện thoại: kéo ngón tay ở bất kỳ đâu để di chuyển, nút ★ để thả bom</li>
          </ul>
          <h3>Mẹo</h3>
          <ul>
            <li>Chỉ <b>chấm nhỏ giữa người</b> bé mới bị trúng đạn — hãy mạnh dạn len qua khe hở.</li>
            <li>Sượt sát đạn (graze) được cộng điểm.</li>
            <li>Nhặt <span class="tag p">P</span> để bắn nhiều tia hơn, <span class="tag b">B</span> thêm bom, <span class="tag l">♥</span> thêm mạng.</li>
            <li>Bay lên sát mép trên để hút hết vật phẩm.</li>
            <li>Boss có 3 chiêu, mỗi chiêu mạnh hơn chiêu trước.</li>
          </ul>
        </aside>
      </div>
    </div>
  `,
  styles: `
    .wrap { padding: 24px 0 56px; }
    .head { text-align: center; margin-bottom: 20px; }
    .head h1 { margin: 8px 0 6px; font-size: clamp(1.8rem, 4vw, 2.6rem); }
    .hl { color: var(--primary); }
    .muted { color: var(--muted); max-width: 620px; margin: 0 auto; }
    .layout { display: grid; grid-template-columns: auto 300px; gap: 24px; justify-content: center; align-items: start; }
    .stage { position: relative; width: min(480px, calc(100vw - 32px), calc((100dvh - var(--header-h) - 40px) * 0.75)); border-radius: 16px; overflow: hidden;
      box-shadow: 0 20px 50px rgba(0,0,0,.35), 0 0 0 2px var(--primary-300); background: #120c22; touch-action: none; user-select: none; }
    canvas { display: block; width: 100%; height: 100%; }
    .overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center;
      padding: 24px; color: #fff; background: radial-gradient(circle at 50% 40%, rgba(176,107,255,.35), rgba(10,6,22,.85)); animation: fade .25s ease; }
    .overlay h2 { margin: 0; font-size: 2rem; }
    .overlay p { margin: 0; opacity: .9; }
    .overlay small { opacity: .75; }
    .overlay .score { font-size: 1.6rem; font-weight: 800; color: #ffd23f; }
    .overlay .new-hi { color: #ff9ed1; font-weight: 800; }
    .btns { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
    .btn.light { color: #fff; border-color: rgba(255,255,255,.7); }
    .touch-ctrl { position: absolute; right: 10px; bottom: 10px; display: none; flex-direction: column; gap: 10px; }
    .round { width: 52px; height: 52px; border-radius: 50%; border: 2px solid rgba(255,255,255,.6); background: rgba(255,255,255,.12); color: #fff; font-size: 1.2rem; backdrop-filter: blur(4px); }
    .round.bomb { background: rgba(61,220,151,.35); font-size: 1.5rem; }
    @media (pointer: coarse) { .touch-ctrl { display: flex; } }
    .help { padding: 20px; font-size: .92rem; }
    .help h2 { margin: 0 0 10px; font-size: 1.2rem; }
    .help h3 { margin: 16px 0 8px; font-size: 1rem; }
    .help ul { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
    kbd { display: inline-block; min-width: 22px; padding: 1px 6px; margin-right: 2px; border-radius: 6px; border: 1.5px solid var(--border); border-bottom-width: 3px;
      font: 700 .75rem var(--font-mono, ui-monospace, monospace); text-align: center; background: var(--surface); }
    .tag { display: inline-grid; place-items: center; width: 18px; height: 18px; font-size: .7rem; font-weight: 800; color: #fff; border-radius: 3px; }
    .tag.p { background: #ff4d6d; } .tag.b { background: #3ddc97; } .tag.l { background: #ff7ac6; }
    @keyframes fade { from { opacity: 0; } }
    @media (max-width: 900px) { .layout { grid-template-columns: 1fr; justify-items: center; } .help { width: min(480px, 100%); } }
  `,
})
export class MiniGamePage implements AfterViewInit {
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
  private readonly zone = inject(NgZone);
  private game?: DanmakuGame;

  readonly w = W;
  readonly h = H;
  readonly ratio = `${W} / ${H}`;
  readonly state = signal<GameState>('title');
  readonly result = signal<GameResult | null>(null);
  readonly hi = signal(0);
  lastDiff: Difficulty = 'normal';

  constructor() {
    inject(DestroyRef).onDestroy(() => this.game?.destroy());
  }

  ngAfterViewInit(): void {
    // Vòng lặp game chạy ngoài Angular; chỉ báo lại khi đổi trạng thái (bắt đầu, dừng, thua, thắng).
    this.zone.runOutsideAngular(() => {
      this.game = new DanmakuGame(this.canvas().nativeElement, (s, r) =>
        this.zone.run(() => {
          this.state.set(s);
          if (r) this.result.set(r);
          this.hi.set(this.game?.highScore ?? 0);
        }),
      );
    });
    this.hi.set(this.game?.highScore ?? 0);
  }

  start(diff: Difficulty): void {
    this.lastDiff = diff;
    this.result.set(null);
    this.zone.runOutsideAngular(() => this.game?.start(diff));
    this.canvas().nativeElement.focus();
  }

  pause(): void {
    this.game?.pause();
  }

  resume(): void {
    this.zone.runOutsideAngular(() => this.game?.resume());
  }

  bomb(): void {
    this.game?.bomb();
  }

  toTitle(): void {
    this.state.set('title');
    if (this.game) this.game.state = 'title';
  }
}

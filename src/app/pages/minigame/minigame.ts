import { AfterViewInit, Component, DestroyRef, ElementRef, NgZone, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameSuggestComponent } from './game-suggest';
import { SoundToggleComponent } from '../../shared/sound-toggle';
import { DanmakuGame, Difficulty, GameResult, GameState, H, W } from './engine';

@Component({
  selector: 'app-minigame',
  imports: [RouterLink, SoundToggleComponent, GameSuggestComponent],
  template: `
    <div class="container wrap">
      <nav class="crumbs"><a routerLink="/mini-game">← Chọn game khác</a><app-sound-toggle /></nav>
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
                <div class="levels" role="group" aria-label="Chọn độ khó">
                  @for (lv of levels; track lv.id) {
                    <button type="button" class="level" [class]="'level ' + lv.id" (click)="start(lv.id)">
                      <svg class="fumo" viewBox="0 0 64 64" aria-hidden="true">
                        <ellipse cx="32" cy="56" rx="17" ry="5" fill="rgba(0,0,0,.25)" />
                        <path d="M17 40 Q16 56 32 56 Q48 56 47 40 Z" [attr.fill]="lv.dark" />
                        <path d="M23 44 L32 50 L41 44" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" />
                        <circle cx="32" cy="29" r="17" fill="#ffe7d1" />
                        <path d="M14 30 Q12 9 32 9 Q52 9 50 30 Q47 21 40 19 Q36 25 26 22 Q20 24 14 30 Z" [attr.fill]="lv.color" />
                        <path d="M14 30 Q11 42 16 47 L19 33 Z M50 30 Q53 42 48 47 L45 33 Z" [attr.fill]="lv.color" />
                        <path d="M32 9 L21 3 L23 13 Z M32 9 L43 3 L41 13 Z" [attr.fill]="lv.dark" />
                        <circle cx="32" cy="9" r="3" [attr.fill]="lv.dark" />
                        <ellipse cx="25.5" cy="31" rx="3" ry="4" fill="#2b2140" />
                        <ellipse cx="38.5" cy="31" rx="3" ry="4" fill="#2b2140" />
                        <circle cx="26.5" cy="29.5" r="1.1" fill="#fff" /><circle cx="39.5" cy="29.5" r="1.1" fill="#fff" />
                        <ellipse cx="21" cy="37" rx="3" ry="1.6" fill="#ff9eb5" opacity=".7" />
                        <ellipse cx="43" cy="37" rx="3" ry="1.6" fill="#ff9eb5" opacity=".7" />
                        <path d="M29.5 38 Q32 40 34.5 38" fill="none" stroke="#2b2140" stroke-width="1.4" stroke-linecap="round" />
                      </svg>
                      <span class="lv-text">
                        <b>{{ lv.label }}</b>
                        <small>{{ lv.desc }}</small>
                      </span>
                    </button>
                  }
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
    <app-game-suggest current="shmup" />
  `,
  styles: `
    .wrap { padding: 24px 0 56px; }
    .crumbs { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
    .crumbs a { color: var(--muted); font-weight: 700; }
    .crumbs a:hover { color: var(--primary); }
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
    .btn.light { color: #fff !important; background: rgba(255,255,255,.12) !important; border: 2px solid rgba(255,255,255,.75) !important; }
    .btn.light:hover { background: rgba(255,255,255,.24) !important; }
    /* --- Chọn độ khó --- */
    .levels { display: flex; flex-direction: column; gap: 10px; width: min(340px, 100%); }
    .level { --c: #36c26b; display: flex; align-items: center; gap: 12px; width: 100%; padding: 8px 16px 8px 10px; cursor: pointer;
      border-radius: 16px; border: 2px solid var(--c); color: #fff; text-align: left; font: inherit;
      background: linear-gradient(100deg, color-mix(in srgb, var(--c) 55%, #000) 0%, color-mix(in srgb, var(--c) 22%, rgba(0,0,0,.35)) 100%);
      box-shadow: 0 0 0 0 var(--c), 0 6px 16px rgba(0,0,0,.3); transition: transform .18s ease, box-shadow .25s ease; }
    .level:hover, .level:focus-visible { transform: translateX(6px) scale(1.02); outline: none;
      box-shadow: 0 0 18px -2px var(--c), 0 8px 22px rgba(0,0,0,.35); }
    .level:hover .fumo { animation: hop .5s ease; }
    .level.normal { --c: #f5c518; }
    .level.hard { --c: #ff3b4e; }
    .fumo { width: 54px; height: 54px; flex: none; filter: drop-shadow(0 3px 4px rgba(0,0,0,.35)); }
    .lv-text { display: flex; flex-direction: column; line-height: 1.25; }
    .lv-text b { font-size: 1.15rem; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.5); }
    .lv-text b::before { content: ''; display: inline-block; width: 10px; height: 10px; margin-right: 8px; border-radius: 50%;
      background: var(--c); box-shadow: 0 0 8px var(--c); vertical-align: 1px; }
    .lv-text small { color: rgba(255,255,255,.88); font-size: .82rem; opacity: 1; }
    @keyframes hop { 40% { transform: translateY(-7px) rotate(-6deg); } 70% { transform: translateY(0) rotate(4deg); } }
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

  /** 3 mức độ, mỗi mức một màu + bé fumo cùng màu: xanh lá / vàng / đỏ. */
  readonly levels: { id: Difficulty; label: string; desc: string; color: string; dark: string }[] = [
    { id: 'easy', label: 'Dễ', desc: '5 mạng · đạn chậm, thưa', color: '#3fcf74', dark: '#1f8a49' },
    { id: 'normal', label: 'Trung bình', desc: '3 mạng · tốc độ chuẩn', color: '#ffd23f', dark: '#c99a00' },
    { id: 'hard', label: 'Khó', desc: '2 mạng · đạn nhanh, dày, boss trâu', color: '#ff4d5e', dark: '#b3172a' },
  ];

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

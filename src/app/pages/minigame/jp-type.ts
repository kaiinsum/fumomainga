import { AfterViewInit, Component, DestroyRef, ElementRef, NgZone, WritableSignal, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { gameParams } from '../../models/game-params';
import { SettingsService } from '../../services/settings.service';
import { GameSuggestComponent } from './game-suggest';
import { LeaderboardComponent } from './leaderboard';
import { SoundToggleComponent } from '../../shared/sound-toggle';
import { H, JpResult, JpState, JpTypingGame, W } from './jp-engine';
import { JpLevel } from './jp-words';

interface LevelCard {
  id: JpLevel;
  label: string;
  desc: string;
  img: string;
}

@Component({
  selector: 'app-jp-type',
  imports: [RouterLink, SoundToggleComponent, GameSuggestComponent, LeaderboardComponent],
  template: `
    <div class="container wrap">
      <nav class="crumbs"><a routerLink="/mini-game">← Chọn game khác</a><app-sound-toggle /></nav>
      <header class="head">
        <span class="chip">⌨️ Gõ chữ · Học tiếng Nhật</span>
        <h1>Gõ chữ <span class="hl">diệt Fumo</span></h1>
        <p class="muted">Các bé fumo mang chữ tiếng Nhật đang rơi xuống! Gõ đúng cách đọc để tiêu diệt. Để chạm đất 3 lần là thua.</p>
      </header>

      <div class="layout">
        <app-leaderboard class="lb-slot" game="jp-type" [score]="state() === 'over' ? result()?.score : null" />
        <div class="play">
          <div class="stage" [style.aspect-ratio]="ratio" (click)="focusInput()">
            <canvas #cv aria-label="Màn chơi Gõ chữ diệt Fumo"></canvas>

            @if (state() === 'title') {
              <div class="overlay">
                <h2>Chọn độ khó</h2>
                <div class="levels" role="group" aria-label="Chọn độ khó">
                  @for (lv of levels; track lv.id) {
                    <button type="button" [class]="'level ' + lv.id" (click)="start(lv.id); $event.stopPropagation()">
                      <img [src]="'jp-type/' + lv.img + '.webp'" alt="" />
                      <span class="lv-text">
                        <b>{{ lv.label }}</b>
                        <small>{{ lv.desc }}</small>
                        @if (best[lv.id]()) { <em>Kỷ lục: {{ best[lv.id]().toLocaleString('vi-VN') }}</em> }
                      </span>
                    </button>
                  }
                </div>
              </div>
            }
            @if (state() === 'paused') {
              <div class="overlay">
                <h2>⏸ Tạm dừng</h2>
                <div class="btns">
                  <button class="btn primary" type="button" (click)="resume(); $event.stopPropagation()">Tiếp tục</button>
                  <button class="btn light" type="button" (click)="toTitle(); $event.stopPropagation()">Đổi độ khó</button>
                </div>
              </div>
            }
            @if (state() === 'over') {
              @let r = result();
              <div class="overlay over">
                <h2>💥 Fumo đã tràn xuống!</h2>
                <p class="score">{{ r?.score?.toLocaleString('vi-VN') }} điểm</p>
                @if (r?.newBest) { <p class="new">🏆 Kỷ lục mới!</p> }
                <p class="stats">
                  Diệt {{ r?.killed }} bé · hạ {{ r?.bosses }} boss · combo {{ r?.bestCombo }} · chính xác {{ r?.accuracy }}% · {{ r?.time }}s
                </p>
                @if (r?.missed?.length) {
                  <div class="review">
                    <b>Ôn lại các chữ bị lọt:</b>
                    <ul>
                      @for (m of r!.missed; track m.jp) {
                        <li><span class="jp">{{ m.jp }}</span>@if (m.kana) { <small>{{ m.kana }}</small> }<i>{{ m.vi }}</i></li>
                      }
                    </ul>
                  </div>
                }
                <div class="btns">
                  <button class="btn primary" type="button" (click)="start(lastLevel); $event.stopPropagation()">🔁 Chơi lại</button>
                  <button class="btn light" type="button" (click)="toTitle(); $event.stopPropagation()">Đổi độ khó</button>
                </div>
              </div>
            }
          </div>

          <div class="typebar" [class.typo]="typo()" [class.hit]="hit()" [class.active]="state() === 'playing'">
            <span class="prompt" aria-hidden="true">⌨️</span>
            <input
              #inp
              type="text"
              autocomplete="off"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              enterkeyhint="done"
              [disabled]="state() !== 'playing'"
              [placeholder]="state() === 'playing' ? (narrow ? 'Gõ cách đọc…' : 'Gõ cách đọc (vd: neko) hoặc chữ Nhật rồi để tự diệt…') : 'Chọn độ khó để bắt đầu'"
              (input)="onInput()"
              (keydown)="onKey($event)"
              aria-label="Ô gõ chữ"
            />
            @if (state() === 'playing') {
              <button type="button" class="pause" (click)="pause()" aria-label="Tạm dừng">⏸</button>
            }
          </div>
        </div>

        <aside class="guide card-surface">
          <h2>Cách chơi</h2>
          <ul>
            <li>Đọc chữ trên đầu bé fumo rồi gõ <b>cách đọc bằng chữ Latin</b> (vd: ねこ → <code>neko</code>) — đúng là bé nổ tung, không cần bấm Enter.</li>
            <li>Chấp nhận cả kiểu gõ <code>shi/si</code>, <code>tsu/tu</code>, <code>chi/ti</code>, <code>ou/o</code>… hoặc gõ thẳng kana / kanji bằng bộ gõ tiếng Nhật.</li>
            <li><kbd>Esc</kbd> xoá ô gõ · bấm ⏸ để tạm dừng.</li>
            <li>Càng chơi fumo rơi càng nhanh, càng nhiều.</li>
          </ul>
          <h3>Gợi ý theo độ khó</h3>
          <ul>
            <li><b class="c-easy">Dễ</b>: hiragana & từ đơn giản.</li>
            <li><b class="c-normal">Trung bình</b>: katakana & kanji N5 — có cách đọc kana dưới chữ.</li>
            <li><b class="c-hard">Khó</b>: kanji khó — cách đọc kana chỉ lộ ra khi bé rơi quá nửa.</li>
          </ul>
          <h3>Fumo đặc biệt</h3>
          <ul class="specials">
            <li><img src="jp-type/yuyuko.webp" alt="Yuyuko" /><span><b>♥ Hồi tim</b> — +1 mạng (tối đa 5)</span></li>
            <li><img src="jp-type/flandre.webp" alt="Flandre" /><span><b>💣 Bom</b> — nổ tung mọi fumo & chiêu boss</span></li>
            <li><img src="jp-type/cirno-2.webp" alt="Cirno" /><span><b>❄ Đóng băng</b> — mọi thứ chậm lại 5 giây</span></li>
          </ul>
          <h3>Boss</h3>
          <p>Sau một lúc, boss xuất hiện và tung chiêu mang chữ. <b>Gõ đúng chữ của chiêu để ném ngược về boss</b>. Để chiêu chạm đất sẽ mất tim. Hạ boss được thưởng lớn + 1 tim.</p>
          <div class="bosses">
            <img src="jp-type/boss-cirno.webp" alt="Cirno" title="Cirno — Icicle Fall" />
            <img src="jp-type/boss-reimu.webp" alt="Reimu" title="Reimu — Âm Dương Ngọc" />
            <img src="jp-type/boss-dark-reimu.webp" alt="Reimu Hắc Hoá" title="Reimu Hắc Hoá — Bùa Trấn Yêu" />
          </div>
        </aside>
      </div>
    </div>
    <app-game-suggest current="jp-type" />
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
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; grid-template-areas: 'play lb' 'play guide'; grid-template-rows: auto 1fr; gap: 16px 20px; align-items: start; max-width: 1240px; margin: 0 auto; }
    .layout > .play { grid-area: play; } .layout > .lb-slot { grid-area: lb; } .layout > .guide { grid-area: guide; }
    .stage { position: relative; width: 100%; border-radius: 18px 18px 0 0; overflow: hidden; user-select: none;
      box-shadow: 0 20px 50px rgba(0,0,0,.35); background: #120c2e; }
    canvas { display: block; width: 100%; height: 100%; }
    .overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
      padding: 20px; text-align: center; color: #fff; background: radial-gradient(circle, rgba(30,15,60,.86), rgba(8,4,20,.95)); backdrop-filter: blur(6px); animation: fade .25s ease; overflow-y: auto; }
    .overlay h2 { margin: 0; font-size: clamp(1.5rem, 3.5vw, 2.2rem); color: #fff; }
    .overlay p { margin: 0; color: rgba(255,255,255,.92); }
    .overlay .score { font-size: 2.2rem; font-weight: 900; color: #ffd23f; }
    .overlay .new { color: #ffd23f; font-weight: 800; }
    .overlay .stats { font-size: .92rem; }
    .btns { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
    .btn.light { color: #fff !important; background: rgba(255,255,255,.12) !important; border: 2px solid rgba(255,255,255,.75) !important; }
    .btn.light:hover { background: rgba(255,255,255,.24) !important; }

    /* Chọn độ khó: 3 màu */
    .levels { display: flex; flex-direction: column; gap: 10px; width: min(380px, 100%); }
    .level { --c: #3fcf74; display: flex; align-items: center; gap: 14px; width: 100%; padding: 8px 18px 8px 10px; cursor: pointer;
      border-radius: 16px; border: 2px solid var(--c); color: #fff; text-align: left; font: inherit;
      background: linear-gradient(100deg, color-mix(in srgb, var(--c) 55%, #000), color-mix(in srgb, var(--c) 20%, rgba(0,0,0,.35)));
      box-shadow: 0 6px 16px rgba(0,0,0,.3); transition: transform .18s ease, box-shadow .25s ease; }
    .level:hover, .level:focus-visible { transform: translateX(6px) scale(1.02); outline: none; box-shadow: 0 0 20px -2px var(--c), 0 8px 22px rgba(0,0,0,.35); }
    .level:hover img { animation: hop .5s ease; }
    .level.normal { --c: #ffd23f; }
    .level.hard { --c: #ff4d5e; }
    .level img { width: 62px; height: 62px; object-fit: contain; flex: none; filter: drop-shadow(0 0 8px var(--c)) drop-shadow(0 3px 4px rgba(0,0,0,.4)); }
    .lv-text { display: flex; flex-direction: column; line-height: 1.3; }
    .lv-text b { font-size: 1.2rem; color: #fff; }
    .lv-text b::before { content: ''; display: inline-block; width: 10px; height: 10px; margin-right: 8px; border-radius: 50%; background: var(--c); box-shadow: 0 0 8px var(--c); vertical-align: 1px; }
    .lv-text small { color: rgba(255,255,255,.88); font-size: .82rem; }
    .lv-text em { color: var(--c); font-size: .78rem; font-style: normal; font-weight: 800; }
    @keyframes hop { 40% { transform: translateY(-7px) rotate(-6deg); } 70% { transform: translateY(0) rotate(4deg); } }
    @keyframes fade { from { opacity: 0; } }

    /* Ôn từ bị lọt */
    .review { width: min(520px, 100%); background: rgba(255,255,255,.08); border-radius: 12px; padding: 10px 14px; text-align: left; }
    .review ul { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 4px; max-height: 150px; overflow-y: auto; }
    .review li { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; font-size: .9rem; }
    .review .jp { font-size: 1.15rem; font-weight: 800; color: #fff; }
    .review small { color: rgba(255,255,255,.75); }
    .review code { color: #ffd23f; font-weight: 700; }
    .review i { color: rgba(255,255,255,.8); }

    /* Ô gõ */
    .typebar { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 0 0 18px 18px;
      background: #1c1238; border: 3px solid #3a2a66; border-top: 0; transition: border-color .2s, box-shadow .2s; }
    .typebar.active { border-color: #6b4fd6; box-shadow: 0 0 0 3px rgba(107,79,214,.25); }
    .typebar.typo { border-color: #ff4d5e; animation: shake .25s; }
    .typebar.hit { border-color: #3fcf74; box-shadow: 0 0 18px rgba(63,207,116,.55); }
    .typebar input { flex: 1; min-width: 0; font-size: max(16px, 1rem); border: 0; outline: none; background: transparent; color: #fff;
      font: 700 1.3rem/1.2 ui-monospace, Consolas, "Yu Gothic", monospace; letter-spacing: .04em; padding: 6px 0; }
    .typebar input::placeholder { color: rgba(255,255,255,.45); font-weight: 500; font-size: .95rem; letter-spacing: 0; }
    .prompt { font-size: 1.3rem; }
    .pause { border: 0; background: rgba(255,255,255,.12); color: #fff; width: 38px; height: 38px; border-radius: 10px; cursor: pointer; font-size: 1rem; }
    .pause:hover { background: rgba(255,255,255,.22); }
    @keyframes shake { 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }

    /* Hướng dẫn */
    .guide { padding: 18px 20px; font-size: .92rem; }
    .guide h2 { margin: 0 0 8px; font-size: 1.15rem; }
    .guide h3 { margin: 14px 0 6px; font-size: 1rem; }
    .guide ul { margin: 0; padding-left: 18px; display: grid; gap: 5px; }
    .guide p { margin: 0; }
    .guide code, .guide kbd { font-size: .82rem; padding: 1px 5px; border-radius: 5px; background: var(--surface-2); border: 1px solid var(--border); }
    .c-easy { color: #2fae5f; } .c-normal { color: #d4a400; } .c-hard { color: #e53950; }
    .specials { list-style: none; padding: 0 !important; }
    .specials li { display: flex; align-items: center; gap: 10px; }
    .specials img { width: 40px; height: 40px; object-fit: contain; }
    .bosses { display: flex; justify-content: space-around; gap: 6px; margin-top: 10px; }
    .bosses img { height: 90px; width: auto; filter: drop-shadow(0 4px 6px rgba(0,0,0,.3)); }
    @media (max-width: 980px) { .layout { grid-template-columns: 1fr; grid-template-areas: 'lb' 'play' 'guide'; } }
    /* Điện thoại: thẻ độ khó + nút nhỏ gọn để vừa khung chơi */
    @media (max-width: 600px) {
      .wrap { padding-top: 14px; }
      .head { margin: 4px 0 12px; }
      .head .muted { font-size: .88rem; }
      .stage { border-radius: 14px 14px 0 0; }
      .overlay { gap: 7px; padding: 10px 12px; }
      .overlay h2 { font-size: 1.15rem; }
      .overlay .score { font-size: 1.5rem; }
      .overlay .stats { font-size: .78rem; }
      .levels { gap: 6px; width: min(300px, 100%); }
      .level { gap: 9px; padding: 4px 12px 4px 6px; border-radius: 12px; border-width: 1.5px; }
      .level:hover, .level:focus-visible { transform: scale(1.02); }
      .level img { width: 36px; height: 36px; }
      .lv-text { line-height: 1.2; }
      .lv-text b { font-size: .95rem; }
      .lv-text b::before { width: 8px; height: 8px; margin-right: 6px; }
      .lv-text small { font-size: .7rem; }
      .lv-text em { font-size: .66rem; }
      .btns { gap: 6px; }
      .btns .btn { padding: 7px 14px; font-size: .85rem; }
      .review { padding: 6px 10px; }
      .review ul { max-height: 84px; }
      .review li { font-size: .78rem; gap: 6px; }
      .review .jp { font-size: .95rem; }
      .typebar { gap: 8px; padding: 6px 10px; border-radius: 0 0 14px 14px; border-width: 2px; }
      .typebar input { font-size: 16px; padding: 4px 0; }
      .typebar input::placeholder { font-size: .85rem; }
      .prompt { font-size: 1rem; }
      .pause { width: 32px; height: 32px; border-radius: 8px; font-size: .85rem; }
    }
    @media (max-width: 380px) {
      .level img { width: 30px; height: 30px; }
      .lv-text small { display: none; }
    }
  `,
})
export class JpTypePage implements AfterViewInit {
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('inp');
  private readonly zone = inject(NgZone);
  /** Thông số game admin chỉnh. */
  private readonly gp = inject(SettingsService).settings;
  private game?: JpTypingGame;
  private typoTimer?: ReturnType<typeof setTimeout>;
  private hitTimer?: ReturnType<typeof setTimeout>;

  readonly ratio = `${W} / ${H}`;
  /** Màn hình hẹp (điện thoại) → rút gọn chữ gợi ý trong ô gõ. */
  readonly narrow = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 600px)').matches;
  readonly state = signal<JpState>('title');
  readonly result = signal<JpResult | null>(null);
  readonly typo = signal(false);
  readonly hit = signal(false);
  lastLevel: JpLevel = 'easy';

  /** 3 mức · 3 màu: xanh lá / vàng / đỏ, mỗi mức một bé fumo cùng tông. */
  readonly levels: LevelCard[] = [
    { id: 'easy', label: 'Dễ', desc: 'Hiragana & từ đơn giản', img: 'koishi' },
    { id: 'normal', label: 'Trung bình', desc: 'Katakana & kanji N5 · có cách đọc kana', img: 'yukari' },
    { id: 'hard', label: 'Khó', desc: 'Kanji khó · kana lộ khi rơi quá nửa', img: 'reimu' },
  ];
  readonly best: Record<JpLevel, WritableSignal<number>> = {
    easy: signal(JpTypingGame.best('easy')),
    normal: signal(JpTypingGame.best('normal')),
    hard: signal(JpTypingGame.best('hard')),
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.game?.destroy();
      clearTimeout(this.typoTimer);
      clearTimeout(this.hitTimer);
    });
  }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.game = new JpTypingGame(this.canvas().nativeElement, (s, r) =>
        this.zone.run(() => {
          this.state.set(s);
          if (r) {
            this.result.set(r);
            this.best[this.lastLevel].set(JpTypingGame.best(this.lastLevel));
          }
          if (s !== 'playing') this.input().nativeElement.value = '';
        }),
      );
    });
  }

  start(level: JpLevel): void {
    this.lastLevel = level;
    this.result.set(null);
    this.input().nativeElement.value = '';
    if (this.game) this.game.params = gameParams(this.gp().gameParams, 'jp-type');
    this.zone.runOutsideAngular(() => this.game?.start(level));
    // Ô gõ chỉ bật sau khi trạng thái đổi sang "playing".
    setTimeout(() => this.focusInput());
  }

  pause(): void {
    this.game?.pause();
  }

  resume(): void {
    this.zone.runOutsideAngular(() => this.game?.resume());
    setTimeout(() => this.focusInput());
  }

  toTitle(): void {
    if (this.game) this.game.state = 'title';
    this.state.set('title');
  }

  focusInput(): void {
    if (this.state() === 'playing') this.input().nativeElement.focus({ preventScroll: true });
  }

  onInput(): void {
    const el = this.input().nativeElement;
    const res = this.game?.type(el.value) ?? 'empty';
    if (res === 'done') {
      el.value = '';
      this.flashBar(this.hit, 'hit');
    } else if (res === 'typo') {
      this.flashBar(this.typo, 'typo');
    }
  }

  onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      const el = this.input().nativeElement;
      el.value = '';
      this.game?.type('');
    }
  }

  private flashBar(sig: WritableSignal<boolean>, which: 'hit' | 'typo'): void {
    sig.set(false);
    requestAnimationFrame(() => sig.set(true));
    const t = setTimeout(() => sig.set(false), 260);
    if (which === 'hit') {
      clearTimeout(this.hitTimer);
      this.hitTimer = t;
    } else {
      clearTimeout(this.typoTimer);
      this.typoTimer = t;
    }
  }
}

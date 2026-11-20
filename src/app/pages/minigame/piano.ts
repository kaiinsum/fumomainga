import { AfterViewInit, Component, DestroyRef, ElementRef, NgZone, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { gameParams } from '../../models/game-params';
import { SettingsService } from '../../services/settings.service';
import { playBaka, sfx } from '../../shared/sfx';
import { SoundToggleComponent } from '../../shared/sound-toggle';
import { GameSuggestComponent } from './game-suggest';
import { LeaderboardComponent } from './leaderboard';
import { Difficulty, H, KEYS, PianoGame, PianoResult, PianoState, W, makeChart } from './piano-engine';

interface Song {
  id: string;
  title: string;
  channel: string;
  thumb: string;
  seconds?: number;
}

/* ---------- YouTube IFrame API (tải khi cần) ---------- */
interface YtPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number, allow: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setVolume(v: number): void;
  loadVideoById(id: string): void;
  cueVideoById(id: string): void;
  destroy(): void;
}
interface YtNs {
  Player: new (el: HTMLElement, o: unknown) => YtPlayer;
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number; BUFFERING: number; CUED: number };
}
let ytPromise: Promise<YtNs> | null = null;
function loadYt(): Promise<YtNs> {
  const w = window as unknown as { YT?: YtNs & { loaded?: number }; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve(w.YT);
  ytPromise ??= new Promise<YtNs>((resolve, reject) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(w.YT!);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => {
      ytPromise = null;
      reject(new Error('Không tải được trình phát YouTube.'));
    };
    document.head.appendChild(s);
  });
  return ytPromise;
}

/** Lấy mã video từ link YouTube (watch?v=, youtu.be/, shorts/, embed/) hoặc chính mã 11 ký tự. */
export function youtubeId(text: string): string | null {
  const s = text.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = /(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/.exec(s);
  return m ? m[1] : null;
}

const RECENT_KEY = 'fumo.piano.recent';
const CHEER_FUMO = ['cirno', 'reimu', 'koishi', 'flandre', 'remilia', 'yuyuko', 'yukari', 'meiling', 'teto'];
const CHEER_COMBO = [
  'Bạn giỏi quá onii-chan!',
  'Sugoi~! Combo dữ vậy trời!',
  'Onii-chan đỉnh quá đi mất~',
  'Kakkoii! Tay nhanh như chớp luôn!',
  'Waa~ không trượt phát nào luôn á!',
  'Onee-chan cũng phải nể đó nha!',
];
const CHEER_PERFECT = ['Perfect liền tù tì luôn, giỏi quá onii-chan!', 'Chuẩn từng nhịp! Sugoi sugoi~', 'Thiên tài âm nhạc đây rồi!', 'Perfect nữa kìa! Yatta~!'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

@Component({
  selector: 'app-anime-piano',
  imports: [RouterLink, FormsModule, SoundToggleComponent, GameSuggestComponent, LeaderboardComponent],
  template: `
    <div class="container wrap">
      <nav class="crumbs"><a routerLink="/mini-game">← Chọn game khác</a><app-sound-toggle /></nav>
      <header class="head">
        <span class="chip">🎹 Âm nhạc · Nhịp điệu</span>
        <h1>Anime <span class="hl">Piano Tiles</span></h1>
        <p class="muted">Dán link bài anime / J-pop yêu thích trên YouTube, ô nhạc tự sinh theo nhịp bài — gõ trúng vạch để ăn <b>Perfect</b> và combo!</p>
      </header>

      <div class="layout">
        <app-leaderboard class="lb-slot" game="piano" [score]="state() === 'over' || state() === 'clear' ? result()?.score : null" />

        <div class="stage" [style.aspect-ratio]="ratio">
          <canvas #cv aria-label="Màn chơi Anime Piano Tiles"></canvas>

          @if (cheer(); as c) {
            <div class="cheer" [class.perfect]="c.kind === 'perfect'" aria-live="polite">
              <img [src]="'fumo-ninja/' + c.fumo + '.webp'" alt="" />
              <span class="cb">{{ c.text }}<b>{{ c.kind === 'combo' ? c.n + ' combo!' : c.n + ' Perfect liên tiếp!' }}</b></span>
            </div>
          }

          @if (state() === 'title') {
            <div class="overlay">
              @if (song(); as s) {
                <img class="ov-thumb" [src]="s.thumb" alt="" />
                <h2>{{ s.title }}</h2>
                <div class="seg" role="radiogroup" aria-label="Độ khó">
                  @for (d of diffs; track d.id) {
                    <button type="button" role="radio" [attr.aria-checked]="diff() === d.id" [class.on]="diff() === d.id" (click)="diff.set(d.id)">{{ d.label }}</button>
                  }
                </div>
                <div class="bpm">
                  <label>Nhịp <b>{{ bpm() }}</b> BPM
                    <input type="range" min="70" max="200" step="1" [ngModel]="bpm()" (ngModelChange)="bpm.set(+$event)" aria-label="Nhịp BPM" />
                  </label>
                  <button type="button" class="tap" (click)="tapTempo()" title="Bật nhạc rồi gõ theo nhịp 6–8 lần để tự đo BPM">👆 Gõ đo nhịp{{ taps().length > 1 ? ' (' + taps().length + ')' : '' }}</button>
                </div>
                <label class="off">Ô bắt đầu sau <b>{{ offset() }}s</b> (bỏ qua đoạn dạo đầu)
                  <input type="range" min="0" max="30" step="0.5" [ngModel]="offset()" (ngModelChange)="offset.set(+$event)" aria-label="Thời điểm bắt đầu" />
                </label>
                <button class="btn primary big" type="button" (click)="play()" [disabled]="!ready()">{{ ready() ? '▶ Bắt đầu' : 'Đang tải bài…' }}</button>
                <small>Bàn phím: <b>{{ keysLabel }}</b> · điện thoại: chạm vào làn</small>
              } @else {
                <h2>🎵 Chọn bài hát</h2>
                <p>Dán link YouTube của bài hát vào ô bên cạnh rồi bấm <b>Chọn bài</b>.</p>
              }
            </div>
          }
          @if (state() === 'paused') {
            <div class="overlay">
              <h2>⏸ Tạm dừng</h2>
              <button class="btn primary big" type="button" (click)="resume()">▶ Chơi tiếp</button>
              <button class="btn ghost" type="button" (click)="quit()">Chọn bài khác</button>
            </div>
          }
          @if (state() === 'over' || state() === 'clear') {
            <div class="overlay over">
              <h2>{{ state() === 'clear' ? '🎉 Hoàn thành bài!' : '💥 Hết lượt trượt rồi!' }}</h2>
              <p class="score">{{ result()?.score?.toLocaleString('vi-VN') }} điểm</p>
              <p>Chính xác {{ result()?.acc }}% · combo cao nhất <b>{{ result()?.maxCombo }}</b></p>
              <p class="judges">
                <span class="j p">Perfect {{ result()?.perfect }}</span><span class="j g">Great {{ result()?.great }}</span>
                <span class="j o">Good {{ result()?.good }}</span><span class="j m">Miss {{ result()?.miss }}</span>
              </p>
              @if (result()?.newBest) { <p class="new">🏆 Kỷ lục mới!</p> }
              <button class="btn primary big" type="button" (click)="play()">🔁 Chơi lại</button>
              <button class="btn ghost" type="button" (click)="quit()">Chọn bài khác</button>
            </div>
          }
          @if (state() === 'playing') {
            <button class="pause" type="button" (click)="pause()" aria-label="Tạm dừng">⏸</button>
          }
        </div>

        <aside class="side card-surface">
          <h2>🔗 Dán link bài hát</h2>
          <form class="search" (submit)="$event.preventDefault(); useLink()">
            <input [(ngModel)]="q" name="q" placeholder="https://www.youtube.com/watch?v=… hoặc youtu.be/…" maxlength="300" autocomplete="off" inputmode="url" />
            <button class="btn primary" type="submit">Chọn bài</button>
          </form>
          <small class="muted small">Mở YouTube, tìm bài anime / J-pop bạn thích → bấm <b>Chia sẻ</b> → <b>Sao chép đường liên kết</b> → dán vào đây.</small>
          @if (linkErr()) { <p class="err">{{ linkErr() }}</p> }
          @if (recent().length) {
            <h3>🕘 Chơi gần đây</h3>
            <ul class="results">
              @for (s of recent(); track s.id) {
                <li><button type="button" [class.on]="song()?.id === s.id" (click)="choose(s)">
                  <img [src]="s.thumb" alt="" loading="lazy" /><span><b>{{ s.title }}</b><small>{{ s.channel }}</small></span>
                </button></li>
              }
            </ul>
          }
          <!-- Trình phát YouTube (phải hiện theo quy định của YouTube) -->
          <div class="yt-wrap" [class.has]="!!song()"><div #yt></div></div>
          <p class="muted small">Ô nhạc được sinh theo <b>nhịp (BPM)</b> bạn chọn và riêng cho từng bài. Nhịp lệch? Bật nhạc, bấm <b>Gõ đo nhịp</b> theo phách 6–8 lần.</p>
        </aside>
      </div>
    </div>
    <app-game-suggest current="piano" />
  `,
  styles: `
    .wrap { padding: 24px 0 64px; }
    .crumbs { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
    .crumbs a { color: var(--muted); font-weight: 700; }
    .head { text-align: center; margin: 8px 0 18px; }
    .head h1 { margin: 8px 0 6px; font-size: clamp(1.8rem, 4vw, 2.6rem); }
    .hl { color: var(--primary); }
    .muted { color: var(--muted); }
    .small { font-size: .82rem; }
    .layout { display: grid; grid-template-columns: auto 340px; grid-template-areas: 'stage lb' 'stage side'; grid-template-rows: auto 1fr; gap: 16px 22px; justify-content: center; align-items: start; }
    .layout > .stage { grid-area: stage; } .layout > .lb-slot { grid-area: lb; } .layout > .side { grid-area: side; }
    .stage { position: relative; width: min(420px, calc(100vw - 32px), calc((100dvh - 100px) * ${W / H})); border-radius: 22px; overflow: hidden;
      touch-action: none; user-select: none; -webkit-user-select: none; box-shadow: 0 18px 44px rgba(150, 80, 255, .35), 0 0 0 3px #b18cff; background: #1b0b3a; }
    canvas { display: block; width: 100%; height: 100%; }
    .overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; text-align: center;
      padding: 22px; color: #fff; background: radial-gradient(circle, rgba(120, 60, 200, .82), rgba(20, 8, 45, .94)); overflow-y: auto; }
    .overlay h2 { margin: 0; font-size: clamp(1.15rem, 3.4vw, 1.6rem); line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .overlay p { margin: 0; opacity: .92; }
    .ov-thumb { width: 160px; border-radius: 12px; box-shadow: 0 6px 18px rgba(0,0,0,.4); }
    .overlay .score { font-size: 2.2rem; font-weight: 900; color: #ffe066; opacity: 1; }
    .overlay .new { color: #ffe066; font-weight: 800; }
    .judges { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
    .j { font-size: .78rem; font-weight: 800; padding: 3px 9px; border-radius: 999px; background: rgba(255,255,255,.14); }
    .j.p { color: #ffe066; } .j.g { color: #7af0ff; } .j.o { color: #9be7c4; } .j.m { color: #ff8a9a; }
    .seg { display: inline-flex; border-radius: 999px; overflow: hidden; border: 2px solid rgba(255,255,255,.4); }
    .seg button { border: 0; background: transparent; color: #fff; font: inherit; font-weight: 800; padding: 6px 14px; cursor: pointer; }
    .seg button.on { background: #fff; color: #3d1f6e; }
    .bpm { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: center; font-size: .9rem; }
    .bpm label, .off { display: flex; flex-direction: column; gap: 2px; font-size: .85rem; }
    .bpm input, .off input { width: 170px; accent-color: #ff7ac6; }
    .tap { font: inherit; font-size: .8rem; font-weight: 800; padding: 6px 12px; border-radius: 999px; border: 2px solid #ffe066; background: transparent; color: #ffe066; cursor: pointer; }
    .btn.big { font-size: 1.1rem; padding: 12px 26px; }
    .overlay small { opacity: .8; }
    .pause { position: absolute; top: 34px; left: 10px; width: 38px; height: 38px; border-radius: 50%; border: 0; background: rgba(255,255,255,.18); color: #fff; font-size: 1rem; cursor: pointer; }
    /* Fumo hiện lên khen */
    .cheer { position: absolute; left: 8px; right: 8px; top: 160px; display: flex; align-items: flex-end; gap: 6px; pointer-events: none; animation: cheer 1.9s ease both; }
    .cheer img { width: 92px; height: 92px; object-fit: contain; filter: drop-shadow(0 6px 10px rgba(0,0,0,.5)); animation: hop .5s ease 2; }
    .cb { background: #fff; color: #3d1f6e; font-weight: 800; font-size: .92rem; line-height: 1.3; padding: 9px 12px; border-radius: 16px 16px 16px 4px;
      box-shadow: 0 6px 18px rgba(255, 122, 198, .55); border: 2px solid #ff7ac6; margin-bottom: 44px; }
    .cb b { display: block; color: #ff4fa8; font-size: .8rem; }
    .cheer.perfect .cb { border-color: #ffe066; box-shadow: 0 6px 18px rgba(255, 224, 102, .6); }
    @keyframes cheer { 0% { opacity: 0; transform: translateX(-60px); } 12% { opacity: 1; transform: none; } 80% { opacity: 1; } 100% { opacity: 0; transform: translateY(-14px); } }
    @keyframes hop { 50% { transform: translateY(-14px) rotate(-6deg); } }
    /* Bảng tìm bài */
    .side { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
    .side h2 { margin: 0; font-size: 1.05rem; }
    .side h3 { margin: 4px 0 0; font-size: .9rem; }
    .search { display: flex; gap: 6px; }
    .search input { flex: 1; min-width: 0; font: inherit; padding: 9px 12px; border-radius: 12px; border: 2px solid var(--border); background: var(--surface); color: var(--text); }
    .search input:focus { outline: none; border-color: var(--primary); }
    .err { margin: 0; color: #e53935; font-size: .85rem; font-weight: 700; }
    .results { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; max-height: 330px; overflow-y: auto; }
    .results button { width: 100%; display: flex; gap: 8px; align-items: center; text-align: left; padding: 5px; border-radius: 10px; border: 2px solid transparent;
      background: var(--surface-2); color: inherit; font: inherit; cursor: pointer; }
    .results button:hover { border-color: var(--primary-300, var(--primary)); }
    .results button.on { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 12%, var(--surface)); }
    .results img { width: 72px; height: 40px; object-fit: cover; border-radius: 6px; flex: none; }
    .results span { min-width: 0; display: flex; flex-direction: column; }
    .results b { font-size: .8rem; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .results small { font-size: .7rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .yt-wrap { display: none; aspect-ratio: 16 / 9; width: 100%; border-radius: 12px; overflow: hidden; background: #000; }
    .yt-wrap.has { display: block; }
    .yt-wrap :is(div, iframe) { width: 100%; height: 100%; }
    @media (max-width: 900px) {
      .layout { grid-template-columns: minmax(0, 420px); grid-template-areas: 'side' 'lb' 'stage'; gap: 10px; }
      .wrap { padding-top: 12px; }
      .stage { width: min(420px, 100%); }
      .results { max-height: 220px; }
      .yt-wrap { width: 200px; align-self: center; }
    }
  `,
})
export class AnimePianoPage implements AfterViewInit {
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
  private readonly ytEl = viewChild.required<ElementRef<HTMLElement>>('yt');
  private readonly zone = inject(NgZone);
  private readonly settings = inject(SettingsService).settings;
  private game?: PianoGame;
  private player?: YtPlayer;
  private yt?: YtNs;

  readonly ratio = `${W} / ${H}`;
  readonly keysLabel = KEYS.map((k) => k.toUpperCase()).join(' ');
  readonly diffs: { id: Difficulty; label: string }[] = [
    { id: 'easy', label: 'Dễ' },
    { id: 'normal', label: 'Thường' },
    { id: 'hard', label: 'Khó' },
  ];

  readonly state = signal<PianoState>('title');
  readonly result = signal<PianoResult | null>(null);
  readonly cheer = signal<{ kind: 'combo' | 'perfect'; n: number; text: string; fumo: string } | null>(null);
  private cheerTimer?: ReturnType<typeof setTimeout>;
  private lastCheer = 0;

  q = '';
  readonly linkErr = signal('');
  readonly recent = signal<Song[]>(readRecent());
  readonly song = signal<Song | null>(null);
  readonly ready = signal(false);
  readonly diff = signal<Difficulty>('normal');
  readonly bpm = signal(120);
  readonly offset = signal(2);
  readonly taps = signal<number[]>([]);
  private duration = 0;
  private waitingStart = false;
  /** Đồng hồ mượt: lấy giờ từ YouTube rồi nội suy bằng performance.now(). */
  private clock = { yt: 0, at: 0, playing: false };

  readonly mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  readonly hasSong = computed(() => !!this.song());

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearInterval(this.syncId);
      this.game?.destroy();
      this.player?.destroy();
      clearTimeout(this.cheerTimer);
    });
  }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.game = new PianoGame(
        this.canvas().nativeElement,
        (s, r) =>
          this.zone.run(() => {
            this.state.set(s);
            if (r) this.result.set(r);
            if (s === 'over') {
              this.player?.pauseVideo();
              playBaka();
            }
            if (s === 'clear') sfx.play('win');
          }),
        (kind, n) => this.zone.run(() => this.showCheer(kind, n)),
      );
      this.game.time = () => this.now();
    });
  }

  /** Thời gian bài hát hiện tại (giây). */
  private now(): number {
    const c = this.clock;
    if (!c.playing) return c.yt;
    return c.yt + (performance.now() - c.at) / 1000;
  }

  private syncClock(): void {
    if (!this.player) return;
    const t = this.player.getCurrentTime();
    const est = this.now();
    // Lệch nhiều (tua / khựng) → nhảy theo YouTube; lệch ít → giữ đồng hồ mượt.
    if (Math.abs(t - est) > 0.08 || !this.clock.playing) this.clock = { yt: t, at: performance.now(), playing: this.clock.playing };
  }

  // ---------- Chọn bài bằng link YouTube (không cần API) ----------
  useLink(): void {
    const id = youtubeId(this.q);
    if (!id) {
      this.linkErr.set('Link chưa đúng — hãy dán link video YouTube (youtube.com/watch?v=… hoặc youtu.be/…).');
      return;
    }
    this.linkErr.set('');
    this.q = '';
    const known = this.recent().find((s) => s.id === id);
    void this.choose(known ?? { id, title: 'Đang tải tên bài…', channel: '', thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` });
  }

  /** Lấy tên bài / kênh từ chính trình phát YouTube (không gọi API nào). */
  private fillTitle(): void {
    const d = (this.player as unknown as { getVideoData?: () => { title?: string; author?: string; video_id?: string } })?.getVideoData?.();
    const s = this.song();
    if (!d?.title || !s || (d.video_id && d.video_id !== s.id)) return;
    const next = { ...s, title: d.title, channel: d.author ?? '' };
    this.song.set(next);
    this.recent.update((list) => list.map((x) => (x.id === next.id ? next : x)));
    saveRecent(this.recent());
  }

  async choose(s: Song): Promise<void> {
    if (this.state() === 'playing') return;
    this.song.set(s);
    this.ready.set(false);
    this.state.set('title');
    this.game!.state = 'title';
    this.taps.set([]);
    // Đã từng chơi bài này → nhớ BPM / độ trễ.
    const saved = readTuning(s.id);
    if (saved) {
      this.bpm.set(saved.bpm);
      this.offset.set(saved.offset);
    }
    this.recent.update((list) => [s, ...list.filter((x) => x.id !== s.id)].slice(0, 6));
    saveRecent(this.recent());
    try {
      this.yt ??= await loadYt();
    } catch (e) {
      this.linkErr.set(e instanceof Error ? e.message : 'Không tải được YouTube.');
      return;
    }
    if (this.player) {
      this.player.cueVideoById(s.id);
      return;
    }
    this.zone.runOutsideAngular(() => {
      this.player = new this.yt!.Player(this.ytEl().nativeElement, {
        videoId: s.id,
        width: '100%',
        height: '100%',
        playerVars: { playsinline: 1, controls: 0, disablekb: 1, rel: 0, modestbranding: 1, fs: 0, iv_load_policy: 3 },
        events: {
          onReady: () => this.zone.run(() => {
            this.ready.set(true);
            this.fillTitle();
          }),
          onStateChange: (e: { data: number }) => this.onYtState(e.data),
          onError: () => this.zone.run(() => {
            this.ready.set(false);
            this.linkErr.set('Video này không cho phát nhúng trong web khác (hoặc link sai) — thử bài khác nhé.');
          }),
        },
      });
    });
  }

  private onYtState(st: number): void {
    const P = this.yt!.PlayerState;
    if (st === P.CUED) this.zone.run(() => {
      this.ready.set(true);
      this.fillTitle();
    });
    if (st === P.PLAYING) {
      this.clock = { yt: this.player!.getCurrentTime(), at: performance.now(), playing: true };
      this.duration = this.player!.getDuration() || this.duration;
      if (this.waitingStart) {
        this.waitingStart = false;
        const s = this.song()!;
        const notes = makeChart(s.id, this.bpm(), this.offset(), this.duration, this.diff());
        this.game!.start(notes, this.duration, this.diff());
        this.syncTimer();
      } else if (this.game!.state === 'paused') {
        this.game!.resume();
      }
    } else if (st === P.PAUSED || st === P.BUFFERING) {
      this.syncClock();
      this.clock.playing = false;
      // Video tự dừng (quảng cáo / mạng chậm) → tạm dừng game theo.
      if (st === P.PAUSED && this.game!.state === 'playing') this.game!.pause();
    } else if (st === P.ENDED) {
      this.clock.playing = false;
      this.game!.finish();
    }
  }

  private syncId?: ReturnType<typeof setInterval>;
  private syncTimer(): void {
    clearInterval(this.syncId);
    this.syncId = setInterval(() => {
      if (this.game?.state !== 'playing') return;
      this.syncClock();
    }, 500);
  }

  // ---------- Điều khiển ----------
  play(): void {
    const s = this.song();
    if (!s || !this.player || !this.ready()) return;
    saveTuning(s.id, this.bpm(), this.offset());
    if (this.game) this.game.params = gameParams(this.settings().gameParams, 'piano');
    this.result.set(null);
    this.cheer.set(null);
    this.taps.set([]);
    this.canvas().nativeElement.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    this.waitingStart = true;
    this.clock = { yt: 0, at: performance.now(), playing: false };
    this.player.setVolume(80);
    this.player.seekTo(0, true);
    this.player.playVideo();
  }

  pause(): void {
    this.game?.pause();
    this.player?.pauseVideo();
  }

  resume(): void {
    // Video chạy lại → onYtState(PLAYING) tự cho game chạy tiếp.
    this.player?.playVideo();
  }

  quit(): void {
    this.player?.pauseVideo();
    this.game!.state = 'title';
    this.state.set('title');
    this.song.set(null);
  }

  /** Gõ theo nhịp nhạc để đo BPM (lấy trung bình các khoảng cách gần nhất). */
  tapTempo(): void {
    if (this.player && this.player.getPlayerState() !== this.yt?.PlayerState.PLAYING) this.player.playVideo();
    const now = performance.now();
    const list = [...this.taps().filter((t) => now - t < 2500 * 8), now].slice(-9);
    // Ngừng gõ quá 2.5 giây → đo lại từ đầu.
    const fresh = list.length > 1 && now - list[list.length - 2] > 2500 ? [now] : list;
    this.taps.set(fresh);
    if (fresh.length >= 4) {
      const gaps = fresh.slice(1).map((t, i) => t - fresh[i]);
      const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      let bpm = 60000 / avg;
      while (bpm < 70) bpm *= 2;
      while (bpm > 200) bpm /= 2;
      this.bpm.set(Math.round(bpm));
    }
  }

  private showCheer(kind: 'combo' | 'perfect', n: number): void {
    const now = performance.now();
    if (now - this.lastCheer < 2200) return;
    this.lastCheer = now;
    clearTimeout(this.cheerTimer);
    this.cheer.set({ kind, n, text: pick(kind === 'combo' ? CHEER_COMBO : CHEER_PERFECT), fumo: pick(CHEER_FUMO) });
    this.cheerTimer = setTimeout(() => this.cheer.set(null), 1900);
  }
}

// ---------- Lưu trên máy khách ----------
function readRecent(): Song[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as Song[];
    return Array.isArray(v) ? v.filter((s) => s && /^[A-Za-z0-9_-]{11}$/.test(s.id)).slice(0, 6) : [];
  } catch {
    return [];
  }
}
function saveRecent(list: Song[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* bỏ qua */
  }
}
function readTuning(id: string): { bpm: number; offset: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem('fumo.piano.tune.' + id) || 'null') as { bpm: number; offset: number } | null;
    return v && v.bpm >= 70 && v.bpm <= 200 ? v : null;
  } catch {
    return null;
  }
}
function saveTuning(id: string, bpm: number, offset: number): void {
  try {
    localStorage.setItem('fumo.piano.tune.' + id, JSON.stringify({ bpm, offset }));
  } catch {
    /* bỏ qua */
  }
}

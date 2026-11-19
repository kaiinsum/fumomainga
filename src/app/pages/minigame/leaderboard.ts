import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { checkPlayerName } from '../../shared/bad-words';

interface Entry {
  name: string;
  score: number;
  at: number;
}

const NAME_KEY = 'fumo.lb.name';
const MEDAL = ['🥇', '🥈', '🥉', '4', '5'];

/**
 * Bảng xếp hạng top 5 của 1 minigame. Máy tính: khung bên cạnh màn chơi.
 * Điện thoại: thanh nhỏ (chỉ hiện hạng 1), bấm để xem top 5 — không che giao diện game.
 * Hết ván mà lọt top 5 → hiện ô nhập tên (lọc từ cấm).
 */
@Component({
  selector: 'app-leaderboard',
  imports: [FormsModule],
  template: `
    <section class="lb" [class.compact]="compact()" [class.open]="open()" [class.done]="!!done()" [class.win]="!!form()" aria-label="Bảng xếp hạng">
      <button type="button" class="lb-head" (click)="compact() && open.set(!open())" [attr.aria-expanded]="compact() ? open() : null">
        <span class="t">🏆 <span class="t-txt">Bảng xếp hạng</span></span>
        @if (compact()) {
          <span class="first">
            @if (done(); as d) { Bạn: <b>{{ d.toLocaleString('vi-VN') }}</b> }
            @else if (top()[0]; as f) { 🥇 {{ f.name }} · <b>{{ f.score.toLocaleString('vi-VN') }}</b> }
            @else { Chưa có ai }
          </span>
          <span class="chev" aria-hidden="true">{{ open() ? '▴' : '▾' }}</span>
        } @else {
          <span class="sub">Top 5</span>
        }
      </button>

      @if (!compact() || open()) {
        <div class="body">
          <!-- Kết quả ván vừa chơi -->
          @if (form()) {
            <form class="result win" (ngSubmit)="submit()">
              <span class="spark s1" aria-hidden="true">✨</span><span class="spark s2" aria-hidden="true">⭐</span><span class="spark s3" aria-hidden="true">✨</span>
              <span class="r-label">🎉 Bạn lọt TOP 5!</span>
              <span class="r-score">{{ form()!.toLocaleString('vi-VN') }}</span>
              <span class="r-unit">điểm · dự kiến hạng #{{ expectedRank() }}</span>
              <label class="r-ask" for="lb-name">Nhập tên để lưu danh:</label>
              <input id="lb-name" name="nm" [(ngModel)]="name" (ngModelChange)="err.set('')" maxlength="20" placeholder="Tên của bạn" autocomplete="nickname" [class.bad]="!!err()" />
              @if (err()) { <span class="err">{{ err() }}</span> }
              <button class="save" type="submit" [disabled]="busy()">{{ busy() ? 'Đang lưu…' : '🏆 Lưu tên lên bảng' }}</button>
              <button type="button" class="skip" (click)="form.set(null)">Bỏ qua</button>
            </form>
          } @else if (done(); as d) {
            <div class="result" [class.saved]="!!mine()">
              @if (mine()) {
                <span class="r-label">🏆 Đã lưu tên bạn lên bảng!</span>
                <span class="r-score">{{ d.toLocaleString('vi-VN') }}</span>
                <span class="r-unit">điểm</span>
              } @else {
                <span class="r-label">Điểm ván này</span>
                <span class="r-score">{{ d.toLocaleString('vi-VN') }}</span>
                @if (gap() > 0) { <span class="r-unit">Còn thiếu <b>{{ gap().toLocaleString('vi-VN') }}</b> điểm để vào top 5 — thử lại nhé!</span> }
              }
            </div>
          }

          @if (loading()) {
            <p class="muted">Đang tải…</p>
          } @else if (!top().length) {
            <p class="muted">Chưa có ai trên bảng — chơi và ghi tên đầu tiên nhé!</p>
          } @else {
            <ol>
              @for (e of top(); track e.at; let i = $index) {
                <li [class.me]="e.at === mine()" [class.gold]="i === 0">
                  <span class="m" [class.num]="i > 2">{{ medal[i] }}</span>
                  <span class="nm" [title]="e.name">{{ e.name }}@if (e.at === mine()) { <i class="you">Bạn</i> }</span>
                  <b class="sc">{{ e.score.toLocaleString('vi-VN') }}</b>
                </li>
              }
            </ol>
          }
          @if (loadErr()) { <p class="muted small">{{ loadErr() }}</p> }
        </div>
      }
    </section>
  `,
  styles: `
    :host { display: block; min-width: 0; max-width: 100%; }
    .lb { background: var(--surface); border: 1.5px solid var(--border); border-radius: 16px; overflow: hidden; min-width: 0;
      box-shadow: 0 8px 24px color-mix(in srgb, var(--primary) 12%, transparent); transition: box-shadow .3s, border-color .3s; }
    /* Hết ván: viền vàng phát sáng */
    .lb.done { border-color: #f5b400; animation: lb-pop .5s cubic-bezier(.2, 1.4, .4, 1); box-shadow: 0 0 0 3px color-mix(in srgb, #ffd23f 45%, transparent), 0 12px 30px rgba(245, 180, 0, .3); }
    .lb.win { animation: lb-pop .5s cubic-bezier(.2, 1.4, .4, 1), lb-glow 1.6s ease-in-out .5s infinite; }
    @keyframes lb-pop { from { transform: scale(.94); } }
    @keyframes lb-glow { 50% { box-shadow: 0 0 0 5px color-mix(in srgb, #ffd23f 60%, transparent), 0 0 34px rgba(255, 190, 0, .55); } }
    .lb-head { width: 100%; display: flex; align-items: center; gap: 8px; padding: 12px 14px; border: 0; font: inherit; text-align: left; cursor: default; min-width: 0;
      background: linear-gradient(135deg, color-mix(in srgb, #ffd23f 30%, var(--surface)), var(--surface)); color: var(--text); }
    .t { font-weight: 900; font-size: 1rem; white-space: nowrap; flex: none; }
    .sub { margin-left: auto; font-size: .72rem; font-weight: 800; color: var(--muted); white-space: nowrap; }
    .body { padding: 10px 12px 12px; min-width: 0; }
    ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
    li { display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 10px; font-size: .88rem; min-width: 0; }
    li.gold { background: color-mix(in srgb, #ffd23f 20%, transparent); }
    li.me { background: color-mix(in srgb, var(--primary) 16%, transparent); box-shadow: inset 0 0 0 2px var(--primary); position: relative; overflow: hidden; }
    li.me::after { content: ''; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,.6) 50%, transparent 70%);
      transform: translateX(-100%); animation: shine 2.2s ease-in-out infinite; pointer-events: none; }
    @keyframes shine { 60%, 100% { transform: translateX(100%); } }
    .m { text-align: center; font-size: 1.1rem; line-height: 1; }
    .m.num { font-size: .82rem; font-weight: 900; color: var(--muted); }
    .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
    .you { font-style: normal; font-size: .65rem; font-weight: 900; margin-left: 6px; padding: 1px 6px; border-radius: 999px; background: var(--primary); color: var(--on-primary); vertical-align: middle; }
    .sc { font-variant-numeric: tabular-nums; color: var(--primary-dark); white-space: nowrap; font-size: .85rem; }
    .muted { color: var(--muted); font-size: .85rem; margin: 6px 0; }
    .small { font-size: .75rem; }
    /* Khung kết quả */
    .result { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; padding: 12px 10px; margin-bottom: 10px;
      border-radius: 14px; background: color-mix(in srgb, var(--primary) 10%, var(--surface)); border: 1.5px solid color-mix(in srgb, var(--primary) 35%, transparent); min-width: 0; }
    .result.win { background: radial-gradient(circle at 50% 0, color-mix(in srgb, #ffd23f 45%, var(--surface)), color-mix(in srgb, #ffd23f 12%, var(--surface)) 70%); border-color: #f5b400; }
    .result.saved { background: color-mix(in srgb, #3fcf74 14%, var(--surface)); border-color: #3fcf74; }
    .r-label { font-weight: 900; font-size: .95rem; }
    .result.win .r-label { color: #b06d00; font-size: 1.05rem; letter-spacing: .02em; }
    .r-score { font-size: clamp(1.6rem, 6vw, 2.1rem); font-weight: 900; line-height: 1.1; color: var(--primary-dark); font-variant-numeric: tabular-nums; max-width: 100%; overflow-wrap: anywhere; }
    .result.win .r-score { color: #d48800; text-shadow: 0 2px 0 rgba(255,255,255,.7); animation: bump .6s cubic-bezier(.2, 1.6, .4, 1); }
    @keyframes bump { from { transform: scale(.5); opacity: 0; } }
    .r-unit { font-size: .78rem; color: var(--muted); line-height: 1.4; }
    .r-ask { margin-top: 6px; font-size: .8rem; font-weight: 700; align-self: stretch; text-align: left; }
    .result input { align-self: stretch; min-width: 0; width: 100%; box-sizing: border-box; font: inherit; font-size: .9rem; padding: 8px 10px; border-radius: 10px;
      border: 1.5px solid #f5b400; background: var(--surface); color: var(--text); }
    .result input.bad { border-color: #e53935; background: color-mix(in srgb, #e53935 8%, var(--surface)); }
    .err { align-self: stretch; text-align: left; color: #e53935; font-size: .78rem; font-weight: 700; }
    .save { align-self: stretch; margin-top: 2px; border: 0; border-radius: 10px; padding: 9px 10px; font: inherit; font-weight: 900; font-size: .9rem; cursor: pointer;
      color: #3a2a00; background: linear-gradient(135deg, #ffd23f, #ffb000); box-shadow: 0 4px 12px rgba(245, 160, 0, .4); }
    .save:disabled { opacity: .6; cursor: default; }
    .skip { border: 0; background: none; color: var(--muted); font: inherit; font-size: .76rem; text-decoration: underline; cursor: pointer; padding: 0; }
    .spark { position: absolute; font-size: .9rem; animation: twinkle 1.4s ease-in-out infinite; pointer-events: none; }
    .s1 { top: 6px; left: 10px; } .s2 { top: 8px; right: 12px; animation-delay: -.5s; } .s3 { top: 40px; left: 18px; animation-delay: -.9s; }
    @keyframes twinkle { 50% { transform: scale(1.4) rotate(20deg); opacity: .5; } }
    /* Điện thoại: thanh nhỏ, bấm để mở */
    .lb.compact { border-radius: 12px; }
    .lb.compact .lb-head { cursor: pointer; padding: 8px 12px; }
    .lb.compact .t { font-size: .85rem; }
    .first { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .8rem; color: var(--muted); }
    .first b { color: var(--primary-dark); }
    .chev { color: var(--muted); flex: none; }
    .lb.compact li { padding: 5px 6px; font-size: .84rem; }
    @media (max-width: 360px) { .t-txt { display: none; } }
    @media (prefers-reduced-motion: reduce) { .lb, .lb.win, .r-score, li.me::after, .spark { animation: none !important; } }
  `,
})
export class LeaderboardComponent {
  /** id game: shmup | jp-type | ninja | crush | merge */
  readonly game = input.required<string>();
  /** Điểm ván vừa chơi xong (null khi đang chơi). */
  readonly score = input<number | null | undefined>(null);

  readonly medal = MEDAL;
  readonly top = signal<Entry[]>([]);
  readonly loading = signal(true);
  readonly loadErr = signal('');
  readonly form = signal<number | null>(null);
  readonly err = signal('');
  readonly busy = signal(false);
  readonly mine = signal<number | null>(null);
  readonly open = signal(false);
  readonly compact = signal(matchMedia('(max-width: 900px)').matches);
  /** Điểm ván vừa xong (để hiện khung kết quả). */
  readonly done = computed(() => {
    const s = this.score();
    return s && s > 0 ? s : null;
  });
  /** Còn thiếu bao nhiêu điểm để vào top 5. */
  readonly gap = computed(() => {
    const t = this.top();
    const d = this.done() ?? 0;
    return t.length < 5 ? 0 : Math.max(0, t[4].score - d + 1);
  });
  readonly expectedRank = computed(() => {
    const d = this.form() ?? 0;
    return this.top().filter((e) => e.score >= d).length + 1;
  });
  name = (() => {
    try {
      return localStorage.getItem(NAME_KEY) ?? '';
    } catch {
      return '';
    }
  })();

  constructor() {
    const mq = matchMedia('(max-width: 900px)');
    const onMq = () => this.compact.set(mq.matches);
    mq.addEventListener('change', onMq);
    inject(DestroyRef).onDestroy(() => mq.removeEventListener('change', onMq));
    effect(() => {
      const g = this.game();
      untracked(() => void this.load(g));
    });
    // Hết ván → lọt top 5 thì mời nhập tên.
    effect(() => {
      const s = this.score();
      untracked(() => {
        if (!s || s <= 0) {
          this.form.set(null);
          this.mine.set(null);
          return;
        }
        // Hết ván (kể cả không lọt top): mở thanh trên điện thoại để thấy kết quả.
        this.open.set(true);
        const t = this.top();
        if (t.length < 5 || s > t[4].score) {
          this.form.set(s);
          this.err.set('');
          this.open.set(true);
        }
      });
    });
  }

  async load(game: string): Promise<void> {
    this.loading.set(true);
    try {
      const res = await fetch(`/api/leaderboard?game=${encodeURIComponent(game)}`);
      const data = (await res.json().catch(() => null)) as { top?: Entry[] } | null;
      if (!res.ok || !data?.top) throw new Error();
      this.top.set(data.top);
      this.loadErr.set('');
    } catch {
      this.loadErr.set('Bảng xếp hạng chỉ có khi web chạy trên máy chủ.');
    } finally {
      this.loading.set(false);
    }
  }

  async submit(): Promise<void> {
    const score = this.form();
    if (!score) return;
    const name = this.name.replace(/\s+/g, ' ').trim();
    const bad = checkPlayerName(name);
    if (bad) return this.err.set(bad);
    this.busy.set(true);
    try {
      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ game: this.game(), name, score }),
      });
      const data = (await res.json().catch(() => null)) as { top?: Entry[]; rank?: number; error?: string } | null;
      if (!res.ok || !data?.top) throw new Error(data?.error || 'Không lưu được, thử lại sau nhé.');
      this.top.set(data.top);
      this.mine.set(data.rank ? (data.top[data.rank - 1]?.at ?? null) : null);
      this.form.set(null);
      try {
        localStorage.setItem(NAME_KEY, name);
      } catch {
        /* bỏ qua */
      }
      if (!data.rank) this.err.set('');
    } catch (e) {
      this.err.set(e instanceof Error ? e.message : 'Không lưu được.');
    } finally {
      this.busy.set(false);
    }
  }
}

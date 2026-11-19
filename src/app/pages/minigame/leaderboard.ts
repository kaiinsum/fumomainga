import { Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
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
    <section class="lb" [class.compact]="compact()" [class.open]="open()" aria-label="Bảng xếp hạng">
      <button type="button" class="lb-head" (click)="compact() && open.set(!open())" [attr.aria-expanded]="compact() ? open() : null">
        <span class="t">🏆 Bảng xếp hạng</span>
        @if (compact()) {
          <span class="first">
            @if (top()[0]; as f) { 🥇 {{ f.name }} · <b>{{ f.score.toLocaleString('vi-VN') }}</b> } @else { Chưa có ai }
          </span>
          <span class="chev" aria-hidden="true">{{ open() ? '▴' : '▾' }}</span>
        }
      </button>

      @if (!compact() || open()) {
        <div class="body">
          @if (form()) {
            <form class="submit" (ngSubmit)="submit()">
              <p>🎉 <b>{{ form()!.toLocaleString('vi-VN') }} điểm</b> — bạn lọt <b>top 5</b>! Nhập tên để lưu danh:</p>
              <div class="row">
                <input name="nm" [(ngModel)]="name" (ngModelChange)="err.set('')" maxlength="20" placeholder="Tên của bạn" autocomplete="nickname" [class.bad]="!!err()" />
                <button class="btn primary small" type="submit" [disabled]="busy()">{{ busy() ? '…' : 'Lưu' }}</button>
              </div>
              @if (err()) { <span class="err">{{ err() }}</span> }
              <button type="button" class="skip" (click)="form.set(null)">Bỏ qua</button>
            </form>
          }
          @if (loading()) {
            <p class="muted">Đang tải…</p>
          } @else if (!top().length) {
            <p class="muted">Chưa có ai trên bảng — chơi và ghi tên đầu tiên nhé!</p>
          } @else {
            <ol>
              @for (e of top(); track e.at; let i = $index) {
                <li [class.me]="e.at === mine()">
                  <span class="m" [class.num]="i > 2">{{ medal[i] }}</span>
                  <span class="nm">{{ e.name }}</span>
                  <b>{{ e.score.toLocaleString('vi-VN') }}</b>
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
    :host { display: block; }
    .lb { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; overflow: hidden;
      box-shadow: 0 8px 24px color-mix(in srgb, var(--primary) 12%, transparent); }
    .lb-head { width: 100%; display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 0; font: inherit; text-align: left; cursor: default;
      background: linear-gradient(135deg, color-mix(in srgb, #ffd23f 30%, var(--surface)), var(--surface)); color: var(--text); }
    .t { font-weight: 900; font-size: 1rem; }
    .body { padding: 8px 14px 14px; }
    ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
    li { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 10px; font-size: .9rem; }
    li:nth-child(1) { background: color-mix(in srgb, #ffd23f 18%, transparent); }
    li.me { outline: 2px solid var(--primary); background: color-mix(in srgb, var(--primary) 14%, transparent); }
    .m { width: 26px; text-align: center; font-size: 1.15rem; flex: none; }
    .m.num { font-size: .85rem; font-weight: 900; color: var(--muted); }
    .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
    li b { font-variant-numeric: tabular-nums; color: var(--primary-dark); }
    .muted { color: var(--muted); font-size: .85rem; margin: 6px 0; }
    .small { font-size: .75rem; }
    .submit { display: grid; gap: 6px; padding: 10px; margin-bottom: 10px; border-radius: 12px; background: color-mix(in srgb, #ffd23f 16%, var(--surface)); border: 1.5px dashed #f5b400; }
    .submit p { margin: 0; font-size: .85rem; }
    .row { display: flex; gap: 6px; }
    .row input { flex: 1; min-width: 0; font: inherit; padding: 7px 10px; border-radius: 10px; border: 1.5px solid var(--border); background: var(--surface); color: var(--text); }
    .row input.bad { border-color: #e53935; background: color-mix(in srgb, #e53935 8%, var(--surface)); }
    .err { color: #e53935; font-size: .8rem; font-weight: 700; }
    .skip { justify-self: start; border: 0; background: none; color: var(--muted); font: inherit; font-size: .78rem; text-decoration: underline; cursor: pointer; padding: 0; }
    /* Điện thoại: thanh nhỏ, bấm để mở */
    .lb.compact { border-radius: 12px; }
    .lb.compact .lb-head { cursor: pointer; padding: 8px 12px; }
    .lb.compact .t { font-size: .85rem; white-space: nowrap; }
    .first { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .82rem; color: var(--muted); }
    .first b { color: var(--primary-dark); }
    .chev { color: var(--muted); }
    .lb.compact li { padding: 5px 6px; font-size: .84rem; }
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
        if (!s || s <= 0) return this.form.set(null);
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

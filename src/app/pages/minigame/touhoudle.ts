import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GameSuggestComponent } from './game-suggest';
import { ThAvatarComponent } from './th-avatar';
import { playBaka, sfx } from '../../shared/sfx';
import { SoundToggleComponent } from '../../shared/sound-toggle';
import { CHARACTERS, Character, GAMES, stageOrder } from './touhoudle-data';

type Mark = 'ok' | 'partial' | 'bad';
type Arrow = 'up' | 'down' | '';

interface Cell {
  text: string;
  mark: Mark;
  arrow: Arrow;
}

interface Row {
  name: string;
  char: Character;
  cells: Cell[];
}

type Mode = 'daily' | 'endless';

const STORE_KEY = 'fumo.touhoudle.v1';

const HINT_AFTER = 6;
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .trim();

/** Ngày theo giờ Việt Nam, dạng YYYY-MM-DD. */
const todayVN = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

/** Chọn nhân vật của ngày: băm ngày → vị trí trong danh sách (ai chơi cũng cùng đáp án). */
function dailyIndex(date: string): number {
  let h = 2166136261;
  for (const ch of `touhoudle:${date}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % CHARACTERS.length;
}

const gameLabel = (g: number) => `TH${g}`;

interface Saved {
  date: string;
  guesses: string[];
  won: boolean;
  streak: number;
  lastWin: string;
}

@Component({
  selector: 'app-touhoudle',
  imports: [FormsModule, RouterLink, ThAvatarComponent, SoundToggleComponent, GameSuggestComponent],
  template: `
    <div class="container wrap">
      <nav class="crumbs"><a routerLink="/mini-game">← Chọn game khác</a><app-sound-toggle /></nav>
      <header class="head">
        <span class="chip">🔎 Đoán nhân vật</span>
        <h1>Đoán nhân vật <span class="hl">(Touhoudle)</span></h1>
        <p class="muted">Đoán nhân vật bí ẩn. Mỗi lần đoán, các ô sẽ cho biết bạn đúng tới đâu.</p>
        <div class="modes">
          <button type="button" [class.on]="mode() === 'daily'" (click)="setMode('daily')">📅 Hằng ngày</button>
          <button type="button" [class.on]="mode() === 'endless'" (click)="setMode('endless')">♾️ Vô hạn</button>
        </div>
      </header>

      @if (won()) {
        <section class="win card-surface">
          <app-th-avatar [char]="answer()" [size]="104" [alt]="true" />
          <h2>Chính xác! Đó là <span class="hl">{{ answer().name }}</span></h2>
          <p>Bạn đoán đúng sau <b>{{ rows().length }}</b> lần{{ mode() === 'daily' ? ' · chuỗi thắng: ' + streak() + ' ngày' : '' }}.</p>
          <div class="row">
            <button class="btn primary" type="button" (click)="share()">📋 Chia sẻ kết quả</button>
            @if (mode() === 'daily') {
              <button class="btn ghost" type="button" (click)="setMode('endless')">♾️ Chơi tiếp chế độ vô hạn</button>
            } @else {
              <button class="btn ghost" type="button" (click)="newEndless()">🔁 Nhân vật khác</button>
            }
          </div>
          @if (mode() === 'daily') { <small class="muted">Nhân vật mới vào 0h mỗi ngày.</small> }
        </section>
      } @else if (gaveUp()) {
        <section class="win card-surface lose">
          <app-th-avatar [char]="answer()" [size]="104" [alt]="true" />
          <h2>Đáp án là <span class="hl">{{ answer().name }}</span></h2>
          <button class="btn primary" type="button" (click)="newEndless()">🔁 Nhân vật khác</button>
        </section>
      } @else {
        <form class="guess" (ngSubmit)="submit()" autocomplete="off">
          <div class="combo">
            <input
              #box
              name="q"
              [ngModel]="query()"
              (ngModelChange)="query.set($event); active.set(0); open.set(true)"
              (keydown)="onKey($event)"
              (focus)="open.set(true)"
              (click)="open.set(true)"
              (blur)="closeSoon()"
              placeholder="Gõ tên hoặc bấm để xem tất cả nhân vật (VD: Reimu, Cirno)"
              aria-label="Tên nhân vật"
              role="combobox"
              [attr.aria-expanded]="open() && suggestions().length > 0"
            />
            @if (open() && suggestions().length) {
              <ul class="suggest" role="listbox">
                @for (s of suggestions(); track s.name; let i = $index) {
                  <li role="option" [class.on]="i === active()" [attr.aria-selected]="i === active()" (mousedown)="$event.preventDefault(); pick(s)">
                    <app-th-avatar [char]="s" [size]="36" />
                    <b>{{ s.name }}</b> <small>{{ label(s.game) }}</small>
                  </li>
                }
              </ul>
            }
          </div>
          <button class="btn primary" type="submit">Đoán</button>
        </form>
        <div class="meta">
          <span>Đã đoán: <b>{{ rows().length }}</b></span>
          @if (rows().length >= hintAfter) {
            <span class="hint">💡 Gợi ý: tên bắt đầu bằng chữ <b>{{ answer().name[0] }}</b> · {{ fullGame(answer().game) }}</span>
          } @else {
            <span class="muted">Gợi ý mở sau {{ hintAfter - rows().length }} lần đoán nữa</span>
          }
          @if (mode() === 'endless' && rows().length) {
            <button class="link" type="button" (click)="giveUp()">Chịu thua</button>
          }
        </div>
      }

      @if (msg()) { <p class="msg">{{ msg() }}</p> }

      <div class="board" role="table" aria-label="Các lần đoán">
        <div class="tr th" role="row">
          @for (h of headers; track h) { <span role="columnheader">{{ h }}</span> }
        </div>
        @for (r of rows(); track r.name; let ri = $index) {
          <div class="tr" role="row">
            <span class="cell name" role="cell" [class]="'cell name ' + (r.name === answer().name ? 'ok' : 'bad')">
              <app-th-avatar [char]="r.char" [size]="36" />
              <span class="nm">{{ r.name }}</span>
            </span>
            @for (c of r.cells; track $index; let ci = $index) {
              <span class="cell" role="cell" [class]="'cell ' + c.mark" [style.animation-delay.ms]="ri === 0 ? ci * 160 : 0">
                {{ c.text }}
                @if (c.arrow === 'up') { <i class="arrow" title="Đáp án ở sau / cao hơn">↑</i> }
                @if (c.arrow === 'down') { <i class="arrow" title="Đáp án ở trước / thấp hơn">↓</i> }
              </span>
            }
          </div>
        }
      </div>

      <section class="legend card-surface">
        <span><i class="sw ok"></i> Đúng</span>
        <span><i class="sw partial"></i> Đúng một phần</span>
        <span><i class="sw bad"></i> Sai</span>
        <span>↑ ↓ đáp án ở game / màn sau hoặc trước</span>
        <small class="muted">{{ total }} nhân vật · Dữ liệu do shop tự tổng hợp, có thể còn thiếu sót.</small>
      </section>
    </div>

    @if (toast()) { <div class="toast">{{ toast() }}</div> }
    <app-game-suggest current="touhoudle" />
  `,
  styles: `
    .wrap { padding: 24px 0 64px; }
    .crumbs { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
    .crumbs a { color: var(--muted); font-weight: 700; }
    .crumbs a:hover { color: var(--primary); }
    .head { text-align: center; margin: 8px 0 20px; }
    .head h1 { margin: 8px 0 6px; font-size: clamp(1.7rem, 4vw, 2.5rem); }
    .hl { color: var(--primary); }
    .muted { color: var(--muted); }
    .modes { display: inline-flex; gap: 4px; padding: 4px; margin-top: 12px; border-radius: 999px; background: var(--surface-2); }
    .modes button { font: inherit; font-weight: 800; padding: 7px 16px; border-radius: 999px; border: none; background: none; color: var(--muted); cursor: pointer; }
    .modes button.on { background: var(--primary); color: var(--on-primary); }

    .guess { display: flex; gap: 10px; max-width: 560px; margin: 0 auto; }
    .combo { position: relative; flex: 1; }
    .combo input { width: 100%; box-sizing: border-box; font: inherit; padding: 12px 16px; border-radius: 14px; border: 2px solid var(--border); background: var(--surface); color: var(--text); outline: none; }
    .combo input:focus { border-color: var(--primary); box-shadow: 0 0 0 4px var(--primary-100); }
    .suggest { position: absolute; z-index: 5; left: 0; right: 0; top: calc(100% + 6px); margin: 0; padding: 6px; list-style: none; max-height: 300px; overflow-y: auto;
      background: var(--surface); border: 1.5px solid var(--border); border-radius: 14px; box-shadow: var(--shadow); }
    .suggest li { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-radius: 10px; cursor: pointer; }
    .suggest li b { flex: 1; }
    .suggest li small { color: var(--muted); }
    .suggest li.on, .suggest li:hover { background: var(--surface-2); }
    .meta { display: flex; justify-content: center; flex-wrap: wrap; gap: 16px; margin: 12px 0 0; font-size: .9rem; }
    .hint { color: var(--primary-dark); }
    .link { background: none; border: none; padding: 0; font: inherit; color: var(--muted); text-decoration: underline; cursor: pointer; }
    .msg { text-align: center; color: var(--error, #b32d2e); font-weight: 700; }

    .board { margin: 22px auto 0; max-width: 1100px; overflow-x: auto; padding-bottom: 6px; }
    .tr { display: grid; grid-template-columns: 170px 90px 1.3fr 140px 120px 1.2fr 110px; gap: 6px; min-width: 900px; margin-bottom: 6px; }
    .th span { font-size: .78rem; font-weight: 800; text-align: center; color: var(--muted); padding: 4px; border-bottom: 2px solid var(--border); }
    .cell { position: relative; display: grid; place-items: center; min-height: 64px; padding: 6px 8px; border-radius: 10px; text-align: center;
      font-size: .85rem; font-weight: 700; color: #fff; animation: flip .45s ease both; }
    .cell.ok { background: #2fbf71; }
    .cell.partial { background: #e2a72e; }
    .cell.bad { background: #d9534f; }
    .cell.name { background: var(--surface-2); color: var(--text); border: 2px solid var(--border); display: flex; align-items: center; gap: 8px; justify-content: flex-start; text-align: left; }
    .cell.name .nm { line-height: 1.25; }

    .cell.name.ok { border-color: #2fbf71; }
    .arrow { position: absolute; right: 6px; bottom: 2px; font-style: normal; font-size: 1.3rem; opacity: .85; }

    .win { text-align: center; padding: 22px; max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 8px; animation: pop .5s cubic-bezier(.2,1.4,.4,1); }
    .win h2 { margin: 0; }
    .win p { margin: 0; }
    .big { font-size: 3rem; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }

    .legend { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: center; padding: 12px 16px; margin: 20px auto 0; max-width: 900px; font-size: .85rem; }
    .sw { display: inline-block; width: 14px; height: 14px; border-radius: 4px; vertical-align: -2px; margin-right: 4px; }
    .sw.ok { background: #2fbf71; } .sw.partial { background: #e2a72e; } .sw.bad { background: #d9534f; }
    .toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 50; background: var(--text); color: var(--surface); padding: 8px 16px; border-radius: 999px; font-weight: 700; }

    @keyframes flip { from { transform: rotateX(90deg); opacity: 0; } to { transform: rotateX(0); opacity: 1; } }
    @keyframes pop { from { opacity: 0; transform: scale(.9); } }
    @media (prefers-reduced-motion: reduce) { .cell, .win { animation: none; } }
    @media (max-width: 560px) { .guess { flex-direction: column; } }
  `,
})
export class TouhoudlePage {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  readonly headers = ['Nhân vật', 'Giới tính', 'Chủng loài', 'Game đầu tiên', 'Vai trò', 'Nơi ở', 'Màu tóc'];
  readonly hintAfter = HINT_AFTER;
  readonly total = CHARACTERS.length;
  readonly mode = signal<Mode>('daily');
  readonly answer = signal<Character>(CHARACTERS[dailyIndex(todayVN())]);
  readonly guesses = signal<string[]>([]);
  readonly query = signal('');
  readonly open = signal(false);
  readonly active = signal(0);
  readonly msg = signal('');
  readonly toast = signal('');
  readonly gaveUp = signal(false);
  readonly streak = signal(0);

  readonly rows = computed<Row[]>(() =>
    this.guesses()
      .map((n) => CHARACTERS.find((c) => c.name === n))
      .filter((c): c is Character => !!c)
      .map((g) => ({ name: g.name, char: g, cells: this.compare(g, this.answer()) }))
      .reverse(),
  );
  readonly won = computed(() => this.guesses().includes(this.answer().name));

  /**
   * Gợi ý tên: hiện ĐỦ mọi nhân vật khớp (không cắt bớt) - danh sách tự cuộn.
   * Chưa gõ gì → hiện toàn bộ nhân vật theo ABC để khách lướt chọn.
   * Xếp hạng: khớp đầu tên > khớp đầu một chữ trong tên > khớp giữa tên; bỏ dấu, bỏ khoảng trắng / gạch nối khi so.
   */
  readonly suggestions = computed(() => {
    const q = norm(this.query());
    const used = new Set(this.guesses());
    const pool = CHARACTERS.filter((c) => !used.has(c.name));
    if (!q) return [...pool].sort((x, y) => x.name.localeCompare(y.name));
    const flat = (t: string) => t.replace(/[\s\-'’.]+/g, '');
    const qf = flat(q);
    const scored: { c: Character; r: number }[] = [];
    for (const c of pool) {
      const n = norm(c.name);
      const r = n.startsWith(q)
        ? 0
        : n.split(/[\s\-]+/).some((w) => w.startsWith(q))
          ? 1
          : q.length >= 2 && (n.includes(q) || flat(n).includes(qf))
            ? 2
            : -1;
      if (r >= 0) scored.push({ c, r });
    }
    return scored.sort((x, y) => x.r - y.r || x.c.name.localeCompare(y.c.name)).map((x) => x.c);
  });

  constructor() {
    this.loadDaily();
  }

  label(g: number): string {
    return gameLabel(g);
  }

  fullGame(g: number): string {
    return GAMES[g] ?? gameLabel(g);
  }

  setMode(m: Mode): void {
    this.mode.set(m);
    this.msg.set('');
    this.gaveUp.set(false);
    if (m === 'daily') this.loadDaily();
    else this.newEndless();
  }

  newEndless(): void {
    let next = this.answer();
    while (CHARACTERS.length > 1 && next.name === this.answer().name) next = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
    this.mode.set('endless');
    this.answer.set(next);
    this.guesses.set([]);
    this.gaveUp.set(false);
    this.query.set('');
  }

  onKey(e: KeyboardEvent): void {
    const list = this.suggestions();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.open.set(true);
      this.active.set(Math.min(list.length - 1, this.active() + 1));
      this.revealActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.active.set(Math.max(0, this.active() - 1));
      this.revealActive();
    } else if (e.key === 'Escape') this.open.set(false);
  }

  /** Cuộn danh sách gợi ý tới mục đang chọn bằng phím. */
  private revealActive(): void {
    requestAnimationFrame(() => document.querySelector('.suggest li.on')?.scrollIntoView({ block: 'nearest' }));
  }

  giveUp(): void {
    this.gaveUp.set(true);
    playBaka();
  }

  closeSoon(): void {
    setTimeout(() => this.open.set(false), 120);
  }

  submit(): void {
    const list = this.suggestions();
    const q = norm(this.query());
    const exact = CHARACTERS.find((c) => norm(c.name) === q);
    const pick = exact ?? list[this.active()] ?? list[0];
    if (!pick) {
      this.msg.set(q ? 'Không tìm thấy nhân vật này trong danh sách.' : 'Hãy gõ tên nhân vật.');
      return;
    }
    this.pick(pick);
  }

  pick(c: Character): void {
    this.msg.set('');
    if (this.guesses().includes(c.name)) {
      this.msg.set('Bạn đã đoán nhân vật này rồi.');
      return;
    }
    this.guesses.update((g) => [...g, c.name]);
    // Lật 6 ô lần lượt (khớp hiệu ứng lật 160ms/ô), rồi báo đúng / sai.
    for (let i = 0; i < 6; i++) setTimeout(() => sfx.play('flip'), i * 160);
    const right = c.name === this.answer().name;
    setTimeout(() => sfx.play(right ? 'win' : 'wrong'), 6 * 160 + 80);
    this.query.set('');
    this.active.set(0);
    this.open.set(false);
    if (this.mode() === 'daily') this.saveDaily();
    requestAnimationFrame(() => this.host.querySelector<HTMLInputElement>('.combo input')?.focus());
  }

  async share(): Promise<void> {
    const emoji: Record<Mark, string> = { ok: '🟩', partial: '🟨', bad: '🟥' };
    const lines = [...this.rows()].reverse().map((r) => r.cells.map((c) => emoji[c.mark]).join(''));
    const title = this.mode() === 'daily' ? `Đoán nhân vật (Touhoudle) ${todayVN()}` : 'Đoán nhân vật (Touhoudle) – vô hạn';
    const text = `${title}: ${this.rows().length} lần đoán\n${lines.join('\n')}\n${location.origin}/mini-game/doan-nhan-vat`;
    try {
      await navigator.clipboard.writeText(text);
      this.flash('Đã sao chép kết quả');
    } catch {
      this.flash('Không sao chép được');
    }
  }

  /** So sánh từng trường của nhân vật đoán với đáp án. */
  private compare(g: Character, a: Character): Cell[] {
    const same = (x: string, y: string): Cell => ({ text: x, mark: x === y ? 'ok' : 'bad', arrow: '' });
    const overlap = g.species.filter((s) => a.species.includes(s)).length;
    const species: Cell = {
      text: g.species.join(', '),
      mark: overlap === g.species.length && overlap === a.species.length ? 'ok' : overlap ? 'partial' : 'bad',
      arrow: '',
    };
    const game: Cell = {
      text: gameLabel(g.game),
      mark: g.game === a.game ? 'ok' : 'bad',
      arrow: g.game === a.game ? '' : a.game > g.game ? 'up' : 'down',
    };
    const gs = stageOrder(g.role);
    const as = stageOrder(a.role);
    const role: Cell = {
      text: g.role,
      mark: g.role === a.role ? 'ok' : 'bad',
      arrow: g.role !== a.role && gs !== null && as !== null ? (as > gs ? 'up' : 'down') : '',
    };
    return [same(g.gender, a.gender), species, game, role, same(g.location, a.location), same(g.hair, a.hair)];
  }

  private loadDaily(): void {
    const date = todayVN();
    this.answer.set(CHARACTERS[dailyIndex(date)]);
    const saved = this.read();
    this.guesses.set(saved?.date === date ? saved.guesses : []);
    this.streak.set(saved?.streak ?? 0);
  }

  private saveDaily(): void {
    const date = todayVN();
    const prev = this.read();
    let streak = prev?.streak ?? 0;
    let lastWin = prev?.lastWin ?? '';
    if (this.won() && lastWin !== date) {
      const yesterday = new Date(Date.parse(date) - 86_400_000).toISOString().slice(0, 10);
      streak = lastWin === yesterday ? streak + 1 : 1;
      lastWin = date;
    }
    this.streak.set(streak);
    const data: Saved = { date, guesses: this.guesses(), won: this.won(), streak, lastWin };
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch {
      /* bỏ qua */
    }
  }

  private read(): Saved | null {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    } catch {
      return null;
    }
  }

  private flash(text: string): void {
    this.toast.set(text);
    setTimeout(() => this.toast.set(''), 1600);
  }
}

import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DEFAULT_LOCK_MSG, GAMES, GameDef, GameSetting, GameStatus, normalizeGameSettings } from '../../models/minigames';
import { SettingsService } from '../../services/settings.service';
import { AdminToastService } from '../toast.service';

const STATUS: { id: GameStatus; label: string; hint: string }[] = [
  { id: 'open', label: '🟢 Mở', hint: 'Khách chơi bình thường' },
  { id: 'locked', label: '🔒 Khoá', hint: 'Vẫn hiện thẻ (mờ) kèm lời nhắn, không vào chơi được' },
  { id: 'hidden', label: '🙈 Ẩn', hint: 'Không hiện trên trang Mini game, link trực tiếp cũng bị chặn' },
];

/** Admin → Minigame: khoá / mở / ẩn, sắp xếp thứ tự và sửa nội dung thẻ của từng mini game. */
@Component({
  selector: 'app-admin-minigames',
  imports: [FormsModule],
  template: `
    <div class="adm-head">
      <h1>Minigame</h1>
      <div class="head-actions">
        <a class="btn ghost small" href="/mini-game" target="_blank" rel="noopener">Xem trang Mini game ↗</a>
        <button class="btn ghost small" type="button" [disabled]="!dirty()" (click)="revert()">Huỷ thay đổi</button>
        <button class="btn primary small" type="button" [disabled]="!dirty() || saving()" (click)="save()">
          {{ saving() ? 'Đang lưu…' : 'Lưu thay đổi' }}
        </button>
      </div>
    </div>

    <p class="intro">
      Kéo thả (hoặc bấm ↑ ↓) để đổi thứ tự hiện trên trang Mini game. Ô nào để trống sẽ dùng nội dung mặc định.
      Đang mở <b>{{ counts().open }}</b> · khoá <b>{{ counts().locked }}</b> · ẩn <b>{{ counts().hidden }}</b>.
    </p>

    <ol class="games">
      @for (g of draft(); track g.id; let i = $index; let first = $first; let last = $last) {
        @let def = defOf(g.id);
        <li
          class="adm-box game"
          [class]="'adm-box game st-' + g.status"
          [class.drag-over]="overIndex() === i"
          draggable="true"
          (dragstart)="dragStart(i, $event)"
          (dragover)="dragOver(i, $event)"
          (dragleave)="overIndex.set(-1)"
          (drop)="drop(i, $event)"
          (dragend)="dragIndex = -1; overIndex.set(-1)"
        >
          <div class="row-head">
            <span class="grip" title="Kéo để sắp xếp" aria-hidden="true">⠿</span>
            <span class="pos">{{ i + 1 }}</span>
            <div class="name">
              <b>{{ g.title || def.title }}</b>
              <a [href]="def.path" target="_blank" rel="noopener">{{ def.path }}</a>
            </div>
            <div class="seg" role="radiogroup" [attr.aria-label]="'Trạng thái ' + def.title">
              @for (s of statuses; track s.id) {
                <button type="button" role="radio" [attr.aria-checked]="g.status === s.id" [class.on]="g.status === s.id" [title]="s.hint" (click)="set(i, 'status', s.id)">
                  {{ s.label }}
                </button>
              }
            </div>
            <div class="move">
              <button type="button" [disabled]="first" (click)="move(i, -1)" aria-label="Lên">↑</button>
              <button type="button" [disabled]="last" (click)="move(i, 1)" aria-label="Xuống">↓</button>
              <button type="button" class="toggle" (click)="toggleOpen(g.id)" [attr.aria-expanded]="openId() === g.id">
                {{ openId() === g.id ? 'Thu gọn' : '✏️ Sửa thông tin' }}
              </button>
            </div>
          </div>

          @if (openId() === g.id) {
            <div class="edit">
              <div class="fields">
                <div class="field">
                  <label [for]="'t-' + g.id">Tên game</label>
                  <input [id]="'t-' + g.id" maxlength="60" [placeholder]="def.title" [ngModel]="g.title" (ngModelChange)="set(i, 'title', $event)" />
                </div>
                <div class="field">
                  <label [for]="'g-' + g.id">Nhãn (tag)</label>
                  <input [id]="'g-' + g.id" maxlength="60" [placeholder]="def.tag" [ngModel]="g.tag" (ngModelChange)="set(i, 'tag', $event)" />
                </div>
                <div class="field">
                  <label [for]="'d-' + g.id">Mô tả ngắn</label>
                  <textarea [id]="'d-' + g.id" rows="3" maxlength="240" [placeholder]="def.desc" [ngModel]="g.desc" (ngModelChange)="set(i, 'desc', $event)"></textarea>
                  <small class="hint">{{ (g.desc || def.desc).length }}/240 ký tự</small>
                </div>
                <div class="field">
                  <label [for]="'l-' + g.id">Lời nhắn khi khoá</label>
                  <input [id]="'l-' + g.id" maxlength="120" [placeholder]="defaultLock" [ngModel]="g.lockMsg" (ngModelChange)="set(i, 'lockMsg', $event)" />
                </div>
                <button type="button" class="link" (click)="resetText(i)">↺ Dùng lại nội dung mặc định</button>
              </div>

              <!-- Xem trước thẻ trên trang Mini game -->
              <div class="preview" [class.locked]="g.status !== 'open'" aria-label="Xem trước thẻ">
                <span class="pv-art" [class]="'pv-art art-' + def.art">{{ artIcon[def.art] }}</span>
                <div class="pv-info">
                  <span class="pv-tag">{{ g.tag || def.tag }}</span>
                  <b>{{ g.title || def.title }}</b>
                  <p>{{ g.desc || def.desc }}</p>
                  @if (g.status === 'locked') { <span class="pv-lock">🔒 {{ g.lockMsg || defaultLock }}</span> }
                  <span class="pv-play">{{ g.status === 'open' ? '▶ Chơi ngay' : g.status === 'locked' ? '🔒 Tạm khoá' : '🙈 Đang ẩn' }}</span>
                </div>
              </div>
            </div>
          }
        </li>
      }
    </ol>

    <section class="adm-box extra">
      <label class="switch">
        <input type="checkbox" [ngModel]="comingSoon()" (ngModelChange)="comingSoon.set($event)" />
        <span>Hiện thẻ <b>"Game bí mật — Sắp ra mắt"</b> ở cuối danh sách</span>
      </label>
      <button class="link" type="button" (click)="resetAll()">↺ Khôi phục mặc định (mở tất cả, thứ tự gốc)</button>
    </section>
  `,
  styles: `
    .head-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .intro { color: #50575e; margin: 0 0 14px; }
    .games { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    .game { padding: 0; border-left: 4px solid #00a32a; transition: box-shadow .2s, transform .15s, opacity .2s; }
    .game.st-locked { border-left-color: #dba617; }
    .game.st-hidden { border-left-color: #8c8f94; opacity: .75; }
    .game.drag-over { box-shadow: 0 0 0 2px #2271b1; transform: translateY(2px); }
    .row-head { display: flex; align-items: center; gap: 12px; padding: 12px 14px; flex-wrap: wrap; }
    .grip { cursor: grab; color: #8c8f94; font-size: 1.2rem; user-select: none; }
    .pos { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: #f0f0f1; font-weight: 800; font-size: .85rem; }
    .name { display: flex; flex-direction: column; min-width: 180px; flex: 1; }
    .name a { font-size: .78rem; color: #646970; }
    .seg { display: inline-flex; border: 1px solid #c3c4c7; border-radius: 8px; overflow: hidden; }
    .seg button { border: 0; background: #fff; padding: 6px 12px; font: inherit; font-size: .85rem; cursor: pointer; border-right: 1px solid #c3c4c7; }
    .seg button:last-child { border-right: 0; }
    .seg button:hover { background: #f6f7f7; }
    .seg button.on { background: #2271b1; color: #fff; font-weight: 700; }
    .st-locked .seg button.on { background: #dba617; color: #1d2327; }
    .st-hidden .seg button.on { background: #646970; }
    .move { display: flex; gap: 4px; }
    .move button { border: 1px solid #c3c4c7; background: #fff; border-radius: 6px; min-width: 30px; height: 30px; cursor: pointer; font: inherit; }
    .move button:disabled { opacity: .35; cursor: default; }
    .move .toggle { padding: 0 10px; }
    .edit { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 18px; padding: 4px 16px 16px; border-top: 1px solid #f0f0f1; }
    .fields { display: grid; gap: 10px; padding-top: 12px; }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field label { font-weight: 700; font-size: .85rem; }
    .field input, .field textarea { font: inherit; padding: 7px 10px; border: 1px solid #c3c4c7; border-radius: 6px; resize: vertical; }
    .hint { color: #646970; font-size: .78rem; }
    .link { align-self: flex-start; border: 0; background: none; color: #2271b1; cursor: pointer; padding: 0; font: inherit; font-size: .88rem; text-decoration: underline; }
    .preview { margin-top: 12px; border-radius: 14px; overflow: hidden; border: 1px solid #dcdcde; background: #fff; box-shadow: 0 6px 18px rgba(0,0,0,.08); align-self: start; }
    .preview.locked { filter: grayscale(.85); opacity: .8; }
    .pv-art { display: grid; place-items: center; height: 90px; font-size: 2.6rem; background: linear-gradient(135deg, #1b2a4a, #3a1c5c); }
    .pv-art.art-jp { background: linear-gradient(#120c2e, #3b1d5c 60%, #a8467a); }
    .pv-art.art-gacha { background: linear-gradient(135deg, #ff9ec4, #ffd23f); }
    .pv-art.art-ninja { background: linear-gradient(#3b2416, #1f130c); }
    .pv-art.art-shmup { background: linear-gradient(#1a0f2e, #0b1630); }
    .pv-info { padding: 10px 14px 14px; display: flex; flex-direction: column; gap: 4px; }
    .pv-info p { margin: 0; color: #646970; font-size: .82rem; }
    .pv-tag { align-self: flex-start; font-size: .68rem; font-weight: 800; padding: 2px 8px; border-radius: 999px; background: #f0f6fc; color: #2271b1; }
    .pv-lock { color: #d63638; font-size: .78rem; font-weight: 700; }
    .pv-play { align-self: flex-start; margin-top: 4px; padding: 5px 12px; border-radius: 999px; background: #2271b1; color: #fff; font-size: .8rem; font-weight: 800; }
    .preview.locked .pv-play { background: #dcdcde; color: #50575e; }
    .extra { margin-top: 14px; padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .switch { display: flex; align-items: center; gap: 8px; cursor: pointer; }
    @media (max-width: 860px) { .edit { grid-template-columns: 1fr; } }
  `,
})
export class AdminMinigames {
  private readonly settingsSvc = inject(SettingsService);
  private readonly toast = inject(AdminToastService);

  readonly statuses = STATUS;
  readonly defaultLock = DEFAULT_LOCK_MSG;
  readonly artIcon: Record<GameDef['art'], string> = { jp: '⌨️', gacha: '🎁', dle: '🔎', ninja: '🗡️', shmup: '🚀' };

  readonly draft = signal<GameSetting[]>(normalizeGameSettings(this.settingsSvc.settings().minigames));
  readonly comingSoon = signal(this.settingsSvc.settings().minigameComingSoon ?? true);
  readonly openId = signal<string | null>(null);
  readonly overIndex = signal(-1);
  readonly saving = signal(false);
  dragIndex = -1;

  readonly counts = computed(() => {
    const c = { open: 0, locked: 0, hidden: 0 };
    for (const g of this.draft()) c[g.status]++;
    return c;
  });

  /** Có thay đổi chưa lưu? */
  readonly dirty = computed(() => {
    const s = this.settingsSvc.settings();
    return (
      JSON.stringify(this.draft()) !== JSON.stringify(normalizeGameSettings(s.minigames)) || this.comingSoon() !== (s.minigameComingSoon ?? true)
    );
  });

  defOf(id: string): GameDef {
    return GAMES.find((g) => g.id === id)!;
  }

  set<K extends keyof GameSetting>(i: number, key: K, value: GameSetting[K]): void {
    this.draft.update((list) => list.map((g, j) => (j === i ? { ...g, [key]: value } : g)));
  }

  toggleOpen(id: string): void {
    this.openId.update((cur) => (cur === id ? null : id));
  }

  move(i: number, dir: -1 | 1): void {
    this.moveTo(i, i + dir);
  }

  private moveTo(from: number, to: number): void {
    this.draft.update((list) => {
      if (to < 0 || to >= list.length || from === to) return list;
      const next = [...list];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  // ----- Kéo thả -----
  dragStart(i: number, e: DragEvent): void {
    this.dragIndex = i;
    e.dataTransfer?.setData('text/plain', String(i));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  dragOver(i: number, e: DragEvent): void {
    if (this.dragIndex < 0) return;
    e.preventDefault();
    this.overIndex.set(i);
  }

  drop(i: number, e: DragEvent): void {
    e.preventDefault();
    if (this.dragIndex >= 0) this.moveTo(this.dragIndex, i);
    this.dragIndex = -1;
    this.overIndex.set(-1);
  }

  resetText(i: number): void {
    this.draft.update((list) => list.map((g, j) => (j === i ? { ...g, title: '', tag: '', desc: '', lockMsg: '' } : g)));
  }

  resetAll(): void {
    this.draft.set(normalizeGameSettings(undefined));
    this.comingSoon.set(true);
    this.toast.ok('Đã khôi phục mặc định — bấm "Lưu thay đổi" để áp dụng');
  }

  revert(): void {
    const s = this.settingsSvc.settings();
    this.draft.set(normalizeGameSettings(s.minigames));
    this.comingSoon.set(s.minigameComingSoon ?? true);
  }

  async save(): Promise<void> {
    const clean = this.draft().map((g) => ({
      ...g,
      title: g.title.trim(),
      tag: g.tag.trim(),
      desc: g.desc.trim(),
      lockMsg: g.lockMsg.trim(),
    }));
    const next = { ...this.settingsSvc.settings(), minigames: clean, minigameComingSoon: this.comingSoon() };
    if (!this.toast.run(() => this.settingsSvc.save(next), 'Đã lưu cài đặt minigame')) return;
    this.draft.set(normalizeGameSettings(clean));
    this.saving.set(true);
    const err = await this.settingsSvc.publish(this.settingsSvc.settings());
    this.saving.set(false);
    if (err) this.toast.err('Đã lưu trên máy này nhưng chưa gửi được lên web cho khách: ' + err);
    else this.toast.ok('Đã cập nhật cho mọi khách truy cập');
  }
}

import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { EmojiPickerComponent } from '../../shared/emoji-picker';
import { CustomSeason, SEASONS, SEASON_ART, SeasonDef, SeasonId, SeasonOverride, activeSeason, isCustomSeason, seasonByDate, seasonRange, seasonsOfYear, setCustomSeasons, splitGlyphs } from '../../models/seasons';
import { SettingsService } from '../../services/settings.service';
import { AdminToastService } from '../toast.service';

const DAY = 86_400_000;

/** Admin → Chủ đề dịp lễ: bật 1 chủ đề / tự động theo lịch / tắt; xem lịch các dịp trong năm. */
@Component({
  selector: 'app-admin-seasons',
  imports: [FormsModule, NgTemplateOutlet, EmojiPickerComponent],
  template: `
    <div class="adm-head">
      <h1>Chủ đề dịp lễ</h1>
      <a class="btn ghost small" href="/" target="_blank" rel="noopener">Xem trang web ↗</a>
    </div>
    <p class="intro">
      Mỗi lần chỉ bật <b>1 chủ đề</b> (hoặc không bật cái nào). Chủ đề thêm hiệu ứng nền, dải màu dưới thanh menu và thiệp chúc mừng
      hiện ra khi khách mới vào web (khách có thể chọn "không hiện lại"; muốn xem lại thì bấm nút ở cuối trang). Giao diện tổng thể giữ nguyên.
    </p>

    <section class="adm-box now">
      <div class="now-info">
        <span class="now-lbl">Khách đang thấy</span>
        @if (current(); as c) {
          <b>{{ c.icon }} {{ c.name }}</b>
          <small>{{ setting() === 'auto' ? '🤖 Tự động theo lịch' : '✋ Bật thủ công' }}</small>
        } @else {
          <b>🚫 Không có chủ đề</b>
          <small>{{ setting() === 'auto' ? '🤖 Tự động theo lịch — hôm nay không trùng dịp nào' : 'Đang tắt' }}</small>
        }
      </div>
      <div class="modes" role="radiogroup" aria-label="Chế độ chủ đề">
        <button type="button" role="radio" [attr.aria-checked]="setting() === ''" [class.on]="setting() === ''" [disabled]="busy()" (click)="choose('')">🚫 Tắt hết</button>
        <button type="button" role="radio" [attr.aria-checked]="setting() === 'auto'" [class.on]="setting() === 'auto'" [disabled]="busy()" (click)="choose('auto')"
          title="Tự bật chủ đề của dịp đang diễn ra hôm nay, hết dịp tự tắt">🤖 Tự động theo lịch</button>
      </div>
    </section>

    <!-- Dòng thời gian cả năm -->
    <section class="adm-box">
      <div class="tl-head">
        <h2>📅 Lịch các dịp năm {{ year() }}</h2>
        <div class="yr">
          <button type="button" (click)="year.set(year() - 1)" aria-label="Năm trước">‹</button>
          <b>{{ year() }}</b>
          <button type="button" (click)="year.set(year() + 1)" aria-label="Năm sau">›</button>
        </div>
      </div>
      <div class="timeline" aria-hidden="true">
        <div class="months">
          @for (m of months; track m) { <span>T{{ m }}</span> }
        </div>
        <div class="bar">
          @for (r of rows(); track r.def.id) {
            <span class="seg" [class.on]="current()?.id === r.def.id" [style.left.%]="pos(r.start)" [style.width.%]="Math.max(0.9, pos(r.end) - pos(r.start))"
              [style.background]="r.def.colors[0]" [title]="r.def.name + ': ' + range(r)">{{ r.def.icon }}</span>
          }
          @if (todayPos() !== null) { <span class="today" [style.left.%]="todayPos()"><i>Hôm nay</i></span> }
        </div>
      </div>
    </section>

    <div class="add-row">
      <button type="button" class="btn primary small" (click)="startNew()" [disabled]="editing() === 'new'">➕ Thêm dịp lễ</button>
      <small class="hint">Ví dụ: sinh nhật shop, Black Friday, Quốc khánh 2/9, ngày Nhà giáo 20/11…</small>
    </div>
    @if (editing() === 'new' && draft(); as d) {
      <section class="adm-box new-box">
        <h2>➕ Dịp lễ mới</h2>
        <ng-container *ngTemplateOutlet="editorTpl; context: { $implicit: d, id: 'new' }" />
      </section>
    }

    <ol class="list">
      @for (r of rows(); track r.def.id) {
        @let st = status(r);
        <li class="adm-box item" [class.active]="current()?.id === r.def.id" [style.--c1]="r.def.colors[0]" [style.--c2]="r.def.colors[1]">
          <span class="ico" aria-hidden="true">
            @if (r.def.art) { <img [src]="art[r.def.art]" alt="" /> } @else { {{ r.def.icon }} }
          </span>
          <div class="info">
            <b>{{ r.def.name }}
              @if (custom(r.def.id)) { <span class="edited mine">⭐ Tự thêm</span> } @else if (edited(r.def.id)) { <span class="edited">✏️ Đã sửa</span> }</b>
            <span class="date">📅 {{ range(r) }}</span>
            <small class="when">{{ custom(r.def.id) ? '' : 'Mặc định: ' }}{{ r.def.when }} · hiệu ứng: {{ r.def.fx.glyphs.filter(g => !g.startsWith('img:')).join(' ') || r.def.icon }}</small>
          </div>
          <span class="st" [class]="'st ' + st.cls">{{ st.label }}</span>
          <label class="switch" [title]="setting() === r.def.id ? 'Bấm để tắt' : 'Bật chủ đề này (tắt chủ đề khác)'">
            <input type="checkbox" [checked]="setting() === r.def.id" [disabled]="busy()" (change)="toggle(r.def, $any($event.target).checked)" />
            <span class="track"></span>
            <span class="sw-txt">{{ setting() === r.def.id ? 'Đang bật' : 'Bật' }}</span>
          </label>
          <button type="button" class="pv-btn" (click)="preview.set(preview() === r.def.id ? null : r.def.id)">{{ preview() === r.def.id ? 'Ẩn thiệp' : '👁 Xem thiệp' }}</button>
          <button type="button" class="pv-btn edit-btn" (click)="startEdit(r.def.id)" [disabled]="editing() === r.def.id">✏️ Sửa</button>
          @if (editing() === r.def.id && draft(); as d) {
            <ng-container *ngTemplateOutlet="editorTpl; context: { $implicit: d, id: r.def.id }" />
          }
          @if (preview() === r.def.id) {
            <div class="pv">
              <div class="pv-card">
                <div class="pv-art">@if (r.def.art) { <img [src]="art[r.def.art]" alt="" /> } @else { {{ r.def.icon }} }</div>
                <b>{{ r.def.title }}</b>
                <p>{{ r.def.message }}</p>
              </div>
            </div>
          }
        </li>
      }
    </ol>

    <ng-template #editorTpl let-d let-id="id">
            <form class="editor" (ngSubmit)="saveEdit()" novalidate>
              <div class="grid">
                <div class="field">
                  <label class="req" for="se-name">Tên dịp</label>
                  <input id="se-name" name="name" maxlength="80" [(ngModel)]="d.name" [class.invalid]="tried() && !d.name.trim()" />
                </div>
                <div class="field small">
                  <label class="req" for="se-icon">Icon</label>
                  <div class="with-pick">
                    <input id="se-icon" name="icon" maxlength="8" [(ngModel)]="d.icon" [class.invalid]="tried() && !d.icon.trim()" />
                    <app-emoji-picker label="" (pick)="d.icon = $event" />
                  </div>
                </div>
                <div class="field">
                  <label class="req" for="se-start">Bắt đầu ({{ year() }})</label>
                  <input id="se-start" name="start" type="date" [(ngModel)]="d.start" [class.invalid]="tried() && badDates()" />
                </div>
                <div class="field">
                  <label class="req" for="se-end">Kết thúc ({{ year() }})</label>
                  <input id="se-end" name="end" type="date" [(ngModel)]="d.end" [class.invalid]="tried() && badDates()" />
                </div>
              </div>
              @if (tried() && badDates()) { <p class="field-err">Ngày kết thúc phải sau hoặc bằng ngày bắt đầu, và cùng năm {{ year() }}.</p> }
              <small class="hint">
                @if (custom(id)) { Dịp tự thêm: ngày / tháng này lặp lại mỗi năm. }
                @else { Ngày chỉ áp dụng cho năm {{ year() }} (Tết, Trung thu đổi ngày mỗi năm); các năm khác dùng ngày mặc định. }
              </small>
              <div class="field">
                <label class="req" for="se-title">Tiêu đề thiệp chúc</label>
                <input id="se-title" name="title" maxlength="80" [(ngModel)]="d.title" [class.invalid]="tried() && !d.title.trim()" />
              </div>
              <div class="field">
                <label class="req" for="se-msg">Lời chúc</label>
                <textarea id="se-msg" name="message" rows="3" maxlength="300" [(ngModel)]="d.message" [class.invalid]="tried() && !d.message.trim()"></textarea>
                <small class="hint">{{ d.message.length }}/300 ký tự</small>
              </div>
              <div class="grid">
                <div class="field">
                  <label for="se-c1">Màu chính</label>
                  <div class="color"><input id="se-c1" name="c1" type="color" [(ngModel)]="d.c1" /><code>{{ d.c1 }}</code></div>
                </div>
                <div class="field">
                  <label for="se-c2">Màu phụ</label>
                  <div class="color"><input id="se-c2" name="c2" type="color" [(ngModel)]="d.c2" /><code>{{ d.c2 }}</code></div>
                </div>
              </div>
              <div class="field">
                <label for="se-fx">Hiệu ứng nền (emoji, tối đa 12)</label>
                <div class="with-pick">
                  <input id="se-fx" name="fx" [(ngModel)]="d.glyphs" placeholder="🌸 🌼 🧧" />
                  <app-emoji-picker label="Thêm icon" [multi]="true" (pick)="d.glyphs = (d.glyphs + ' ' + $event).trim()" />
                  <button type="button" class="pv-btn" (click)="d.glyphs = ''" title="Xoá hết">✕</button>
                </div>
                <small class="hint">Xem trước: <span class="glyphs">{{ glyphPreview() }}</span></small>
              </div>
              @if (custom(id)) {
                <div class="field">
                  <label for="se-dir">Kiểu hiệu ứng</label>
                  <select id="se-dir" name="dir" [(ngModel)]="d.dir">
                    <option value="fall">⬇ Rơi xuống (như hoa, tuyết)</option>
                    <option value="rise">⬆ Bay lên (như tim, lồng đèn)</option>
                    <option value="float">↔ Trôi lơ lửng</option>
                  </select>
                </div>
              }
              @if (artOf(id); as a) {
                <label class="chk">
                  <input type="checkbox" name="useArt" [(ngModel)]="d.useArt" />
                  Dùng hình đặc biệt <img [src]="art[a]" alt="" /> trên thiệp và hiệu ứng nền
                </label>
              }
              <div class="actions">
                <button class="btn primary small" type="submit" [disabled]="busy()">💾 Lưu</button>
                <button class="btn ghost small" type="button" (click)="cancelEdit()">Huỷ</button>
                @if (custom(id)) {
                  @if (id !== 'new') { <button class="link" type="button" (click)="removeCustom(id)" [disabled]="busy()">🗑 Xoá dịp này</button> }
                } @else if (edited(id)) {
                  <button class="link" type="button" (click)="resetEdit()" [disabled]="busy()">↺ Khôi phục mặc định</button>
                }
              </div>
            </form>
    </ng-template>
  `,
  styles: `
    .intro { color: #50575e; margin: 0 0 14px; max-width: 860px; }
    .now { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; padding: 14px 18px; margin-bottom: 14px; }
    .now-info { display: flex; flex-direction: column; gap: 2px; }
    .now-lbl { font-size: .75rem; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; color: #646970; }
    .now-info b { font-size: 1.15rem; }
    .now-info small { color: #646970; }
    .modes { display: inline-flex; border: 1px solid #c3c4c7; border-radius: 10px; overflow: hidden; }
    .modes button { border: 0; border-right: 1px solid #c3c4c7; background: #fff; padding: 8px 14px; font: inherit; font-size: .88rem; cursor: pointer; }
    .modes button:last-child { border-right: 0; }
    .modes button.on { background: #2271b1; color: #fff; font-weight: 700; }
    .tl-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 12px 16px 0; flex-wrap: wrap; }
    .tl-head h2 { margin: 0; font-size: 1rem; }
    .yr { display: inline-flex; align-items: center; gap: 8px; }
    .yr button { width: 30px; height: 30px; border-radius: 8px; border: 1px solid #c3c4c7; background: #fff; cursor: pointer; font-size: 1.1rem; }
    .timeline { padding: 12px 16px 26px; }
    .months { display: grid; grid-template-columns: repeat(12, 1fr); font-size: .72rem; color: #646970; font-weight: 700; margin-bottom: 4px; }
    .months span { border-left: 1px solid #dcdcde; padding-left: 4px; }
    .bar { position: relative; height: 34px; border-radius: 8px; background: repeating-linear-gradient(90deg, #f6f7f7 0 calc(100% / 12 - 1px), #dcdcde calc(100% / 12 - 1px) calc(100% / 12)); }
    .seg { position: absolute; top: 4px; height: 26px; min-width: 22px; border-radius: 6px; display: grid; place-items: center; font-size: .85rem; opacity: .75;
      box-shadow: 0 1px 3px rgba(0,0,0,.2); overflow: hidden; }
    .seg.on { opacity: 1; outline: 3px solid #1d2327; z-index: 1; }
    .today { position: absolute; top: -6px; bottom: -6px; width: 2px; background: #d63638; z-index: 2; }
    .today i { position: absolute; top: 100%; left: 50%; transform: translateX(-50%); font-size: .68rem; font-style: normal; font-weight: 800; color: #d63638; white-space: nowrap; }
    .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    .item { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 12px 16px; border-left: 5px solid var(--c1); }
    .item.active { box-shadow: 0 0 0 2px var(--c1), 0 8px 24px color-mix(in srgb, var(--c1) 25%, transparent);
      background: linear-gradient(90deg, color-mix(in srgb, var(--c2) 18%, #fff), #fff 60%); }
    .ico { width: 48px; height: 48px; flex: none; display: grid; place-items: center; font-size: 1.8rem; border-radius: 12px;
      background: color-mix(in srgb, var(--c2) 30%, #fff); }
    .ico img { width: 38px; height: 38px; object-fit: contain; }
    .info { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 2px; }
    .date { font-weight: 700; color: #1d2327; font-size: .9rem; }
    .when { color: #646970; font-size: .78rem; }
    .st { font-size: .75rem; font-weight: 800; padding: 3px 10px; border-radius: 999px; white-space: nowrap; }
    .st.live { background: #edfaef; color: #1f6f37; border: 1px solid #68de7c; }
    .st.soon { background: #f0f6fc; color: #2271b1; border: 1px solid #72aee6; }
    .st.past { background: #f0f0f1; color: #646970; }
    .switch { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 700; font-size: .85rem; }
    .switch input { position: absolute; opacity: 0; width: 1px; height: 1px; }
    .track { width: 42px; height: 24px; border-radius: 999px; background: #c3c4c7; position: relative; transition: background .2s; }
    .track::after { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform .2s; box-shadow: 0 1px 3px rgba(0,0,0,.3); }
    .switch input:checked + .track { background: var(--c1); }
    .switch input:checked + .track::after { transform: translateX(18px); }
    .switch input:focus-visible + .track { outline: 2px solid #2271b1; outline-offset: 2px; }
    .switch input:disabled + .track { opacity: .6; }
    .sw-txt { min-width: 62px; }
    .pv-btn { border: 1px solid #c3c4c7; background: #fff; border-radius: 8px; padding: 5px 10px; font: inherit; font-size: .82rem; cursor: pointer; }
    .add-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 0 0 12px; }
    .add-row .hint { color: #646970; }
    .new-box { padding: 12px 16px; margin-bottom: 12px; border-left: 5px solid #2271b1; }
    .new-box h2 { margin: 0 0 8px; font-size: 1rem; }
    .with-pick { display: flex; gap: 6px; align-items: center; }
    .with-pick input { flex: 1; min-width: 0; }
    .editor select { font: inherit; padding: 7px 10px; border: 1px solid #c3c4c7; border-radius: 6px; background: #fff; }
    .edited.mine { background: #f0f6fc; color: #2271b1; }
    .edited { display: inline-block; margin-left: 6px; font-size: .7rem; font-weight: 800; padding: 2px 8px; border-radius: 999px; background: #fcf9e8; color: #8a6d00; vertical-align: middle; }
    .edit-btn { border-color: #2271b1; color: #2271b1; font-weight: 700; }
    .edit-btn:disabled { opacity: .5; }
    .editor { flex-basis: 100%; display: grid; gap: 10px; padding: 14px; margin-top: 4px; border-radius: 12px; background: #f6f7f7; border: 1px dashed #c3c4c7; }
    .editor .grid { display: grid; grid-template-columns: 2fr 80px 1fr 1fr; gap: 10px; }
    .editor .field { display: flex; flex-direction: column; gap: 4px; }
    .editor label { font-weight: 700; font-size: .85rem; }
    .editor input:not([type=checkbox]):not([type=color]), .editor textarea { font: inherit; padding: 7px 10px; border: 1px solid #c3c4c7; border-radius: 6px; background: #fff; }
    .editor .hint { color: #646970; font-size: .78rem; }
    .color { display: flex; align-items: center; gap: 8px; }
    .color input { width: 44px; height: 34px; padding: 0; border: 1px solid #c3c4c7; border-radius: 6px; cursor: pointer; }
    .glyphs { font-size: 1.1rem; letter-spacing: .15em; }
    .chk { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: .88rem; cursor: pointer; }
    .chk img { width: 28px; height: 28px; object-fit: contain; }
    .actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .link { border: 0; background: none; color: #b32d2e; cursor: pointer; font: inherit; font-size: .88rem; text-decoration: underline; }
    @media (max-width: 700px) { .editor .grid { grid-template-columns: 1fr 1fr; } }
    .pv { flex-basis: 100%; display: flex; justify-content: center; padding: 6px 0 4px; }
    .pv-card { width: min(380px, 100%); text-align: center; padding: 18px; border-radius: 18px; border: 2px solid var(--c1);
      background: radial-gradient(circle at 50% 0, color-mix(in srgb, var(--c2) 35%, #fff), #fff 65%); }
    .pv-art { font-size: 3rem; line-height: 1.1; }
    .pv-art img { width: 70px; height: 70px; object-fit: contain; }
    .pv-card b { display: block; margin: 6px 0; color: var(--c1); font-size: 1.1rem; }
    .pv-card p { margin: 0; color: #50575e; font-size: .88rem; }
    @media (max-width: 600px) {
      .item { gap: 10px; }
      .info { min-width: calc(100% - 70px); }
      .modes { width: 100%; } .modes button { flex: 1; }
      .months span { font-size: .6rem; padding-left: 1px; }
    }
  `,
})
export class AdminSeasons {
  private readonly settingsSvc = inject(SettingsService);
  private readonly toast = inject(AdminToastService);
  protected readonly Math = Math;
  readonly art = SEASON_ART;
  readonly months = Array.from({ length: 12 }, (_, i) => i + 1);

  readonly year = signal(new Date().getFullYear());
  readonly busy = signal(false);
  readonly preview = signal<string | null>(null);
  readonly setting = computed(() => this.settingsSvc.settings().seasonTheme ?? '');
  readonly overrides = computed(() => (this.settingsSvc.settings().seasonOverrides ?? {}) as Record<string, SeasonOverride>);
  readonly customList = computed(() => this.settingsSvc.settings().customSeasons ?? []);
  readonly current = computed(() => {
    setCustomSeasons(this.customList());
    return activeSeason(this.setting(), Date.now(), this.overrides());
  });
  readonly rows = computed(() => {
    setCustomSeasons(this.customList());
    return seasonsOfYear(this.year(), this.overrides());
  });

  custom(id: string): boolean {
    return id === 'new' || isCustomSeason(id);
  }

  /** Mở form tạo dịp lễ mới. */
  startNew(): void {
    const y = this.year();
    const t = new Date();
    const day = (d: Date) => `${y}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    this.draft.set({
      name: '', icon: '🎉', title: '', message: '', c1: '#60b5ff', c2: '#ffd23f', glyphs: '🎉 ✨ 🎈', useArt: false, dir: 'fall',
      start: day(t), end: day(new Date(t.getTime() + 3 * 86_400_000)),
    });
    this.tried.set(false);
    this.preview.set(null);
    this.editing.set('new');
  }

  async removeCustom(id: string): Promise<void> {
    const c = this.customList().find((x) => x.id === id);
    if (!c || !confirm(`Xoá dịp "${c.name}"?`)) return;
    const next = { ...this.settingsSvc.settings(), customSeasons: this.customList().filter((x) => x.id !== id) };
    if (this.setting() === id) next.seasonTheme = '';
    const ov = { ...this.overrides() } as Record<string, SeasonOverride>;
    delete ov[id];
    next.seasonOverrides = ov;
    await this.publish(next, `🗑 Đã xoá dịp ${c.name}`);
    this.cancelEdit();
  }

  /** Lưu dịp tự thêm (mới hoặc sửa). Ngày lưu dạng MM-DD, lặp lại mỗi năm. */
  private async saveCustom(id: string, d: NonNullable<ReturnType<typeof this.draft>>): Promise<void> {
    const entry: CustomSeason = {
      id: id === 'new' ? (`c-${crypto.randomUUID().slice(0, 8)}` as CustomSeason['id']) : (id as CustomSeason['id']),
      name: d.name.trim(),
      icon: d.icon.trim(),
      title: d.title.trim(),
      message: d.message.trim(),
      colors: [d.c1, d.c2],
      glyphs: splitGlyphs(d.glyphs),
      dir: d.dir,
      start: d.start.slice(5),
      end: d.end.slice(5),
    };
    const list = this.customList();
    const nextList = id === 'new' ? [...list, entry] : list.map((x) => (x.id === id ? entry : x));
    await this.publish({ ...this.settingsSvc.settings(), customSeasons: nextList }, id === 'new' ? `➕ Đã thêm dịp ${entry.name}` : `✏️ Đã lưu dịp ${entry.name}`);
    this.cancelEdit();
  }

  // ---------- Sửa chủ đề ----------
  readonly editing = signal<SeasonId | 'new' | null>(null);
  readonly draft = signal<{ name: string; icon: string; title: string; message: string; c1: string; c2: string; glyphs: string; useArt: boolean; dir: 'fall' | 'rise' | 'float'; start: string; end: string } | null>(null);
  readonly tried = signal(false);

  edited(id: SeasonId | 'new'): boolean {
    if (id === 'new') return false;
    const o = this.overrides()[id];
    return !!o && Object.keys(o).length > 0;
  }

  artOf(id: SeasonId | 'new'): string | undefined {
    return SEASONS.find((s) => s.id === id)?.art;
  }

  startEdit(id: SeasonId): void {
    const row = this.rows().find((r) => r.def.id === id)!;
    const def = row.def;
    const day = (t: number) => {
      const d = new Date(t);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    this.draft.set({
      name: def.name,
      icon: def.icon,
      title: def.title,
      message: def.message,
      c1: def.colors[0],
      c2: def.colors[1],
      glyphs: def.fx.glyphs.filter((g) => !g.startsWith('img:')).join(' '),
      useArt: this.overrides()[id]?.useArt ?? true,
      dir: def.fx.dir,
      start: day(row.start),
      end: day(row.end),
    });
    this.tried.set(false);
    this.preview.set(null);
    this.editing.set(id);
  }

  cancelEdit(): void {
    this.editing.set(null);
    this.draft.set(null);
  }

  glyphPreview(): string {
    return splitGlyphs(this.draft()?.glyphs ?? '').join(' ') || '(dùng mặc định)';
  }

  badDates(): boolean {
    const d = this.draft();
    if (!d) return false;
    const y = String(this.year());
    return !d.start || !d.end || d.end < d.start || !d.start.startsWith(y) || !d.end.startsWith(y);
  }

  async saveEdit(): Promise<void> {
    const id = this.editing();
    const d = this.draft();
    if (!id || !d) return;
    this.tried.set(true);
    if (!d.name.trim() || !d.icon.trim() || !d.title.trim() || !d.message.trim() || this.badDates()) {
      this.toast.err('Vui lòng điền đủ các ô đánh dấu * (viền đỏ).');
      return;
    }
    if (this.custom(id)) return this.saveCustom(id, d);
    const base = SEASONS.find((s) => s.id === id)!;
    if (!base) return;
    const prev = this.overrides()[id] ?? {};
    const o: SeasonOverride = {};
    // Chỉ lưu những gì khác mặc định.
    if (d.name.trim() !== base.name) o.name = d.name.trim();
    if (d.icon.trim() !== base.icon) o.icon = d.icon.trim();
    if (d.title.trim() !== base.title) o.title = d.title.trim();
    if (d.message.trim() !== base.message) o.message = d.message.trim();
    if (d.c1 !== base.colors[0] || d.c2 !== base.colors[1]) o.colors = [d.c1, d.c2];
    const glyphs = splitGlyphs(d.glyphs);
    const baseGlyphs = base.fx.glyphs.filter((g) => !g.startsWith('img:'));
    if (glyphs.length && glyphs.join(' ') !== baseGlyphs.join(' ')) o.glyphs = glyphs;
    if (base.art && !d.useArt) o.useArt = false;
    // Ngày: lưu riêng cho năm đang xem nếu khác mặc định; giữ ngày đã sửa của các năm khác.
    const dates = { ...(prev.dates ?? {}) };
    const y = String(this.year());
    const def = seasonRange(id as SeasonId, this.year());
    const sameAsDefault = d.start === this.dayOf(def.start) && d.end === this.dayOf(def.end);
    if (sameAsDefault) delete dates[y];
    else dates[y] = { start: d.start, end: d.end };
    if (Object.keys(dates).length) o.dates = dates;
    await this.saveOverrides({ ...this.overrides(), [id]: o }, `✏️ Đã lưu chủ đề ${d.name.trim()}`);
    this.cancelEdit();
  }

  async resetEdit(): Promise<void> {
    const id = this.editing();
    if (!id || !confirm('Khôi phục nội dung, màu, hiệu ứng và ngày mặc định của chủ đề này?')) return;
    const next = { ...this.overrides() };
    delete next[id];
    await this.saveOverrides(next, '↺ Đã khôi phục chủ đề về mặc định');
    this.cancelEdit();
  }

  private dayOf(t: number): string {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private async saveOverrides(ov: Record<string, SeasonOverride>, msg: string): Promise<void> {
    // Bỏ các mục rỗng.
    const clean = Object.fromEntries(Object.entries(ov).filter(([, v]) => v && Object.keys(v).length));
    await this.publish({ ...this.settingsSvc.settings(), seasonOverrides: clean }, msg);
  }

  private async publish(next: ReturnType<SettingsService['settings']>, msg: string): Promise<void> {
    if (!this.toast.run(() => this.settingsSvc.save(next), msg)) return;
    this.busy.set(true);
    const err = await this.settingsSvc.publish(this.settingsSvc.settings());
    this.busy.set(false);
    if (err) this.toast.err('Đã lưu trên máy này nhưng chưa gửi được lên web cho khách: ' + err);
    else this.toast.ok('Đã cập nhật cho mọi khách truy cập');
  }
  readonly todayPos = computed(() => (this.year() === new Date().getFullYear() ? this.pos(Date.now()) : null));

  pos(t: number): number {
    const y = this.year();
    const a = new Date(y, 0, 1).getTime();
    const b = new Date(y + 1, 0, 1).getTime();
    return Math.max(0, Math.min(100, ((t - a) / (b - a)) * 100));
  }

  range(r: { start: number; end: number; main: number }): string {
    const f = (t: number) => new Date(t).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const one = r.end - r.start < DAY;
    return one ? f(r.start) : `${f(r.start)} → ${f(r.end)}`;
  }

  status(r: { start: number; end: number }): { label: string; cls: string } {
    const now = Date.now();
    if (now >= r.start && now <= r.end) return { label: '🟢 Đang diễn ra', cls: 'live' };
    if (now < r.start) {
      const d = Math.ceil((r.start - now) / DAY);
      return { label: `⏳ Còn ${d} ngày`, cls: 'soon' };
    }
    return { label: 'Đã qua', cls: 'past' };
  }

  toggle(def: SeasonDef, on: boolean): void {
    void this.choose(on ? def.id : '');
  }

  async choose(value: string): Promise<void> {
    const before = this.current();
    if (value === this.setting()) return;
    const next = { ...this.settingsSvc.settings(), seasonTheme: value, seasonChangedAt: Date.now() };
    const after = activeSeason(value, Date.now(), this.overrides());
    const msg = !value
      ? `🚫 Đã tắt chủ đề${before ? ' ' + before.name : ''}`
      : value === 'auto'
        ? `🤖 Đã bật tự động theo lịch${seasonByDate(Date.now(), this.overrides()) ? ' — hôm nay: ' + seasonByDate(Date.now(), this.overrides())!.name : ' — hôm nay không có dịp nào'}`
        : `${after!.icon} Đã bật chủ đề ${after!.name}${before && before.id !== after!.id ? ' (tắt ' + before.name + ')' : ''}`;
    if (!this.toast.run(() => this.settingsSvc.save(next), msg)) return;
    this.busy.set(true);
    const err = await this.settingsSvc.publish(this.settingsSvc.settings());
    this.busy.set(false);
    if (err) this.toast.err('Đã lưu trên máy này nhưng chưa gửi được lên web cho khách: ' + err);
    else this.toast.ok('Đã cập nhật chủ đề cho mọi khách truy cập');
  }
}

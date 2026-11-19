import { Component, computed, inject, signal } from '@angular/core';
import { SEASON_ART, SeasonDef, activeSeason, seasonByDate, seasonsOfYear } from '../../models/seasons';
import { SettingsService } from '../../services/settings.service';
import { AdminToastService } from '../toast.service';

const DAY = 86_400_000;

/** Admin → Chủ đề dịp lễ: bật 1 chủ đề / tự động theo lịch / tắt; xem lịch các dịp trong năm. */
@Component({
  selector: 'app-admin-seasons',
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

    <ol class="list">
      @for (r of rows(); track r.def.id) {
        @let st = status(r);
        <li class="adm-box item" [class.active]="current()?.id === r.def.id" [style.--c1]="r.def.colors[0]" [style.--c2]="r.def.colors[1]">
          <span class="ico" aria-hidden="true">
            @if (r.def.art) { <img [src]="art[r.def.art]" alt="" /> } @else { {{ r.def.icon }} }
          </span>
          <div class="info">
            <b>{{ r.def.name }}</b>
            <span class="date">📅 {{ range(r) }}</span>
            <small class="when">{{ r.def.when }} · hiệu ứng: {{ r.def.fx.glyphs.filter(g => !g.startsWith('img:')).join(' ') || r.def.icon }}</small>
          </div>
          <span class="st" [class]="'st ' + st.cls">{{ st.label }}</span>
          <label class="switch" [title]="setting() === r.def.id ? 'Bấm để tắt' : 'Bật chủ đề này (tắt chủ đề khác)'">
            <input type="checkbox" [checked]="setting() === r.def.id" [disabled]="busy()" (change)="toggle(r.def, $any($event.target).checked)" />
            <span class="track"></span>
            <span class="sw-txt">{{ setting() === r.def.id ? 'Đang bật' : 'Bật' }}</span>
          </label>
          <button type="button" class="pv-btn" (click)="preview.set(preview() === r.def.id ? null : r.def.id)">{{ preview() === r.def.id ? 'Ẩn thiệp' : '👁 Xem thiệp' }}</button>
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
  readonly current = computed(() => activeSeason(this.setting()));
  readonly rows = computed(() => seasonsOfYear(this.year()));
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
    const after = activeSeason(value);
    const msg = !value
      ? `🚫 Đã tắt chủ đề${before ? ' ' + before.name : ''}`
      : value === 'auto'
        ? `🤖 Đã bật tự động theo lịch${seasonByDate() ? ' — hôm nay: ' + seasonByDate()!.name : ' — hôm nay không có dịp nào'}`
        : `${after!.icon} Đã bật chủ đề ${after!.name}${before && before.id !== after!.id ? ' (tắt ' + before.name + ')' : ''}`;
    if (!this.toast.run(() => this.settingsSvc.save(next), msg)) return;
    this.busy.set(true);
    const err = await this.settingsSvc.publish(this.settingsSvc.settings());
    this.busy.set(false);
    if (err) this.toast.err('Đã lưu trên máy này nhưng chưa gửi được lên web cho khách: ' + err);
    else this.toast.ok('Đã cập nhật chủ đề cho mọi khách truy cập');
  }
}

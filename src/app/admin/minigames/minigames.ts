import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ALWAYS_FREE_ID, DEFAULT_LOCK_MSG, GAMES, GameDef, GameSetting, GameStatus, dailyFreeIds, dailyPool, normalizeGameSettings, resolveGames, rollFor, vnToday } from '../../models/minigames';
import { OrderApiService } from '../../services/order-api.service';
import { GAME_PARAMS } from '../../models/game-params';
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

    <!-- Code mở khoá trong ngày + giới hạn số trò miễn phí -->
    <section class="adm-box daily">
      <h2>🎟 Giới hạn trò chơi mỗi ngày &amp; code mở khoá</h2>
      <div class="box-body daily-body">
        <div class="field">
          <label for="daily-free">Số trò được chơi miễn phí mỗi ngày</label>
          <div class="daily-row">
            <input id="daily-free" type="number" min="0" [max]="poolCount()" [ngModel]="dailyFree()" (ngModelChange)="dailyFree.set(+$event || 0)" />
            <span>/ {{ poolCount() }} trò random · <b>0 = mở tất cả</b> (không cần code)</span>
          </div>
          <small class="hint">
            <b>🎁 Túi mù may mắn luôn mở</b> (không tính vào số này). Các trò còn lại random mỗi ngày (giờ Việt Nam);
            trò được tick <b>"Luôn miễn phí"</b> ở dưới luôn có mặt. Khách có <b>code hôm nay</b> thì mở được tất cả trò đến 23:59, qua ngày mới tự khoá lại.
          </small>
          @if (limited()) {
            <div class="today-free">
              <span>Hôm nay ({{ today }}) mở miễn phí: <b>{{ todayFree().join(' · ') }}</b></span>
              <button class="btn ghost small" type="button" (click)="reroll()" [disabled]="saving()" title="Không ưng? Random bộ trò khác cho hôm nay (lưu & áp dụng ngay)">
                🎲 Random lại
              </button>
            </div>
          }
        </div>

        <div class="code-card">
          <span class="code-lbl">Code hôm nay</span>
          @if (code(); as c) {
            <strong class="code">{{ c.code }}</strong>
            <small>Hết hạn lúc 23:59 ngày {{ c.day }} · ngày mai tự đổi code mới</small>
            <div class="code-actions">
              <button class="btn primary small" type="button" (click)="copyCode()">📋 Sao chép</button>
              <button class="btn ghost small" type="button" (click)="newCode()" [disabled]="codeBusy()">🔄 Tạo code mới</button>
            </div>
          } @else {
            <small class="code-err">{{ codeError() || 'Đang tải code…' }}</small>
            @if (codeError()) { <button class="btn ghost small" type="button" (click)="loadCode()">Thử lại</button> }
          }
        </div>
      </div>
    </section>

    <p class="intro">
      Kéo thả (hoặc bấm ↑ ↓) để đổi thứ tự hiện trên trang Mini game. Ô nào để trống sẽ dùng nội dung mặc định.
      Đang mở <b>{{ counts().open }}</b> · khoá <b>{{ counts().locked }}</b> · ẩn <b>{{ counts().hidden }}</b>.
    </p>

    <ol class="games">
      @for (g of draft(); track g.id; let i = $index; let first = $first; let last = $last) {
        @let def = defOf(g.id);
        <li
          class="adm-box game"
          [class]="'adm-box game st-' + g.status + (todayState(g)?.cls === 'need' ? ' today-code' : '')"
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
            @if (g.id === alwaysId) {
              <label class="free-chk" title="Túi mù may mắn luôn mở miễn phí mỗi ngày">
                <input type="checkbox" checked disabled /> Luôn miễn phí
              </label>
            } @else {
              <label class="free-chk" title="Trò này luôn được chơi miễn phí mỗi ngày (không cần code)">
                <input type="checkbox" [ngModel]="!!g.free" (ngModelChange)="set(i, 'free', $event)" /> Luôn miễn phí
              </label>
            }
            @if (todayState(g); as st) {
              <span [class]="'today-chip ' + st.cls" [title]="st.hint">{{ st.label }}</span>
            }
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
                <div class="notice-box">
                  <b>🔔 Thông báo cho khách</b>
                  <div class="field">
                    <label [for]="'r-' + g.id">Ngày ra mắt</label>
                    <input [id]="'r-' + g.id" type="date" [ngModel]="g.releasedAt || def.releasedAt" (ngModelChange)="set(i, 'releasedAt', $event || '')" />
                    <small class="hint">Khách thấy thông báo "Minigame mới" trong {{ notifyDays }} ngày kể từ ngày này (game phải đang mở). Để trống = không thông báo.</small>
                  </div>
                  <div class="field">
                    <label [for]="'n-' + g.id">Nội dung thông báo</label>
                    <textarea [id]="'n-' + g.id" rows="2" maxlength="200" [placeholder]="g.desc || def.desc" [ngModel]="g.notice" (ngModelChange)="set(i, 'notice', $event)"></textarea>
                    <small class="hint">Để trống = dùng mô tả ngắn.</small>
                  </div>
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

            @if (paramDefs[g.id] || lbGames.includes(g.id)) {
              <div class="extra-grid">
                <!-- Thông số riêng của game -->
                @if (paramDefs[g.id]; as defs) {
                  <div class="xbox">
                    <b class="xtitle">⚙️ Thông số trò chơi</b>
                    @for (d of defs; track d.key) {
                      <div class="param">
                        <label [for]="'p-' + g.id + d.key">{{ d.label }}</label>
                        <div class="p-row">
                          <input type="range" [min]="d.min" [max]="d.max" [step]="d.step" [value]="paramVal(g.id, d.key, d.def)"
                            (input)="setParam(g.id, d.key, +$any($event.target).value)" [attr.aria-label]="d.label" />
                          <input class="p-num" [id]="'p-' + g.id + d.key" type="number" [min]="d.min" [max]="d.max" [step]="d.step"
                            [value]="paramVal(g.id, d.key, d.def)" (change)="setParam(g.id, d.key, +$any($event.target).value)" />
                          <span class="unit">{{ d.unit }}</span>
                        </div>
                        <small class="hint">Mặc định {{ d.def }}{{ d.unit ? ' ' + d.unit : '' }}{{ d.hint ? ' · ' + d.hint : '' }}</small>
                      </div>
                    }
                    <button type="button" class="link" (click)="resetParams(g.id)">↺ Về thông số mặc định</button>
                    <small class="hint">Bấm <b>Lưu thay đổi</b> ở đầu trang để áp dụng cho khách (ván mới).</small>
                  </div>
                }
                <!-- Bảng xếp hạng: xoá dòng / xoá cả bảng -->
                @if (lbGames.includes(g.id)) {
                  <div class="xbox">
                    <b class="xtitle">🏆 Bảng xếp hạng top 5
                      <button type="button" class="mini-btn" (click)="loadLb(g.id)" title="Tải lại">↻</button>
                    </b>
                    @if (lb()[g.id]; as rows) {
                      @if (!rows.length) {
                        <p class="hint">Chưa có ai trên bảng.</p>
                      } @else {
                        <ol class="lb">
                          @for (e of rows; track e.at; let k = $index) {
                            <li>
                              <span class="rk">{{ k + 1 }}</span>
                              <span class="nm" [title]="e.name">{{ e.name }}</span>
                              <b>{{ e.score.toLocaleString('vi-VN') }}</b>
                              <button type="button" class="del-x" (click)="removeLb(g.id, e)" [disabled]="lbBusy()" title="Xoá dòng này">🗑</button>
                            </li>
                          }
                        </ol>
                        <button type="button" class="link danger" (click)="clearLb(g.id)" [disabled]="lbBusy()">🗑 Xoá toàn bộ bảng xếp hạng</button>
                      }
                    } @else {
                      <p class="hint">{{ lbErr()[g.id] || 'Đang tải…' }}</p>
                    }
                  </div>
                }
              </div>
            }
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
    .pv-art.art-merge { background: linear-gradient(135deg, #ffd6e7, #ff9ec4); }
    .pv-art.art-crush { background: linear-gradient(135deg, #3b1d6e, #c2185b); }
    .pv-info { padding: 10px 14px 14px; display: flex; flex-direction: column; gap: 4px; }
    .pv-info p { margin: 0; color: #646970; font-size: .82rem; }
    .pv-tag { align-self: flex-start; font-size: .68rem; font-weight: 800; padding: 2px 8px; border-radius: 999px; background: #f0f6fc; color: #2271b1; }
    .pv-lock { color: #d63638; font-size: .78rem; font-weight: 700; }
    .pv-play { align-self: flex-start; margin-top: 4px; padding: 5px 12px; border-radius: 999px; background: #2271b1; color: #fff; font-size: .8rem; font-weight: 800; }
    .preview.locked .pv-play { background: #dcdcde; color: #50575e; }
    .extra { margin-top: 14px; padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .switch { display: flex; align-items: center; gap: 8px; cursor: pointer; }
    .daily { margin-bottom: 16px; }
    .daily-body { display: grid !important; grid-template-columns: minmax(0, 1fr) 280px; gap: 18px; align-items: start; }
    .daily-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .daily-row input { width: 80px; font: inherit; padding: 7px 10px; border: 1px solid #c3c4c7; border-radius: 8px; }
    .today-free { margin: 8px 0 0; padding: 8px 12px; border-radius: 8px; background: #edfaef; color: #1f6f37; font-size: .88rem;
      display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    .today-chip { font-size: .75rem; font-weight: 800; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
    .today-chip.free { background: #edfaef; color: #1f6f37; border: 1px solid #68de7c; }
    .today-chip.need { background: #fcf9e8; color: #8a6d00; border: 1px dashed #dba617; }
    .game.today-code { border-left-color: #dba617; border-left-style: dashed; }
    .code-card { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 14px; border-radius: 12px; text-align: center;
      background: linear-gradient(135deg, #fff8e1, #ffe9a8); border: 1.5px dashed #ffb800; }
    .code-lbl { font-size: .78rem; font-weight: 800; color: #8a6d00; text-transform: uppercase; letter-spacing: .06em; }
    .code { font: 900 2rem ui-monospace, Consolas, monospace; letter-spacing: .18em; color: #3a2a00; }
    .code-card small { color: #6b5a1e; font-size: .78rem; }
    .code-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
    .code-err { color: #d63638; }
    .free-chk { display: inline-flex; align-items: center; gap: 4px; font-size: .8rem; font-weight: 700; color: #1f6f37; white-space: nowrap; cursor: pointer; }
    @media (max-width: 860px) { .daily-body { grid-template-columns: 1fr; } }
    .extra-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 0 16px 16px; }
    .xbox { display: grid; gap: 10px; align-content: start; padding: 12px; border-radius: 10px; background: #f6f7f7; border: 1px solid #dcdcde; }
    .xtitle { display: flex; align-items: center; gap: 6px; font-size: .92rem; }
    .param label { font-weight: 700; font-size: .84rem; }
    .p-row { display: flex; align-items: center; gap: 8px; }
    .p-row input[type=range] { flex: 1; min-width: 0; accent-color: #2271b1; }
    .p-num { width: 76px; font: inherit; padding: 5px 8px; border: 1px solid #c3c4c7; border-radius: 6px; }
    .unit { font-size: .78rem; color: #646970; min-width: 36px; }
    .lb { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
    .lb li { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto 30px; align-items: center; gap: 8px; padding: 5px 8px; background: #fff; border-radius: 8px; border: 1px solid #e5e5e5; font-size: .86rem; }
    .lb .rk { font-weight: 900; color: #646970; text-align: center; }
    .lb .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    .lb b { font-variant-numeric: tabular-nums; }
    .del-x { border: 0; background: none; cursor: pointer; font-size: .95rem; border-radius: 6px; padding: 2px; }
    .del-x:hover { background: #fcf0f1; }
    .mini-btn { margin-left: auto; border: 1px solid #c3c4c7; background: #fff; border-radius: 6px; width: 26px; height: 26px; cursor: pointer; }
    .link.danger { color: #b32d2e; }
    @media (max-width: 860px) { .extra-grid { grid-template-columns: 1fr; } }
    .notice-box { display: grid; gap: 10px; padding: 12px; border-radius: 10px; background: #f6f7f7; border: 1px dashed #c3c4c7; }
    .notice-box input[type='date'] { max-width: 200px; }
    @media (max-width: 860px) { .edit { grid-template-columns: 1fr; } }
  `,
})
export class AdminMinigames {
  private readonly settingsSvc = inject(SettingsService);
  private readonly toast = inject(AdminToastService);
  private readonly api = inject(OrderApiService);

  readonly statuses = STATUS;
  readonly today = vnToday();
  readonly alwaysId = ALWAYS_FREE_ID;
  readonly dailyFree = signal(this.settingsSvc.settings().minigameDailyFree ?? 0);
  /** Lần random lại hôm nay (lưu trong cài đặt để mọi khách cùng thấy một bộ trò). */
  readonly roll = signal(this.settingsSvc.settings().minigameRoll);
  readonly poolCount = computed(() => dailyPool(resolveGames(this.draft())).length);
  /** Đang giới hạn số trò mỗi ngày (theo bản nháp). */
  readonly limited = computed(() => this.dailyFree() > 0 && this.dailyFree() < this.poolCount());
  /** id các trò miễn phí hôm nay theo bản nháp đang chỉnh. */
  readonly todayIds = computed(() => dailyFreeIds(resolveGames(this.draft()), this.dailyFree(), this.today, rollFor(this.roll(), this.today)));
  readonly todayFree = computed(() => resolveGames(this.draft()).filter((g) => this.todayIds().has(g.id)).map((g) => g.title));

  /** Nhãn "hôm nay" của từng trò (chỉ khi đang giới hạn và trò đang mở). */
  todayState(g: GameSetting): { label: string; cls: string; hint: string } | null {
    if (!this.limited() || g.status !== 'open') return null;
    return this.todayIds().has(g.id)
      ? { label: '🎲 Mở hôm nay', cls: 'free', hint: 'Hôm nay khách chơi miễn phí' }
      : { label: '🔑 Cần code hôm nay', cls: 'need', hint: 'Hôm nay khách cần nhập code mới chơi được' };
  }

  /** Không ưng bộ trò hôm nay → random bộ khác, lưu & gửi lên web ngay. */
  async reroll(): Promise<void> {
    const before = [...this.todayIds()].sort().join();
    let n = rollFor(this.roll(), this.today);
    // Random tới khi ra bộ khác (nếu có thể).
    for (let k = 0; k < 30; k++) {
      n++;
      this.roll.set({ day: this.today, n });
      if ([...this.todayIds()].sort().join() !== before) break;
    }
    await this.save();
  }

  // ---------- Code hôm nay ----------
  readonly code = signal<{ day: string; code: string } | null>(null);
  readonly codeError = signal('');
  readonly codeBusy = signal(false);
  readonly defaultLock = DEFAULT_LOCK_MSG;
  readonly notifyDays = this.settingsSvc.settings().notifyDays || 14;
  readonly artIcon: Record<GameDef['art'], string> = { jp: '⌨️', gacha: '🎁', dle: '🔎', ninja: '🗡️', shmup: '🚀', crush: '💎', merge: '🫧' };

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
      JSON.stringify(this.draft()) !== JSON.stringify(normalizeGameSettings(s.minigames)) ||
      this.comingSoon() !== (s.minigameComingSoon ?? true) ||
      this.dailyFree() !== (s.minigameDailyFree ?? 0) ||
      JSON.stringify(this.roll() ?? null) !== JSON.stringify(s.minigameRoll ?? null) ||
      JSON.stringify(this.params()) !== JSON.stringify(s.gameParams ?? {})
    );
  });

  constructor() {
    void this.loadCode();
  }

  async loadCode(): Promise<void> {
    this.codeError.set('');
    if (!this.api.adminKey()) return this.codeError.set('Chưa có mã quản trị — vào trang Đơn hàng để nhập mã.');
    try {
      this.code.set(await this.api.call<{ day: string; code: string }>('GET', '/api/minigame', undefined, true));
    } catch (e) {
      this.codeError.set(e instanceof Error ? e.message : 'Không tải được code.');
    }
  }

  async newCode(): Promise<void> {
    if (!confirm('Tạo code mới cho hôm nay? Code cũ sẽ không dùng được nữa (khách đã mở khoá vẫn giữ đến hết ngày).')) return;
    this.codeBusy.set(true);
    try {
      this.code.set(await this.api.call<{ day: string; code: string }>('PUT', '/api/minigame', {}, true));
      this.toast.ok('Đã tạo code mới cho hôm nay');
    } catch (e) {
      this.toast.err(e instanceof Error ? e.message : 'Không tạo được code mới.');
    } finally {
      this.codeBusy.set(false);
    }
  }

  async copyCode(): Promise<void> {
    const c = this.code()?.code;
    if (!c) return;
    try {
      await navigator.clipboard.writeText(c);
      this.toast.ok(`Đã sao chép code ${c}`);
    } catch {
      this.toast.err('Không sao chép được — hãy chép tay: ' + c);
    }
  }

  defOf(id: string): GameDef {
    return GAMES.find((g) => g.id === id)!;
  }

  set<K extends keyof GameSetting>(i: number, key: K, value: GameSetting[K]): void {
    this.draft.update((list) => list.map((g, j) => (j === i ? { ...g, [key]: value } : g)));
  }

  toggleOpen(id: string): void {
    this.openId.update((cur) => (cur === id ? null : id));
    if (this.openId() === id && this.lbGames.includes(id)) void this.loadLb(id);
  }

  // ---------- Thông số từng game ----------
  readonly paramDefs = GAME_PARAMS;
  readonly params = signal<Record<string, Record<string, number>>>(structuredClone(this.settingsSvc.settings().gameParams ?? {}));

  paramVal(game: string, key: string, def: number): number {
    return this.params()[game]?.[key] ?? def;
  }

  setParam(game: string, key: string, value: number): void {
    const d = GAME_PARAMS[game]?.find((x) => x.key === key);
    if (!d || !Number.isFinite(value)) return;
    const v = Math.min(d.max, Math.max(d.min, value));
    this.params.update((all) => {
      const g = { ...(all[game] ?? {}) };
      // Bằng mặc định → bỏ khỏi cài đặt cho gọn.
      if (v === d.def) delete g[key];
      else g[key] = v;
      const next = { ...all, [game]: g };
      if (!Object.keys(g).length) delete next[game];
      return next;
    });
  }

  resetParams(game: string): void {
    this.params.update((all) => {
      const next = { ...all };
      delete next[game];
      return next;
    });
  }

  // ---------- Bảng xếp hạng ----------
  readonly lbGames = ['merge', 'crush', 'jp-type', 'ninja', 'shmup'];
  readonly lb = signal<Record<string, { name: string; score: number; at: number }[]>>({});
  readonly lbErr = signal<Record<string, string>>({});
  readonly lbBusy = signal(false);

  async loadLb(game: string): Promise<void> {
    try {
      const res = await fetch(`/api/leaderboard?game=${encodeURIComponent(game)}&fresh=${Date.now()}`);
      const data = (await res.json().catch(() => null)) as { top?: { name: string; score: number; at: number }[] } | null;
      if (!res.ok || !data?.top) throw new Error();
      this.lb.update((m) => ({ ...m, [game]: data.top! }));
    } catch {
      this.lbErr.update((m) => ({ ...m, [game]: 'Bảng xếp hạng chỉ có khi web chạy trên máy chủ.' }));
    }
  }

  async removeLb(game: string, e: { name: string; score: number; at: number }): Promise<void> {
    if (!confirm(`Xoá "${e.name}" (${e.score.toLocaleString('vi-VN')} điểm) khỏi bảng xếp hạng?`)) return;
    await this.lbDelete(game, `&at=${e.at}`, `Đã xoá ${e.name} khỏi bảng xếp hạng`);
  }

  async clearLb(game: string): Promise<void> {
    if (!confirm(`Xoá TOÀN BỘ bảng xếp hạng của "${this.defOf(game).title}"? Không khôi phục được.`)) return;
    await this.lbDelete(game, '&all=1', 'Đã xoá toàn bộ bảng xếp hạng');
  }

  private async lbDelete(game: string, q: string, msg: string): Promise<void> {
    this.lbBusy.set(true);
    try {
      const r = await this.api.call<{ top: { name: string; score: number; at: number }[] }>('DELETE', `/api/leaderboard?game=${encodeURIComponent(game)}${q}`, undefined, true);
      this.lb.update((m) => ({ ...m, [game]: r.top }));
      this.toast.ok(msg);
    } catch (e) {
      this.toast.err(e instanceof Error ? e.message : 'Không xoá được.');
    } finally {
      this.lbBusy.set(false);
    }
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
    this.draft.update((list) => list.map((g, j) => (j === i ? { ...g, title: '', tag: '', desc: '', lockMsg: '', releasedAt: '', notice: '' } : g)));
  }

  resetAll(): void {
    this.draft.set(normalizeGameSettings(undefined));
    this.comingSoon.set(true);
    this.dailyFree.set(0);
    this.toast.ok('Đã khôi phục mặc định — bấm "Lưu thay đổi" để áp dụng');
  }

  revert(): void {
    const s = this.settingsSvc.settings();
    this.draft.set(normalizeGameSettings(s.minigames));
    this.comingSoon.set(s.minigameComingSoon ?? true);
    this.dailyFree.set(s.minigameDailyFree ?? 0);
    this.roll.set(s.minigameRoll);
    this.params.set(structuredClone(s.gameParams ?? {}));
  }

  async save(): Promise<void> {
    const clean = this.draft().map((g) => ({
      ...g,
      title: g.title.trim(),
      tag: g.tag.trim(),
      desc: g.desc.trim(),
      lockMsg: g.lockMsg.trim(),
      releasedAt: (g.releasedAt ?? '').trim(),
      notice: (g.notice ?? '').trim(),
    }));
    const daily = Math.max(0, Math.round(this.dailyFree() || 0));
    const next = { ...this.settingsSvc.settings(), minigames: clean, minigameComingSoon: this.comingSoon(), minigameDailyFree: daily, minigameRoll: this.roll(), gameParams: this.params() };
    if (!this.toast.run(() => this.settingsSvc.save(next), 'Đã lưu cài đặt minigame')) return;
    this.draft.set(normalizeGameSettings(clean));
    this.saving.set(true);
    const err = await this.settingsSvc.publish(this.settingsSvc.settings());
    this.saving.set(false);
    if (err) this.toast.err('Đã lưu trên máy này nhưng chưa gửi được lên web cho khách: ' + err);
    else this.toast.ok('Đã cập nhật cho mọi khách truy cập');
  }
}

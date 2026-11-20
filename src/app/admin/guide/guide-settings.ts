import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { gameCategories, resolveGames } from '../../models/minigames';
import { DEFAULT_GUIDE, GuideSettings, guideOf } from '../../models/site-settings';
import { SettingsService } from '../../services/settings.service';
import { AdminToastService } from '../toast.service';

type TextKey = 'askText' | 'yesLabel' | 'noLabel' | 'yesReply' | 'okLabel' | 'noReply' | 'hubWelcome';

/** Ảnh có sẵn để chọn nhanh (ảnh nền của web). */
const IMAGES = ['bg/cirno.webp', 'bg/fumo-cirno.webp', 'bg/reimu-1.webp', 'bg/reimu-2.webp', 'img/mascot-1.webp', 'img/mascot-2.webp', 'img/mascot-3.webp', 'img/mascot-4.webp'];

/** Admin → Marketing & tương tác → Người hướng dẫn. */
@Component({
  selector: 'app-admin-guide',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="adm-head">
      <h1>Người hướng dẫn</h1>
      <div class="head-actions">
        <button class="btn ghost small" type="button" [disabled]="!dirty()" (click)="revert()">Huỷ thay đổi</button>
        <button class="btn primary small" type="button" [disabled]="!dirty() || saving()" (click)="save()">{{ saving() ? 'Đang lưu…' : 'Lưu thay đổi' }}</button>
      </div>
    </div>
    <p class="intro">
      Khách lướt web một lúc, nhân vật trên ảnh nền (<b>{{ d().lightName }}</b> ở giao diện sáng, <b>{{ d().darkName }}</b> ở giao diện tối)
      sẽ <b>bay ra phía trước</b> và rủ khách chơi minigame. Ở trang Mini game, nhân vật chào mừng và giới thiệu từng trò khi khách rê chuột vào.
    </p>

    <div class="cols">
      <div>
        <section class="adm-box">
          <h2>⚙️ Hoạt động</h2>
          <div class="box-body">
            <label class="switch"><input type="checkbox" [ngModel]="d().enabled" (ngModelChange)="set('enabled', $event)" /><span class="track"></span> Bật người hướng dẫn</label>
            <div class="row2">
              <div class="field">
                <label for="delay">Xuất hiện sau khi lướt (giây)</label>
                <input id="delay" type="number" min="10" max="1800" [ngModel]="d().delaySec" (ngModelChange)="set('delaySec', +$event || 90)" />
                <small class="hint">{{ d().delaySec }} giây ≈ {{ (d().delaySec / 60).toFixed(1) }} phút · chỉ tính lúc tab đang mở · mỗi phiên hỏi 1 lần</small>
              </div>
              <div class="field">
                <label for="snooze">Khách bấm "Không" → hỏi lại sau (giờ)</label>
                <input id="snooze" type="number" min="1" max="720" [ngModel]="d().snoozeHours" (ngModelChange)="set('snoozeHours', +$event || 24)" />
              </div>
            </div>
          </div>
        </section>

        <section class="adm-box">
          <h2>🧸 Nhân vật</h2>
          <div class="box-body chars">
            @for (side of sides; track side.key) {
              <div class="char">
                <b>{{ side.label }}</b>
                <img [src]="d()[side.img]" alt="" />
                <div class="field">
                  <label [for]="'n-' + side.key">Tên</label>
                  <input [id]="'n-' + side.key" maxlength="24" [ngModel]="d()[side.name]" (ngModelChange)="set(side.name, $event)" />
                </div>
                <div class="field">
                  <label>Ảnh</label>
                  <div class="pick">
                    @for (im of images; track im) {
                      <button type="button" [class.on]="d()[side.img] === im" (click)="set(side.img, im)" [title]="im"><img [src]="im" alt="" /></button>
                    }
                  </div>
                </div>
              </div>
            }
          </div>
          <p class="hint pad">Ảnh nhân vật chính trên nền web (Cirno / Reimu) sẽ tạm ẩn khỏi nền lúc nhân vật bay ra, tạo cảm giác bay từ nền ra phía trước.</p>
        </section>
      </div>

      <div>
        <section class="adm-box">
          <h2>💬 Lời thoại rủ chơi minigame</h2>
          <div class="box-body">
            @for (f of askFields; track f.key) {
              <div class="field">
                <label [for]="'t-' + f.key">{{ f.label }}</label>
                <input [id]="'t-' + f.key" maxlength="160" [placeholder]="def[f.key]" [ngModel]="d()[f.key]" (ngModelChange)="set(f.key, $event)" />
              </div>
            }
            <div class="preview" aria-label="Xem trước">
              <img [src]="d().lightImage" alt="" />
              <div class="pv-bubble">
                <b>{{ d().lightName }}</b>
                <p>{{ d().askText }}</p>
                <span class="pv-btn yes">{{ d().yesLabel }}</span> <span class="pv-btn">{{ d().noLabel }}</span>
              </div>
            </div>
          </div>
        </section>

        <section class="adm-box">
          <h2>🎮 Ở trang Mini game</h2>
          <div class="box-body">
            <div class="field">
              <label for="hub">Lời chào</label>
              <input id="hub" maxlength="160" [placeholder]="def.hubWelcome" [ngModel]="d().hubWelcome" (ngModelChange)="set('hubWelcome', $event)" />
            </div>
            <div class="field">
              <label for="hubIntro">Giới thiệu khi vừa dẫn khách sang (hiện to giữa màn hình rồi thu về góc)</label>
              <textarea id="hubIntro" rows="2" maxlength="220" [placeholder]="def.hubIntro" [ngModel]="d().hubIntro" (ngModelChange)="set('hubIntro', $event)"></textarea>
            </div>
            <div class="lines-head">
              <b>Câu nói khi khách rê chuột vào từng game</b>
              <a class="btn ghost small" routerLink="/admin/minigame">Chỉnh trong Cài đặt Minigame →</a>
            </div>
            <p class="hint">Câu thoại từng game nằm trong khung <b>✏️ Sửa thông tin</b> của mỗi game ở trang Minigame. Để trống = dùng câu của <b>phân loại</b>.</p>
            <ul class="lines">
              @for (g of games(); track g.id) {
                <li>
                  <span class="lg-name">{{ g.title }} <small>{{ g.catNames }}</small></span>
                  <span class="lg-line" [class.fallback]="!d().gameLines[g.id]">“{{ d().gameLines[g.id] || g.fallback }}”</span>
                  <a [routerLink]="['/admin/minigame']" [queryParams]="{ sua: g.id }">Sửa</a>
                </li>
              }
            </ul>
          </div>
        </section>
      </div>
    </div>
  `,
  styles: `
    .intro { color: #50575e; margin: -6px 0 16px; }
    .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px; }
    .chars { display: grid !important; grid-template-columns: 1fr 1fr; gap: 14px; }
    .char { display: flex; flex-direction: column; gap: 6px; padding: 10px; border: 1px solid #dcdcde; border-radius: 10px; }
    .char > img { height: 120px; object-fit: contain; align-self: center; }
    .pick { display: flex; flex-wrap: wrap; gap: 4px; }
    .pick button { width: 40px; height: 40px; padding: 2px; border: 2px solid #dcdcde; border-radius: 8px; background: #fff; cursor: pointer; }
    .pick button.on { border-color: #2271b1; box-shadow: 0 0 0 2px #c5d9ed; }
    .pick img { width: 100%; height: 100%; object-fit: contain; }
    .pad { padding: 0 16px 12px; margin: 0; }
    .preview { display: flex; align-items: flex-end; gap: 0; margin-top: 12px; padding: 12px; border-radius: 12px; background: linear-gradient(#eaf4ff, #fff); }
    .preview img { height: 120px; }
    .pv-bubble { margin: 0 0 50px -10px; background: #fff; border: 2px solid #60b5ff; border-radius: 14px; padding: 10px 12px; max-width: 260px; }
    .pv-bubble b { font-size: .72rem; color: #2271b1; text-transform: uppercase; }
    .pv-bubble p { margin: 2px 0 8px; font-weight: 700; font-size: .88rem; }
    .pv-btn { display: inline-block; font-size: .75rem; font-weight: 800; padding: 4px 10px; border-radius: 999px; border: 2px solid #60b5ff; color: #2271b1; }
    .pv-btn.yes { background: #60b5ff; color: #fff; }
    .lines-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .lines { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 4px; }
    .lines li { display: grid; grid-template-columns: minmax(120px, 34%) 1fr auto; gap: 8px; align-items: center; padding: 6px 8px; border-radius: 8px; background: #f6f7f7; font-size: .85rem; }
    .lg-name { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lg-name small { font-weight: 400; color: #646970; }
    .lg-line { color: #1d2327; font-style: italic; }
    .lg-line.fallback { color: #8c8f94; }
    @media (max-width: 600px) { .lines li { grid-template-columns: 1fr auto; } .lg-line { grid-column: 1 / -1; grid-row: 2; } }
    .hint { color: #646970; font-size: .8rem; }
    @media (max-width: 1000px) { .cols { grid-template-columns: 1fr; } }
    @media (max-width: 600px) { .row2, .chars { grid-template-columns: 1fr; } }
  `,
})
export class AdminGuideSettings {
  private readonly settingsSvc = inject(SettingsService);
  private readonly toast = inject(AdminToastService);
  readonly def = DEFAULT_GUIDE;
  readonly images = IMAGES;
  readonly sides = [
    { key: 'light', label: '☀️ Giao diện sáng', name: 'lightName', img: 'lightImage' },
    { key: 'dark', label: '🌙 Giao diện tối', name: 'darkName', img: 'darkImage' },
  ] as const;
  readonly askFields: { key: TextKey; label: string }[] = [
    { key: 'askText', label: 'Câu hỏi' },
    { key: 'yesLabel', label: 'Nút "Có"' },
    { key: 'noLabel', label: 'Nút "Không"' },
    { key: 'yesReply', label: 'Trả lời khi chọn Có' },
    { key: 'okLabel', label: 'Nút OK (sang trang Mini game)' },
    { key: 'noReply', label: 'Trả lời khi chọn Không' },
  ];
  readonly d = signal<GuideSettings>(guideOf(this.settingsSvc.settings()));
  readonly saving = signal(false);
  readonly dirty = computed(() => JSON.stringify(this.d()) !== JSON.stringify(guideOf(this.settingsSvc.settings())));

  readonly games = computed(() => {
    const s = this.settingsSvc.settings();
    const cats = gameCategories(s.gameCategories);
    return resolveGames(s.minigames)
      .filter((g) => g.status !== 'hidden')
      .map((g) => {
        const own = g.cats.map((id) => cats.find((c) => c.id === id)).filter((c) => !!c);
        return { id: g.id, title: g.title, catNames: own.map((c) => c!.icon + ' ' + c!.name).join(' · '), fallback: own.find((c) => c!.line)?.line || 'Câu mặc định' };
      });
  });

  set<K extends keyof GuideSettings>(key: K, value: GuideSettings[K]): void {
    this.d.update((g) => ({ ...g, [key]: value }));
  }

  revert(): void {
    this.d.set(guideOf(this.settingsSvc.settings()));
  }

  async save(): Promise<void> {
    const g = this.d();
    const clean: GuideSettings = { ...g };
    for (const k of ['askText', 'yesLabel', 'noLabel', 'yesReply', 'okLabel', 'noReply', 'hubWelcome', 'hubIntro', 'lightName', 'darkName'] as const) {
      clean[k] = (g[k] || '').trim() || DEFAULT_GUIDE[k];
    }
    clean.delaySec = Math.max(10, Math.min(1800, Math.round(g.delaySec || 90)));
    clean.snoozeHours = Math.max(1, Math.min(720, Math.round(g.snoozeHours || 24)));
    const next = { ...this.settingsSvc.settings(), guide: clean };
    if (!this.toast.run(() => this.settingsSvc.save(next), 'Đã lưu người hướng dẫn')) return;
    this.d.set(guideOf(this.settingsSvc.settings()));
    this.saving.set(true);
    const err = await this.settingsSvc.publish(this.settingsSvc.settings());
    this.saving.set(false);
    if (err) this.toast.err('Đã lưu trên máy này nhưng chưa gửi được lên web cho khách: ' + err);
    else this.toast.ok('Đã cập nhật cho mọi khách truy cập');
  }
}

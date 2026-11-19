import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Announcement } from '../../models/site-settings';
import { SettingsService } from '../../services/settings.service';
import { EmojiPickerComponent } from '../../shared/emoji-picker';
import { AdminToastService } from '../toast.service';

const DAY = 86_400_000;

/** Admin → Thông báo hệ thống: gửi thông báo kèm icon tới mọi khách (chuông + thông báo nổi). */
@Component({
  selector: 'app-admin-announce',
  imports: [FormsModule, DatePipe, EmojiPickerComponent],
  template: `
    <div class="adm-head"><h1>Thông báo hệ thống</h1></div>
    <p class="intro">Gửi một thông báo tới <b>mọi khách</b>: hiện trong chuông 🔔 trên thanh menu và một khung thông báo nhỏ ở góc màn hình (khách đóng thì không hiện lại).</p>

    <section class="adm-box">
      <h2>📣 Soạn thông báo</h2>
      <form class="box-body form" (ngSubmit)="send()" novalidate>
        <div class="row">
          <div class="field icon">
            <label class="req" for="an-icon">Icon</label>
            <div class="pick">
              <span class="big">{{ icon || '❔' }}</span>
              <input id="an-icon" name="icon" maxlength="8" [(ngModel)]="icon" [class.invalid]="tried() && !icon.trim()" />
              <app-emoji-picker label="" (pick)="icon = $event" />
            </div>
          </div>
          <div class="field grow">
            <label class="req" for="an-title">Tiêu đề</label>
            <input id="an-title" name="title" maxlength="80" [(ngModel)]="title" placeholder="VD: Shop nghỉ Tết từ 8/2 đến 15/2" [class.invalid]="tried() && !title.trim()" />
          </div>
        </div>
        <div class="field">
          <label class="req" for="an-content">Nội dung</label>
          <textarea id="an-content" name="content" rows="3" maxlength="300" [(ngModel)]="content" placeholder="Nội dung chi tiết cho khách…" [class.invalid]="tried() && !content.trim()"></textarea>
          <small class="hint">{{ content.length }}/300 ký tự</small>
        </div>
        <div class="row">
          <div class="field grow">
            <label for="an-link">Link khi bấm (tuỳ chọn)</label>
            <input id="an-link" name="link" maxlength="200" [(ngModel)]="link" placeholder="/san-pham hoặc /mini-game" [class.invalid]="tried() && badLink()" />
            @if (tried() && badLink()) { <span class="field-err">Link phải bắt đầu bằng / (trang trong web) hoặc https://</span> }
          </div>
          <div class="field">
            <label for="an-exp">Hiện trong</label>
            <select id="an-exp" name="exp" [(ngModel)]="days">
              <option [ngValue]="1">1 ngày</option>
              <option [ngValue]="3">3 ngày</option>
              <option [ngValue]="7">7 ngày</option>
              <option [ngValue]="30">30 ngày</option>
              <option [ngValue]="0">Không hết hạn</option>
            </select>
          </div>
        </div>

        <div class="preview" aria-label="Xem trước">
          <span class="p-ico">{{ icon || '❔' }}</span>
          <div><b>{{ title || 'Tiêu đề thông báo' }}</b><p>{{ content || 'Nội dung thông báo sẽ hiện ở đây.' }}</p></div>
        </div>

        <button class="btn primary small" type="submit" [disabled]="busy()">{{ busy() ? 'Đang gửi…' : '📣 Gửi thông báo' }}</button>
      </form>
    </section>

    <section class="adm-box">
      <h2>Đã gửi ({{ list().length }})</h2>
      <div class="box-body">
        @if (!list().length) {
          <p class="hint">Chưa có thông báo nào.</p>
        } @else {
          <ul class="sent">
            @for (a of list(); track a.id) {
              <li [class.expired]="expired(a)">
                <span class="p-ico">{{ a.icon }}</span>
                <div class="txt">
                  <b>{{ a.title }}</b>
                  <p>{{ a.content }}</p>
                  <small>
                    Gửi {{ a.createdAt | date: 'HH:mm dd/MM/yyyy' }} ·
                    @if (a.expiresAt) { {{ expired(a) ? 'Đã hết hạn' : 'Hết hạn' }} {{ a.expiresAt | date: 'HH:mm dd/MM/yyyy' }} } @else { Không hết hạn }
                    @if (a.link) { · 🔗 {{ a.link }} }
                  </small>
                </div>
                <button type="button" class="del" (click)="remove(a)" [disabled]="busy()">🗑 Xoá</button>
              </li>
            }
          </ul>
        }
      </div>
    </section>
  `,
  styles: `
    .intro { color: #50575e; margin: 0 0 14px; max-width: 820px; }
    .form { display: grid; gap: 12px; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field.grow { flex: 1; min-width: 220px; }
    .field label { font-weight: 700; font-size: .88rem; }
    .field input, .field textarea, .field select { font: inherit; padding: 8px 10px; border: 1px solid #c3c4c7; border-radius: 6px; background: #fff; }
    .pick { display: flex; align-items: center; gap: 6px; }
    .pick input { width: 70px; }
    .big { font-size: 1.8rem; width: 40px; text-align: center; }
    .hint { color: #646970; font-size: .8rem; }
    .preview { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 12px; background: #f0f6fc; border: 1px dashed #72aee6; max-width: 460px; }
    .preview p, .sent p { margin: 2px 0 0; color: #50575e; font-size: .88rem; }
    .p-ico { font-size: 1.6rem; line-height: 1; flex: none; }
    .sent { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .sent li { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border: 1px solid #dcdcde; border-radius: 10px; }
    .sent li.expired { opacity: .55; }
    .txt { flex: 1; min-width: 0; }
    .txt small { color: #646970; font-size: .76rem; }
    .del { border: 1px solid #d63638; color: #d63638; background: #fff; border-radius: 6px; padding: 4px 10px; cursor: pointer; font: inherit; font-size: .82rem; white-space: nowrap; }
  `,
})
export class AdminAnnounce {
  private readonly settingsSvc = inject(SettingsService);
  private readonly toast = inject(AdminToastService);

  icon = '📣';
  title = '';
  content = '';
  link = '';
  days = 7;
  readonly tried = signal(false);
  readonly busy = signal(false);
  readonly list = computed(() => [...(this.settingsSvc.settings().announcements ?? [])].sort((a, b) => b.createdAt - a.createdAt));

  expired(a: Announcement): boolean {
    return !!a.expiresAt && a.expiresAt < Date.now();
  }

  badLink(): boolean {
    const l = this.link.trim();
    return !!l && !/^\/[^\s]*$/.test(l) && !/^https:\/\/\S+$/.test(l);
  }

  async send(): Promise<void> {
    this.tried.set(true);
    if (!this.icon.trim() || !this.title.trim() || !this.content.trim() || this.badLink()) {
      this.toast.err('Vui lòng điền đủ các ô đánh dấu * (viền đỏ).');
      return;
    }
    const now = Date.now();
    const a: Announcement = {
      id: crypto.randomUUID().slice(0, 12),
      icon: this.icon.trim(),
      title: this.title.trim(),
      content: this.content.trim(),
      ...(this.link.trim() ? { link: this.link.trim() } : {}),
      createdAt: now,
      ...(this.days ? { expiresAt: now + this.days * DAY } : {}),
    };
    // Giữ tối đa 30 thông báo gần nhất.
    const next = [a, ...(this.settingsSvc.settings().announcements ?? [])].slice(0, 30);
    if (await this.publish(next, `📣 Đã gửi thông báo "${a.title}"`)) {
      this.title = this.content = this.link = '';
      this.tried.set(false);
    }
  }

  async remove(a: Announcement): Promise<void> {
    if (!confirm(`Xoá thông báo "${a.title}"? Khách sẽ không thấy nữa.`)) return;
    await this.publish((this.settingsSvc.settings().announcements ?? []).filter((x) => x.id !== a.id), 'Đã xoá thông báo');
  }

  private async publish(list: Announcement[], msg: string): Promise<boolean> {
    const next = { ...this.settingsSvc.settings(), announcements: list };
    if (!this.toast.run(() => this.settingsSvc.save(next), msg)) return false;
    this.busy.set(true);
    const err = await this.settingsSvc.publish(this.settingsSvc.settings());
    this.busy.set(false);
    if (err) this.toast.err('Đã lưu trên máy này nhưng chưa gửi được lên web cho khách: ' + err);
    else this.toast.ok('Khách sẽ thấy thông báo ngay khi mở web');
    return true;
  }
}

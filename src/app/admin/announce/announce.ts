import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Announcement } from '../../models/site-settings';
import { SettingsService } from '../../services/settings.service';
import { EmojiPickerComponent } from '../../shared/emoji-picker';
import { AdminToastService } from '../toast.service';
import { OrderApiService } from '../../services/order-api.service';
import { fileToResizedDataUrl } from '../../shared/image-utils';

const DAY = 86_400_000;

/** Admin → Thông báo hệ thống: gửi thông báo kèm icon tới mọi khách (chuông + thông báo nổi). */
@Component({
  selector: 'app-admin-announce',
  imports: [FormsModule, DatePipe, EmojiPickerComponent],
  template: `
    <div class="adm-head"><h1>Thông báo hệ thống</h1></div>
    <p class="intro">Gửi một thông báo tới <b>mọi khách</b>, hiện trong chuông 🔔 trên thanh menu và theo 1 trong 2 dạng: <b>khung nhỏ</b> ở góc màn hình, hoặc <b>hộp lớn (modal)</b> giữa màn hình như thiệp dịp lễ — có ảnh và nút bấm. Khách đóng rồi thì không hiện lại.</p>

    <section class="adm-box">
      <h2>📣 Soạn thông báo</h2>
      <form class="box-body form" (ngSubmit)="send()" novalidate>
        <div class="types" role="radiogroup" aria-label="Dạng thông báo">
          <button type="button" role="radio" [attr.aria-checked]="type === 'toast'" [class.on]="type === 'toast'" (click)="type = 'toast'">
            <b>💬 Khung nhỏ</b><small>Góc màn hình, không làm phiền</small>
          </button>
          <button type="button" role="radio" [attr.aria-checked]="type === 'modal'" [class.on]="type === 'modal'" (click)="type = 'modal'">
            <b>🪧 Hộp lớn (modal)</b><small>Giữa màn hình, có ảnh + nút — như thiệp dịp lễ</small>
          </button>
        </div>
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
            <label class="req" for="an-title">{{ type === 'modal' ? 'Tiêu đề chính (heading)' : 'Tiêu đề' }}</label>
            <input id="an-title" name="title" maxlength="80" [(ngModel)]="title" placeholder="VD: Shop nghỉ Tết từ 8/2 đến 15/2" [class.invalid]="tried() && !title.trim()" />
          </div>
        </div>
        <div class="field">
          <label class="req" for="an-content">Nội dung</label>
          <textarea id="an-content" name="content" rows="3" maxlength="300" [(ngModel)]="content" placeholder="Nội dung chi tiết cho khách…" [class.invalid]="tried() && !content.trim()"></textarea>
          <small class="hint">{{ content.length }}/300 ký tự</small>
        </div>
        @if (type === 'modal') {
          <div class="field">
            <label for="an-img">Hình ảnh (tuỳ chọn)</label>
            <div class="img-row">
              @if (image) { <img class="thumb" [src]="image" alt="" /> }
              <label class="btn ghost small">
                {{ uploading() ? 'Đang tải…' : '⬆ Tải ảnh lên' }}
                <input type="file" accept="image/*" hidden (change)="onImage($event)" [disabled]="uploading()" />
              </label>
              <input id="an-img" name="image" class="grow-in" maxlength="500" [(ngModel)]="image" placeholder="hoặc dán link ảnh https://…" [class.invalid]="tried() && badImage()" />
              @if (image) { <button type="button" class="del" (click)="image = ''">Bỏ ảnh</button> }
            </div>
          </div>
          <div class="row">
            <div class="field grow">
              <label class="req" for="an-b1">Nội dung nút 1</label>
              <input id="an-b1" name="b1" maxlength="40" [(ngModel)]="btn1Text" placeholder="VD: Xem ngay" [class.invalid]="tried() && !btn1Text.trim()" />
            </div>
            <div class="field grow">
              <label for="an-b1l">Link nút 1 (trống = nút đóng)</label>
              <input id="an-b1l" name="b1l" maxlength="200" [(ngModel)]="btn1Link" placeholder="/san-pham" [class.invalid]="tried() && badUrl(btn1Link)" />
            </div>
          </div>
          <div class="row">
            <div class="field grow">
              <label for="an-b2">Nội dung nút 2 (tuỳ chọn)</label>
              <input id="an-b2" name="b2" maxlength="40" [(ngModel)]="btn2Text" placeholder="VD: Để sau" />
            </div>
            <div class="field grow">
              <label for="an-b2l">Link nút 2 (trống = nút đóng)</label>
              <input id="an-b2l" name="b2l" maxlength="200" [(ngModel)]="btn2Link" placeholder="/mini-game" [class.invalid]="tried() && badUrl(btn2Link)" />
            </div>
          </div>
          @if (tried() && (badUrl(btn1Link) || badUrl(btn2Link))) { <span class="field-err">Link phải bắt đầu bằng / (trang trong web) hoặc https://</span> }
        }
        <div class="row">
          @if (type === 'toast') {
          <div class="field grow">
            <label for="an-link">Link khi bấm (tuỳ chọn)</label>
            <input id="an-link" name="link" maxlength="200" [(ngModel)]="link" placeholder="/san-pham hoặc /mini-game" [class.invalid]="tried() && badLink()" />
            @if (tried() && badLink()) { <span class="field-err">Link phải bắt đầu bằng / (trang trong web) hoặc https://</span> }
          </div>
          }
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

        @if (type === 'modal') {
          <div class="m-preview" aria-label="Xem trước modal">
            @if (image) { <img [src]="image" alt="" /> } @else { <div class="m-ico">{{ icon || '❔' }}</div> }
            <div class="m-txt">
              <b>@if (image) { {{ icon }} }{{ title || 'Tiêu đề chính' }}</b>
              <p>{{ content || 'Nội dung thông báo sẽ hiện ở đây.' }}</p>
              <span class="m-btn">{{ btn1Text || 'Nút 1' }}</span>
              @if (btn2Text) { <span class="m-btn ghost">{{ btn2Text }}</span> }
            </div>
          </div>
        } @else {
          <div class="preview" aria-label="Xem trước">
            <span class="p-ico">{{ icon || '❔' }}</span>
            <div><b>{{ title || 'Tiêu đề thông báo' }}</b><p>{{ content || 'Nội dung thông báo sẽ hiện ở đây.' }}</p></div>
          </div>
        }

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
                  <b>{{ a.title }} <span class="kind-tag">{{ a.type === 'modal' ? '🪧 Modal' : '💬 Khung nhỏ' }}</span></b>
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
    .types { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .types button { display: flex; flex-direction: column; gap: 2px; text-align: left; padding: 10px 12px; border-radius: 10px; border: 1.5px solid #c3c4c7; background: #fff; cursor: pointer; font: inherit; }
    .types button small { color: #646970; font-size: .78rem; }
    .types button.on { border-color: #2271b1; background: #f0f6fc; box-shadow: 0 0 0 1px #2271b1; }
    .img-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .img-row .grow-in { flex: 1; min-width: 200px; }
    .thumb { width: 64px; height: 44px; object-fit: cover; border-radius: 6px; border: 1px solid #dcdcde; }
    .m-preview { width: min(320px, 100%); border-radius: 18px; overflow: hidden; border: 2px solid #72aee6; background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,.12); }
    .m-preview img { display: block; width: 100%; max-height: 160px; object-fit: cover; }
    .m-ico { font-size: 2.6rem; text-align: center; padding-top: 14px; }
    .m-txt { padding: 12px 16px 16px; text-align: center; display: flex; flex-direction: column; gap: 6px; }
    .m-txt p { margin: 0; color: #50575e; font-size: .85rem; white-space: pre-line; }
    .m-btn { display: block; padding: 7px; border-radius: 999px; background: #2271b1; color: #fff; font-weight: 700; font-size: .85rem; }
    .m-btn.ghost { background: #fff; color: #2271b1; border: 1.5px solid #2271b1; }
    .kind-tag { font-size: .7rem; font-weight: 700; color: #646970; background: #f0f0f1; padding: 1px 8px; border-radius: 999px; margin-left: 4px; }
    @media (max-width: 600px) { .types { grid-template-columns: 1fr; } }
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
  private readonly api = inject(OrderApiService);

  type: 'toast' | 'modal' = 'toast';
  image = '';
  btn1Text = '';
  btn1Link = '';
  btn2Text = '';
  btn2Link = '';
  readonly uploading = signal(false);
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

  badUrl(l: string): boolean {
    const v = l.trim();
    return !!v && !/^\/[^\s]*$/.test(v) && !/^https:\/\/\S+$/.test(v);
  }

  badImage(): boolean {
    const v = this.image.trim();
    return !!v && !/^https:\/\/\S+$/.test(v) && !/^\/[^\s]+$/.test(v) && !v.startsWith('data:image/');
  }

  /** Tải ảnh: thu nhỏ → đưa lên kho ảnh (Supabase); chạy thử ở máy thì giữ ảnh nhỏ trong cài đặt. */
  async onImage(e: Event): Promise<void> {
    const el = e.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    this.uploading.set(true);
    try {
      const dataUrl = await fileToResizedDataUrl(file, 900, 0.8);
      try {
        this.image = (await this.api.call<{ url: string }>('POST', '/api/catalog', { dataUrl }, true, { timeoutMs: 30000 })).url;
      } catch {
        if (dataUrl.length > 150_000) throw new Error('Không tải được ảnh lên máy chủ — hãy dán link ảnh thay thế.');
        this.image = dataUrl;
      }
    } catch (err) {
      this.toast.err(err instanceof Error ? err.message : 'Không đọc được ảnh.');
    } finally {
      this.uploading.set(false);
    }
  }

  badLink(): boolean {
    const l = this.link.trim();
    return !!l && !/^\/[^\s]*$/.test(l) && !/^https:\/\/\S+$/.test(l);
  }

  async send(): Promise<void> {
    this.tried.set(true);
    const modal = this.type === 'modal';
    const modalBad = modal && (!this.btn1Text.trim() || this.badUrl(this.btn1Link) || this.badUrl(this.btn2Link) || this.badImage());
    if (!this.icon.trim() || !this.title.trim() || !this.content.trim() || (!modal && this.badLink()) || modalBad) {
      this.toast.err('Vui lòng điền đủ các ô đánh dấu * (viền đỏ).');
      return;
    }
    const now = Date.now();
    const a: Announcement = {
      id: crypto.randomUUID().slice(0, 12),
      icon: this.icon.trim(),
      title: this.title.trim(),
      content: this.content.trim(),
      ...(!modal && this.link.trim() ? { link: this.link.trim() } : {}),
      ...(modal
        ? {
            type: 'modal' as const,
            ...(this.image.trim() ? { image: this.image.trim() } : {}),
            btn1: { text: this.btn1Text.trim(), ...(this.btn1Link.trim() ? { link: this.btn1Link.trim() } : {}) },
            ...(this.btn2Text.trim() ? { btn2: { text: this.btn2Text.trim(), ...(this.btn2Link.trim() ? { link: this.btn2Link.trim() } : {}) } } : {}),
          }
        : {}),
      createdAt: now,
      ...(this.days ? { expiresAt: now + this.days * DAY } : {}),
    };
    // Giữ tối đa 30 thông báo gần nhất.
    const next = [a, ...(this.settingsSvc.settings().announcements ?? [])].slice(0, 30);
    if (await this.publish(next, `📣 Đã gửi thông báo "${a.title}"`)) {
      this.title = this.content = this.link = this.image = this.btn1Text = this.btn1Link = this.btn2Text = this.btn2Link = '';
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

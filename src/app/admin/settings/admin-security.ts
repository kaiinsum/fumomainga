import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiError, OrderApiService } from '../../services/order-api.service';
import { AdminToastService } from '../toast.service';

interface BlockedIp {
  ip: string;
  reason: string;
  at: number;
  until?: number;
}
interface Suspect {
  ip: string;
  rateHits: number;
  loginFails: number;
  paths: string[];
  last: number;
  blocked: boolean;
  level: 'warn' | 'danger';
}

/** Tab Bảo mật: chặn IP thủ công + IP đáng ngờ (spam / nhập sai mật khẩu nhiều lần). */
@Component({
  selector: 'app-admin-security',
  imports: [FormsModule, DatePipe],
  template: `
    <section class="adm-box">
      <h2>🚨 IP đáng ngờ (24 giờ qua)</h2>
      <div class="box-body">
        <div class="bar">
          <p class="hint">IP gửi yêu cầu quá nhanh nhiều lần (spam / tấn công) hoặc nhập sai mật khẩu admin từ 3 lần. Kiểm tra lại mỗi 5 phút và báo vào chuông 🔔.</p>
          <button class="btn ghost small" type="button" (click)="load()" [disabled]="loading()">{{ loading() ? 'Đang tải…' : '↻ Quét lại' }}</button>
        </div>
        @if (error()) {
          <p class="err">{{ error() }}</p>
        } @else if (!suspects().length) {
          <p class="ok">✅ Không phát hiện IP nào đáng ngờ.</p>
        } @else {
          <div class="adm-table-wrap">
            <table class="adm-table">
              <thead><tr><th>IP</th><th class="num">Spam</th><th class="num">Sai mật khẩu</th><th>Đường dẫn</th><th>Lần cuối</th><th></th></tr></thead>
              <tbody>
                @for (s of suspects(); track s.ip) {
                  <tr [class.danger]="s.level === 'danger'">
                    <td class="ip">{{ s.level === 'danger' ? '🔴' : '🟠' }} {{ s.ip }}</td>
                    <td class="num">{{ s.rateHits }}</td>
                    <td class="num">{{ s.loginFails }}</td>
                    <td class="paths">{{ s.paths.join(', ') }}</td>
                    <td>{{ s.last | date: 'HH:mm dd/MM' }}</td>
                    <td>
                      @if (s.blocked) { <span class="tag">Đã chặn</span> }
                      @else { <button type="button" class="block-btn" (click)="block(s.ip, s.loginFails >= 3 ? 'Nhập sai mật khẩu admin nhiều lần' : 'Spam / gửi yêu cầu quá nhanh', 24 * 7)" [disabled]="busy()">🚫 Chặn 7 ngày</button> }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </section>

    <section class="adm-box">
      <h2>🚫 Chặn IP thủ công</h2>
      <div class="box-body">
        <form class="form" (ngSubmit)="submit()" novalidate>
          <div class="field">
            <label class="req" for="bl-ip">Địa chỉ IP</label>
            <input id="bl-ip" name="ip" [(ngModel)]="ip" placeholder="VD: 113.161.12.34" [class.invalid]="tried() && !validIp(ip)" />
          </div>
          <div class="field grow">
            <label for="bl-reason">Lý do</label>
            <input id="bl-reason" name="reason" maxlength="120" [(ngModel)]="reason" placeholder="VD: đặt đơn ảo liên tục" />
          </div>
          <div class="field">
            <label for="bl-h">Thời hạn</label>
            <select id="bl-h" name="hours" [(ngModel)]="hours">
              <option [ngValue]="1">1 giờ</option>
              <option [ngValue]="24">1 ngày</option>
              <option [ngValue]="168">7 ngày</option>
              <option [ngValue]="720">30 ngày</option>
              <option [ngValue]="0">Vĩnh viễn</option>
            </select>
          </div>
          <button class="btn primary small" type="submit" [disabled]="busy()">🚫 Chặn</button>
        </form>
        @if (tried() && !validIp(ip)) { <p class="field-err">IP không hợp lệ (IPv4 dạng 1.2.3.4 hoặc IPv6).</p> }
        @if (myIp()) { <p class="hint">IP của bạn hiện tại: <code>{{ myIp() }}</code> (không thể tự chặn).</p> }
        <p class="hint">IP bị chặn không đặt hàng, gửi liên hệ, chat AI hay đăng nhập admin được. Muốn chặn cả việc xem trang web, thêm IP vào <b>Vercel → Firewall</b>.</p>

        <h3>Đang chặn ({{ blocked().length }})</h3>
        @if (!blocked().length) {
          <p class="hint">Chưa chặn IP nào.</p>
        } @else {
          <ul class="blocked">
            @for (b of blocked(); track b.ip) {
              <li>
                <code>{{ b.ip }}</code>
                <span class="reason">{{ b.reason }}</span>
                <small>từ {{ b.at | date: 'HH:mm dd/MM/yyyy' }} · {{ b.until ? 'đến ' + (b.until | date: 'HH:mm dd/MM/yyyy') : 'vĩnh viễn' }}</small>
                <button type="button" class="unblock" (click)="unblock(b.ip)" [disabled]="busy()">Bỏ chặn</button>
              </li>
            }
          </ul>
        }
      </div>
    </section>
  `,
  styles: `
    :host { display: grid; gap: 16px; margin-top: 16px; }
    .bar { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
    .bar .hint { flex: 1; min-width: 220px; margin: 0; }
    .hint { color: #646970; font-size: .82rem; }
    .err { color: #b32d2e; }
    .ok { color: #1f6f37; font-weight: 700; }
    .ip, code { font-family: ui-monospace, Consolas, monospace; white-space: nowrap; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .paths { font-size: .8rem; color: #50575e; max-width: 220px; }
    tr.danger td { background: #fcf0f1; }
    .tag { font-size: .75rem; font-weight: 800; color: #646970; }
    .block-btn { border: 1px solid #d63638; background: #fff; color: #d63638; border-radius: 6px; padding: 4px 10px; font: inherit; font-size: .8rem; cursor: pointer; white-space: nowrap; }
    .block-btn:hover { background: #d63638; color: #fff; }
    .form { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field.grow { flex: 1; min-width: 200px; }
    .field label { font-weight: 700; font-size: .85rem; }
    .field input, .field select { font: inherit; padding: 7px 10px; border: 1px solid #c3c4c7; border-radius: 6px; background: #fff; }
    h3 { margin: 14px 0 8px; font-size: .95rem; }
    .blocked { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
    .blocked li { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 10px; border: 1px solid #dcdcde; border-radius: 8px; }
    .reason { flex: 1; min-width: 140px; }
    .blocked small { color: #646970; }
    .unblock { border: 1px solid #c3c4c7; background: #fff; border-radius: 6px; padding: 4px 10px; font: inherit; font-size: .8rem; cursor: pointer; }
    @media (max-width: 600px) { .adm-table th:nth-child(4), .adm-table td:nth-child(4) { display: none; } }
  `,
})
export class AdminSecurityComponent {
  private readonly api = inject(OrderApiService);
  private readonly toast = inject(AdminToastService);
  readonly suspects = signal<Suspect[]>([]);
  readonly blocked = signal<BlockedIp[]>([]);
  readonly myIp = signal('');
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly tried = signal(false);
  ip = '';
  reason = '';
  hours = 168;

  constructor() {
    void this.load();
  }

  validIp(ip: string): boolean {
    return /^[0-9a-fA-F:.]{3,45}$/.test(ip.trim()) && /[.:]/.test(ip);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const r = await this.api.call<{ blocked: BlockedIp[]; suspects: Suspect[]; myIp: string }>('GET', '/api/admin/security', undefined, true);
      this.blocked.set(r.blocked);
      this.suspects.set(r.suspects);
      this.myIp.set(r.myIp === 'unknown' ? '' : r.myIp);
    } catch (e) {
      this.error.set(e instanceof ApiError && (e.status === 404 || e.status === 0) ? 'Chỉ dùng được khi web chạy trên Vercel (cần máy chủ).' : e instanceof Error ? e.message : 'Không tải được.');
    } finally {
      this.loading.set(false);
    }
  }

  submit(): void {
    this.tried.set(true);
    if (!this.validIp(this.ip)) return this.toast.err('IP không hợp lệ.');
    void this.block(this.ip.trim(), this.reason.trim(), this.hours).then((ok) => {
      if (ok) {
        this.ip = this.reason = '';
        this.tried.set(false);
      }
    });
  }

  async block(ip: string, reason: string, hours: number): Promise<boolean> {
    if (!confirm(`Chặn IP ${ip}${hours ? ` trong ${hours >= 24 ? hours / 24 + ' ngày' : hours + ' giờ'}` : ' vĩnh viễn'}?`)) return false;
    return this.act({ action: 'block', ip, reason, hours }, `🚫 Đã chặn ${ip}`);
  }

  unblock(ip: string): void {
    void this.act({ action: 'unblock', ip }, `Đã bỏ chặn ${ip}`);
  }

  private async act(body: Record<string, unknown>, msg: string): Promise<boolean> {
    this.busy.set(true);
    try {
      const r = await this.api.call<{ blocked: BlockedIp[] }>('POST', '/api/admin/security', body, true);
      this.blocked.set(r.blocked);
      this.suspects.update((l) => l.map((s) => ({ ...s, blocked: r.blocked.some((b) => b.ip === s.ip) })));
      this.toast.ok(msg);
      return true;
    } catch (e) {
      this.toast.err(e instanceof Error ? e.message : 'Không thực hiện được.');
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}

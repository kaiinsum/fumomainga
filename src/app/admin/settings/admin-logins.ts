import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ApiError, OrderApiService } from '../../services/order-api.service';
import { LOGIN_ID_KEY } from '../../services/auth.service';

interface LoginEvent {
  id: string;
  kind: 'login' | 'fail' | 'password';
  at: number;
  ip: string;
  ua: string;
}

/** "Chrome · Windows" từ chuỗi user-agent. */
function device(ua: string): string {
  if (!ua) return 'Không rõ';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /CocCoc/i.test(ua) ? 'Cốc Cốc'
    : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Trình duyệt khác';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  const mobile = /Mobi|Android|iPhone/.test(ua) ? ' 📱' : ' 💻';
  return `${browser}${os ? ' · ' + os : ''}${mobile}`;
}

/** "5 phút trước", "2 giờ trước", "3 ngày trước". */
function ago(t: number, now: number): string {
  const m = Math.max(0, Math.floor((now - t) / 60_000));
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ ${m % 60 ? (m % 60) + ' phút ' : ''}trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}

const KIND: Record<LoginEvent['kind'], { label: string; cls: string }> = {
  login: { label: '✅ Đăng nhập', cls: 'ok' },
  fail: { label: '❌ Sai mật khẩu', cls: 'bad' },
  password: { label: '🔑 Đổi mật khẩu', cls: 'pw' },
};

/** Tab Bảo mật: lịch sử đăng nhập admin (IP, thiết bị, bao lâu trước). */
@Component({
  selector: 'app-admin-logins',
  template: `
    <section class="adm-box">
      <h2>🛡 Lịch sử đăng nhập</h2>
      <div class="box-body">
        <div class="bar">
          <p class="hint">40 lần gần nhất: đăng nhập, nhập sai mật khẩu, đổi mật khẩu. Thấy IP lạ hoặc nhiều lần nhập sai → đổi mật khẩu ngay.</p>
          <button class="btn ghost small" type="button" (click)="load()" [disabled]="loading()">{{ loading() ? 'Đang tải…' : '↻ Tải lại' }}</button>
        </div>
        @if (error()) {
          <p class="err">{{ error() }}</p>
        } @else if (!list().length && !loading()) {
          <p class="hint">Chưa có lần đăng nhập nào được ghi lại.</p>
        } @else {
          <div class="adm-table-wrap">
            <table class="adm-table">
              <thead><tr><th>Thời gian</th><th>IP</th><th>Thiết bị</th><th>Sự kiện</th></tr></thead>
              <tbody>
                @for (e of list(); track e.id) {
                  <tr [class.me]="e.id === myId" [class.fail]="e.kind === 'fail'">
                    <td>
                      <b>{{ ago(e.at) }}</b>
                      <small>{{ fmt(e.at) }}</small>
                    </td>
                    <td class="ip">{{ e.ip || 'không rõ' }} @if (e.id === myId) { <span class="me-tag">Máy này</span> }</td>
                    <td [title]="e.ua">{{ device(e.ua) }}</td>
                    <td><span class="kind" [class]="'kind ' + kind[e.kind].cls">{{ kind[e.kind].label }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </section>
  `,
  styles: `
    :host { display: block; margin-top: 16px; }
    .bar { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
    .bar .hint { flex: 1; min-width: 220px; margin: 0; }
    .err { color: #d63638; }
    td small { display: block; color: #646970; font-size: .76rem; }
    .ip { font-family: ui-monospace, Consolas, monospace; white-space: nowrap; }
    .me-tag { display: inline-block; margin-left: 6px; font: 800 .68rem/1 inherit; font-family: inherit; padding: 3px 8px; border-radius: 999px; background: #2271b1; color: #fff; }
    tr.me td { background: #f0f6fc; }
    tr.fail td { background: #fcf0f1; }
    .kind { font-size: .78rem; font-weight: 800; white-space: nowrap; }
    .kind.ok { color: #1f6f37; } .kind.bad { color: #b32d2e; } .kind.pw { color: #8a6d00; }
    @media (max-width: 600px) { .adm-table th:nth-child(3), .adm-table td:nth-child(3) { display: none; } }
  `,
})
export class AdminLoginsComponent {
  private readonly api = inject(OrderApiService);
  readonly list = signal<LoginEvent[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly kind = KIND;
  readonly device = device;
  readonly myId = (() => {
    try {
      return localStorage.getItem(LOGIN_ID_KEY) ?? '';
    } catch {
      return '';
    }
  })();
  /** Đổi mỗi 30 giây để "x phút trước" tự cập nhật. */
  private readonly now = signal(Date.now());

  constructor() {
    void this.load();
    const t = setInterval(() => this.now.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }

  ago(t: number): string {
    return ago(t, this.now());
  }

  fmt(t: number): string {
    return new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.list.set((await this.api.call<{ logins: LoginEvent[] }>('GET', '/api/admin/login', undefined, true)).logins);
      this.now.set(Date.now());
    } catch (e) {
      this.error.set(
        e instanceof ApiError && (e.status === 404 || e.status === 0)
          ? 'Chỉ xem được khi web chạy trên Vercel (cần máy chủ).'
          : e instanceof Error ? e.message : 'Không tải được lịch sử đăng nhập.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}

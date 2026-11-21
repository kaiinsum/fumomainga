import { Component, ElementRef, HostListener, computed, inject, output, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';

interface Entry {
  icon: string;
  label: string;
  /** Nằm ở đâu (hiện dưới tên). */
  where: string;
  path: string;
  query?: Record<string, string>;
  /** Từ khoá thêm để tìm. */
  keys?: string;
}

const S = (tab: string) => ({ tab });

/** Mọi trang + từng mục cài đặt trong admin (để tìm nhanh). */
const INDEX: Entry[] = [
  // Tổng quan
  { icon: '📊', label: 'Bảng tin', where: 'Tổng quan', path: '/admin', keys: 'dashboard tong quan' },
  { icon: '🗺', label: 'Bản đồ nhiệt đơn hàng', where: 'Bảng tin', path: '/admin', keys: 'heatmap khu vuc dat hang ip vi tri' },
  { icon: '📈', label: 'Thống kê truy cập', where: 'Tổng quan', path: '/admin/thong-ke', keys: 'luot xem online nguoi truy cap ip bieu do' },
  { icon: '🧹', label: 'Dọn dữ liệu cũ / bộ nhớ', where: 'Thống kê', path: '/admin/thong-ke', query: { don: '1' }, keys: 'xoa du lieu dung luong storage day bo nho' },
  { icon: '🧚', label: 'Người hướng dẫn (Cirno / Reimu)', where: 'Marketing & tương tác', path: '/admin/nguoi-huong-dan', keys: 'nguoi huong dan cirno reimu loi thoai moi choi minigame mascot nhan vat' },
  { icon: '🏷', label: 'Phân loại minigame', where: 'Minigame', path: '/admin/minigame', keys: 'phan loai giai tri tri tue chien thuat the loai' },
  { icon: '🚀', label: 'Hiệu suất', where: 'Tổng quan', path: '/admin/phan-tich', keys: 'phan tich thoi gian choi minigame san pham ban chay ti le dat bai viet luot doc' },
  { icon: '💰', label: 'Doanh thu & lãi ròng', where: 'Tổng quan', path: '/admin/doanh-thu', keys: 'doanh thu lai rong loi nhuan chi phi gia nhap tien bi giam chua thanh toan' },
  // Bán hàng
  { icon: '🧾', label: 'Đơn hàng', where: 'Quản lý bán hàng', path: '/admin/don-hang', keys: 'don cho duyet thanh toan giao hang' },
  { icon: '🧸', label: 'Tất cả sản phẩm', where: 'Quản lý bán hàng', path: '/admin/san-pham', keys: 'san pham an hien het hang noi bat' },
  { icon: '➕', label: 'Thêm sản phẩm mới', where: 'Sản phẩm', path: '/admin/san-pham/moi', keys: 'dang san pham bien the anh' },
  { icon: '📑', label: 'Nhập / xuất Excel', where: 'Sản phẩm', path: '/admin/san-pham/excel', keys: 'excel import export xlsx' },
  { icon: '🗂️', label: 'Danh mục', where: 'Quản lý bán hàng', path: '/admin/danh-muc', keys: 'danh muc loai' },
  // Nội dung
  { icon: '📰', label: 'Tin tức', where: 'Quản lý nội dung', path: '/admin/tin-tuc', keys: 'bai viet blog' },
  { icon: '✍️', label: 'Viết bài mới', where: 'Tin tức', path: '/admin/tin-tuc/moi', keys: 'dang bai' },
  { icon: '🎉', label: 'Chủ đề dịp lễ', where: 'Quản lý nội dung', path: '/admin/chu-de', keys: 'tet trung thu giang sinh halloween valentine them dip le tu dong theo lich thiep' },
  // Marketing
  { icon: '🔍', label: 'Khai báo SEO (Google)', where: 'Marketing & tương tác', path: '/admin/khai-bao', keys: 'seo rank math google index search console sitemap tu khoa meta mo ta favicon schema' },
  { icon: '🖼', label: 'Favicon', where: 'Khai báo SEO', path: '/admin/khai-bao?tab=general', keys: 'favicon icon tab logo' },
  { icon: '🎮', label: 'Minigame', where: 'Marketing & tương tác', path: '/admin/minigame', keys: 'khoa mo an game thu tu' },
  { icon: '🎟', label: 'Code mở khoá minigame hôm nay', where: 'Minigame', path: '/admin/minigame', keys: 'code ma mo khoa' },
  { icon: '🎲', label: 'Giới hạn trò miễn phí mỗi ngày / random lại', where: 'Minigame', path: '/admin/minigame', keys: 'mien phi random gioi han' },
  { icon: '⚙️', label: 'Thông số từng trò chơi', where: 'Minigame → ✏️ Sửa thông tin', path: '/admin/minigame', keys: 'do kho mang toc do diem thuong' },
  { icon: '🏆', label: 'Bảng xếp hạng minigame (xoá top)', where: 'Minigame → ✏️ Sửa thông tin', path: '/admin/minigame', keys: 'xep hang top diem xoa' },
  { icon: '📣', label: 'Gửi thông báo hệ thống', where: 'Marketing & tương tác', path: '/admin/thong-bao', keys: 'thong bao modal popup khung nho' },
  { icon: '✉️', label: 'Lời nhắn của khách', where: 'Marketing & tương tác', path: '/admin/lien-he', keys: 'lien he tin nhan' },
  // Hệ thống
  { icon: '🤖', label: 'Trợ lý AI', where: 'Công cụ & hệ thống', path: '/admin/tro-ly-ai', keys: 'chat ai gemini kien thuc dong bo du lieu' },
  { icon: '⚙️', label: 'Cài đặt', where: 'Công cụ & hệ thống', path: '/admin/cai-dat' },
  { icon: '🏷', label: 'Thông tin shop (tên, logo, khẩu hiệu, chân trang)', where: 'Cài đặt → Chung', path: '/admin/cai-dat', query: S('chung'), keys: 'ten shop logo emoji footer' },
  { icon: '🔤', label: 'Font chữ', where: 'Cài đặt → Chung', path: '/admin/cai-dat', query: S('chung'), keys: 'phong chu font' },
  { icon: '🎨', label: 'Màu chủ đạo', where: 'Cài đặt → Chung', path: '/admin/cai-dat', query: S('chung'), keys: 'mau sac theme' },
  { icon: '🖌', label: 'Màu nền trang web', where: 'Cài đặt → Chung', path: '/admin/cai-dat', query: S('chung'), keys: 'mau nen background' },
  { icon: '🏠', label: 'Phần đầu trang chủ', where: 'Cài đặt → Trang chủ', path: '/admin/cai-dat', query: S('trang-chu'), keys: 'hero tieu de badge banner' },
  { icon: '💬', label: 'Nội dung trang Giới thiệu', where: 'Cài đặt → Giới thiệu', path: '/admin/cai-dat', query: S('gioi-thieu'), keys: 've chung toi gia tri cot loi' },
  { icon: '🛤', label: 'Hành trình (mốc thời gian)', where: 'Cài đặt → Giới thiệu', path: '/admin/cai-dat', query: S('gioi-thieu'), keys: 'timeline moc' },
  { icon: '📞', label: 'Thông tin liên hệ (địa chỉ, điện thoại, email, giờ mở cửa)', where: 'Cài đặt → Liên hệ', path: '/admin/cai-dat', query: S('lien-he'), keys: 'dia chi so dien thoai email gio' },
  { icon: '🏦', label: 'Thanh toán chuyển khoản (ngân hàng, QR)', where: 'Cài đặt → Liên hệ', path: '/admin/cai-dat', query: S('lien-he'), keys: 'ngan hang so tai khoan qr bank' },
  { icon: '🫧', label: 'Link Facebook / TikTok / Shopee, bật chat AI', where: 'Cài đặt → Liên hệ', path: '/admin/cai-dat', query: S('lien-he'), keys: 'facebook tiktok shopee bong bong mang xa hoi loi chao' },
  { icon: '📜', label: 'Trang Chính sách', where: 'Cài đặt → Chính sách', path: '/admin/cai-dat', query: S('chinh-sach'), keys: 'doi tra bao hanh van chuyen' },
  { icon: '🔔', label: 'Chuông thông báo cho khách (số ngày)', where: 'Cài đặt → Thông báo', path: '/admin/cai-dat', query: S('thong-bao'), keys: 'san pham moi minigame moi' },
  { icon: '🔐', label: 'Đổi mật khẩu admin', where: 'Cài đặt → Bảo mật', path: '/admin/cai-dat', query: S('bao-mat'), keys: 'mat khau password' },
  { icon: '🚫', label: 'Chặn IP / IP đáng ngờ (spam)', where: 'Cài đặt → Bảo mật', path: '/admin/cai-dat', query: S('bao-mat'), keys: 'block ip tan cong spam ddos' },
  { icon: '🛡', label: 'Lịch sử đăng nhập', where: 'Cài đặt → Bảo mật', path: '/admin/cai-dat', query: S('bao-mat'), keys: 'dang nhap ip thiet bi' },
  { icon: '💾', label: 'Sao lưu & khôi phục dữ liệu', where: 'Cài đặt → Sao lưu', path: '/admin/cai-dat', query: S('sao-luu'), keys: 'backup xuat nhap json' },
];

const plain = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
const HAY = INDEX.map((e) => plain(`${e.label} ${e.where} ${e.keys ?? ''}`));

/** Ô tìm nhanh trang / mục cài đặt trong admin. Ctrl+K (⌘K) để mở nhanh. */
@Component({
  selector: 'app-admin-search',
  template: `
    <div class="search">
      <span class="mag" aria-hidden="true">🔍</span>
      <input #inp type="search" [value]="q()" (input)="q.set($any($event.target).value); sel.set(0)" (keydown)="onKey($event)"
        placeholder="Tìm cài đặt, trang…" aria-label="Tìm trong trang quản trị" autocomplete="off" />
      <kbd>Ctrl K</kbd>
    </div>
    @if (q().trim()) {
      <ul class="results" role="listbox">
        @for (r of results(); track r.label + r.where; let i = $index) {
          <li role="option" [attr.aria-selected]="i === sel()">
            <button type="button" [class.on]="i === sel()" (mouseenter)="sel.set(i)" (click)="go(r)">
              <span class="ri">{{ r.icon }}</span>
              <span class="rt"><b>{{ r.label }}</b><small>{{ r.where }}</small></span>
            </button>
          </li>
        } @empty {
          <li class="none">Không tìm thấy "{{ q() }}"</li>
        }
      </ul>
    }
  `,
  styles: `
    :host { display: block; padding: 0 12px 10px; }
    .search { position: relative; display: flex; align-items: center; }
    .mag { position: absolute; left: 10px; font-size: .85rem; opacity: .8; pointer-events: none; }
    input { width: 100%; font: inherit; font-size: .88rem; padding: 8px 52px 8px 32px; border-radius: 10px; border: 1px solid rgba(255,255,255,.18);
      background: rgba(0,0,0,.22); color: #fff; outline: none; }
    input::placeholder { color: rgba(255,255,255,.6); }
    input:focus { border-color: var(--primary); background: rgba(0,0,0,.32); }
    kbd { position: absolute; right: 8px; font: 700 .62rem/1 inherit; font-family: inherit; padding: 3px 5px; border-radius: 4px; color: rgba(255,255,255,.7); border: 1px solid rgba(255,255,255,.25); }
    .results { list-style: none; margin: 8px 0 0; padding: 4px; border-radius: 10px; background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,.3); max-height: 60vh; overflow-y: auto; }
    .results button { width: 100%; display: flex; gap: 8px; align-items: flex-start; text-align: left; padding: 7px 8px; border: 0; border-radius: 8px; background: none; font: inherit; cursor: pointer; color: #1d2327; }
    .results button.on { background: #f0f6fc; }
    .ri { flex: none; width: 20px; text-align: center; }
    .rt { display: flex; flex-direction: column; min-width: 0; }
    .rt b { font-size: .85rem; line-height: 1.3; }
    .rt small { font-size: .72rem; color: #646970; }
    .none { padding: 10px; font-size: .82rem; color: #646970; }
  `,
})
export class AdminSearchComponent {
  private readonly router = inject(Router);
  private readonly inp = viewChild<ElementRef<HTMLInputElement>>('inp');
  /** Báo cho layout đóng menu (trên điện thoại) sau khi chọn. */
  readonly picked = output<void>();
  readonly q = signal('');
  readonly sel = signal(0);

  readonly results = computed(() => {
    const words = plain(this.q()).split(' ').filter(Boolean);
    if (!words.length) return [];
    return INDEX.map((e, i) => {
      const hay = HAY[i];
      if (!words.every((w) => hay.includes(w))) return null;
      // Khớp ở tên được ưu tiên hơn khớp ở từ khoá.
      const score = words.reduce((s, w) => s + (plain(e.label).includes(w) ? 2 : 1), 0);
      return { e, score };
    })
      .filter((x): x is { e: Entry; score: number } => !!x)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.e);
  });

  @HostListener('document:keydown', ['$event'])
  onGlobal(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.inp()?.nativeElement.focus();
      this.inp()?.nativeElement.select();
    }
  }

  onKey(e: KeyboardEvent): void {
    const n = this.results().length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.sel.set(n ? (this.sel() + 1) % n : 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.sel.set(n ? (this.sel() - 1 + n) % n : 0);
    } else if (e.key === 'Enter') {
      const r = this.results()[this.sel()];
      if (r) this.go(r);
    } else if (e.key === 'Escape') {
      this.q.set('');
    }
  }

  go(r: Entry): void {
    void this.router.navigate([r.path], { queryParams: r.query ?? {} });
    this.q.set('');
    this.inp()?.nativeElement.blur();
    this.picked.emit();
  }
}

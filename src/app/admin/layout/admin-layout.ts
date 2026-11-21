import { AfterViewInit, Component, DestroyRef, ElementRef, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { animate, stagger } from 'animejs';
import { filter } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { CatalogSyncService } from '../../services/catalog-sync.service';
import { SettingsService } from '../../services/settings.service';
import { AdminToastService } from '../toast.service';
import { AdminInboxService } from '../inbox.service';
import { AdminBellComponent } from './admin-bell';
import { AdminSearchComponent } from './admin-search';
import { IconComponent } from '../../shared/icon';

interface MenuItem {
  icon: string;
  label: string;
  path: string;
  exact?: boolean;
  /** Số hiện trên menu (lời nhắn / đơn mới). */
  badge?: 'messages' | 'orders';
  children?: { label: string; path: string; exact?: boolean }[];
}

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AdminBellComponent, AdminSearchComponent, IconComponent],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
})
export class AdminLayout implements AfterViewInit {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly settings = inject(SettingsService).settings;
  readonly toast = inject(AdminToastService);
  readonly usingDefaultPassword = this.auth.usingDefaultPassword;

  readonly sidebarOpen = signal(false);
  /** Số trang admin đã đi qua trong lần mở này (để biết có trang trước mà quay lại không). */
  private visited = 0;
  readonly canBack = signal(false);

  /** Nút "← Quay lại": về trang admin trước đó; mở thẳng link (chưa có trang trước) thì về Bảng tin. */
  back(): void {
    this.sidebarOpen.set(false);
    if (this.visited > 1 && history.length > 1) history.back();
    else void this.router.navigateByUrl('/admin');
  }
  readonly inbox = inject(AdminInboxService);
  /** Trạng thái lưu sản phẩm / tin tức lên máy chủ. */
  readonly sync = inject(CatalogSyncService);

  /**
   * Ctrl/⌘ + S ở mọi trang admin: bấm nút lưu (đánh dấu `data-save`) gần chỗ đang gõ nhất;
   * trang không có nút lưu riêng → đẩy ngay dữ liệu lên máy chủ. Không bao giờ mở hộp "Lưu trang" của trình duyệt.
   */
  @HostListener('document:keydown', ['$event'])
  onSaveKey(e: KeyboardEvent): void {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 's') return;
    e.preventDefault();
    if (e.repeat) return;
    const focus = document.activeElement;
    const visible = [...document.querySelectorAll<HTMLButtonElement>('button[data-save]')].filter((b) => b.getClientRects().length > 0);
    // Độ "gần": số tầng tổ tiên chung với ô đang gõ (càng sâu càng gần)
    const depth = (el: Element) => {
      let d = 0;
      for (let n: Element | null = el; n; n = n.parentElement) d++;
      return d;
    };
    const near = (b: HTMLButtonElement) => {
      if (!focus || focus === document.body) return 0;
      let a: Element | null = b;
      while (a && !a.contains(focus)) a = a.parentElement;
      return a ? depth(a) : 0;
    };
    let best: HTMLButtonElement | undefined;
    let bestScore = -1;
    for (const b of visible) {
      const s = near(b);
      if (s > bestScore) [best, bestScore] = [b, s];
    }
    if (best) {
      if (best.disabled) this.toast.ok('Chưa có thay đổi nào cần lưu.');
      else best.click();
      return;
    }
    void this.sync.saveNow();
    this.toast.ok('Đã lưu (Ctrl + S).');
  }

  /** Menu chia nhóm cho đỡ rối. */
  readonly groups: { title: string; items: MenuItem[] }[] = [
    {
      title: 'Tổng quan',
      items: [
        { icon: '📊', label: 'Bảng tin', path: '/admin', exact: true },
        { icon: '💰', label: 'Doanh thu', path: '/admin/doanh-thu' },
        { icon: '🚀', label: 'Hiệu suất', path: '/admin/phan-tich' },
        { icon: '📈', label: 'Thống kê truy cập', path: '/admin/thong-ke' },
        { icon: '💾', label: 'Lưu trữ & tên miền', path: '/admin/luu-tru' },
      ],
    },
    {
      title: 'Quản lý bán hàng',
      items: [
        { icon: '🧾', label: 'Đơn hàng', path: '/admin/don-hang', badge: 'orders' },
        {
          icon: '🧸',
          label: 'Sản phẩm',
          path: '/admin/san-pham',
          children: [
            { label: 'Tất cả sản phẩm', path: '/admin/san-pham', exact: true },
            { label: 'Thêm mới', path: '/admin/san-pham/moi', exact: true },
            { label: 'Nhập / xuất Excel', path: '/admin/san-pham/excel', exact: true },
          ],
        },
        { icon: '🗂️', label: 'Danh mục', path: '/admin/danh-muc' },
      ],
    },
    {
      title: 'Quản lý nội dung',
      items: [
        {
          icon: '📰',
          label: 'Tin tức',
          path: '/admin/tin-tuc',
          children: [
            { label: 'Tất cả bài viết', path: '/admin/tin-tuc', exact: true },
            { label: 'Viết bài mới', path: '/admin/tin-tuc/moi', exact: true },
          ],
        },
        { icon: '🎉', label: 'Chủ đề dịp lễ', path: '/admin/chu-de' },
      ],
    },
    {
      title: 'Marketing & tương tác',
      items: [
        { icon: '🔍', label: 'Khai báo SEO', path: '/admin/khai-bao' },
        { icon: '🎮', label: 'Minigame', path: '/admin/minigame' },
        { icon: '🧚', label: 'Người hướng dẫn', path: '/admin/nguoi-huong-dan' },
        { icon: '📣', label: 'Thông báo', path: '/admin/thong-bao' },
        { icon: '⭐', label: 'Đánh giá & voucher', path: '/admin/danh-gia' },
        { icon: '✉️', label: 'Lời nhắn', path: '/admin/lien-he', badge: 'messages' },
      ],
    },
    {
      title: 'Công cụ & hệ thống',
      items: [
        { icon: '🤖', label: 'Trợ lý AI', path: '/admin/tro-ly-ai' },
        { icon: '⚙️', label: 'Cài đặt', path: '/admin/cai-dat' },
      ],
    },
  ];
  /** Danh sách phẳng (dùng cho hiệu ứng / tương thích). */
  readonly menu: MenuItem[] = this.groups.flatMap((g) => g.items);

  constructor() {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed()).subscribe(() => {
      this.visited++;
      this.canBack.set(this.visited > 1 || this.router.url.split(/[?#]/)[0] !== '/admin');
    });
    // Có đơn hàng / lời nhắn mới trong lúc đang mở trang quản trị → hiện thông báo nổi.
    this.inbox.onNew = (items) => {
      const orders = items.filter((n) => n.kind === 'order').length;
      const msgs = items.filter((n) => n.kind === 'contact').length;
      const storage = items.find((n) => n.kind === 'storage');
      if (storage) this.toast.err(storage.title + ' - ' + storage.content);
      const sec = items.filter((n) => n.kind === 'security');
      if (sec.length) this.toast.err(sec.length === 1 ? sec[0].title : `🚨 Có ${sec.length} IP đáng ngờ - xem Cài đặt → Bảo mật`);
      if (orders) this.toast.ok(orders === 1 ? `🔔 ${items.find((n) => n.kind === 'order')!.title}` : `🔔 Có ${orders} đơn hàng mới chờ duyệt`);
      if (msgs) this.toast.ok(msgs === 1 ? `🔔 ${items.find((n) => n.kind === 'contact')!.title}` : `🔔 Có ${msgs} lời nhắn mới`);
    };
    this.inbox.start();
    inject(DestroyRef).onDestroy(() => {
      this.inbox.stop();
      this.inbox.onNew = undefined;
    });
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.sidebarOpen.set(false);
        requestAnimationFrame(() => {
          const page = this.host.querySelector('.adm-page');
          if (page) animate(page, { opacity: [0, 1], translateY: [14, 0], duration: 450, ease: 'outCubic' });
        });
      });
  }

  ngAfterViewInit(): void {
    animate(this.host.querySelectorAll('.side-menu > li'), {
      opacity: [0, 1],
      translateX: [-24, 0],
      delay: stagger(60),
      duration: 500,
      ease: 'outExpo',
    });
  }

  badgeCount(m: MenuItem): number {
    return m.badge === 'messages' ? this.inbox.newMessages() : m.badge === 'orders' ? this.inbox.pendingOrders() : 0;
  }

  isActive(path: string): boolean {
    return this.router.isActive(path, { paths: 'subset', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored' });
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
    if (this.sidebarOpen()) {
      requestAnimationFrame(() =>
        animate(this.host.querySelector('.sidebar')!, { translateX: [-260, 0], duration: 350, ease: 'outCubic' }),
      );
    }
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/admin/dang-nhap']);
  }
}

import { AfterViewInit, Component, ElementRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { animate, stagger } from 'animejs';
import { filter } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { SettingsService } from '../../services/settings.service';
import { AdminToastService } from '../toast.service';

interface MenuItem {
  icon: string;
  label: string;
  path: string;
  exact?: boolean;
  children?: { label: string; path: string; exact?: boolean }[];
}

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
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

  readonly menu: MenuItem[] = [
    { icon: '📊', label: 'Bảng tin', path: '/admin', exact: true },
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
    {
      icon: '📰',
      label: 'Tin tức',
      path: '/admin/tin-tuc',
      children: [
        { label: 'Tất cả bài viết', path: '/admin/tin-tuc', exact: true },
        { label: 'Viết bài mới', path: '/admin/tin-tuc/moi', exact: true },
      ],
    },
    { icon: '🧾', label: 'Đơn hàng', path: '/admin/don-hang' },
    { icon: '🤖', label: 'Trợ lý AI', path: '/admin/tro-ly-ai' },
    { icon: '⚙️', label: 'Cài đặt', path: '/admin/cai-dat' },
  ];

  constructor() {
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

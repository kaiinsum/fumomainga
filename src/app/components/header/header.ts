import { AfterViewInit, Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { animate, createTimeline, stagger } from 'animejs';
import { filter } from 'rxjs';
import { SettingsService } from '../../services/settings.service';
import { ThemeService } from '../../services/theme.service';
import { CartService } from '../../services/cart.service';
import { NotifyBellComponent } from '../notify-bell/notify-bell';
import { IconComponent } from '../../shared/icon';

interface NavItem {
  label: string;
  path: string;
  exact?: boolean;
  /** Mục được làm nổi bật trên menu. */
  hot?: boolean;
}

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, NotifyBellComponent, IconComponent],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class HeaderComponent implements AfterViewInit {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  readonly settings = inject(SettingsService).settings;
  readonly cartCount = inject(CartService).count;
  private readonly theme = inject(ThemeService);
  readonly isDark = computed(() => this.theme.theme() === 'dark');
  private switching = false;

  readonly nav: NavItem[] = [
    { label: 'Trang chủ', path: '/', exact: true },
    { label: 'Sản phẩm', path: '/san-pham' },
    { label: '🎮 Mini game', path: '/mini-game', hot: true },
    { label: 'Tin tức', path: '/tin-tuc' },
    { label: 'Giới thiệu', path: '/gioi-thieu' },
    { label: 'Chính sách', path: '/chinh-sach' },
    { label: 'Liên hệ', path: '/lien-he' },
  ];

  readonly menuOpen = signal(false);
  readonly scrolled = signal(false);

  constructor() {
    inject(Router)
      .events.pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.closeMenu());
  }

  ngAfterViewInit(): void {
    createTimeline({ defaults: { ease: 'outExpo' } })
      .add(this.host.querySelector('.logo')!, { translateY: [-40, 0], opacity: [0, 1], duration: 700 })
      .add(this.host.querySelectorAll('.nav-desktop a'), {
        translateY: [-20, 0],
        opacity: [0, 1],
        duration: 600,
        delay: stagger(70),
      }, '-=450');
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.scrolled.set(window.scrollY > 10);
  }

  wiggleLogo(): void {
    animate(this.host.querySelector('.logo-icon')!, {
      rotate: [0, -15, 12, -8, 0],
      scale: [1, 1.15, 1],
      duration: 700,
      ease: 'outElastic(1, .5)',
    });
  }

  /** Đổi sáng/tối: một vòng tròn màu mới lan ra từ nút bấm (anime.js), rồi đổi giao diện. */
  toggleTheme(event: MouseEvent): void {
    if (this.switching) return;
    const btn = event.currentTarget as HTMLElement;
    const icon = btn.querySelector('.theme-icon');
    const toDark = !this.isDark();

    if (icon) {
      animate(icon, { rotate: [0, toDark ? 360 : -360], scale: [1, 0.6, 1], duration: 700, ease: 'inOut(3)' });
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.theme.toggle();
      return;
    }

    this.switching = true;
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const radius = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy));

    const wipe = document.createElement('div');
    wipe.className = `theme-wipe ${toDark ? 'to-dark' : 'to-light'}`;
    Object.assign(wipe.style, {
      left: `${cx - radius}px`,
      top: `${cy - radius}px`,
      width: `${radius * 2}px`,
      height: `${radius * 2}px`,
      transform: 'scale(0)',
    });
    document.body.appendChild(wipe);

    animate(wipe, {
      scale: [0, 1],
      duration: 650,
      ease: 'inOut(3)',
      onComplete: () => {
        this.theme.toggle();
        animate(wipe, {
          opacity: [1, 0],
          duration: 420,
          ease: 'out(2)',
          onComplete: () => {
            wipe.remove();
            this.switching = false;
          },
        });
      },
    });
  }

  toggleMenu(): void {
    this.menuOpen() ? this.closeMenu() : this.openMenu();
  }

  private openMenu(): void {
    this.menuOpen.set(true);
    // Đợi Angular render menu rồi mới animate.
    requestAnimationFrame(() => {
      const panel = this.host.querySelector('.nav-mobile');
      if (!panel) return;
      animate(panel, { opacity: [0, 1], translateY: [-16, 0], duration: 350, ease: 'outCubic' });
      animate(panel.querySelectorAll('a'), {
        opacity: [0, 1],
        translateX: [-24, 0],
        delay: stagger(60, { start: 80 }),
        duration: 450,
        ease: 'outBack',
      });
    });
  }

  private closeMenu(): void {
    this.menuOpen.set(false);
  }
}

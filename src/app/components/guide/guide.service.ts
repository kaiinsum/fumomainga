import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { gameCategories, resolveGames } from '../../models/minigames';
import { guideOf } from '../../models/site-settings';
import { SettingsService } from '../../services/settings.service';
import { ThemeService } from '../../services/theme.service';

/**
 * Cầu nối giữa nền động (sky-bg) và người hướng dẫn: sky-bg báo vị trí nhân vật đang vẽ,
 * người hướng dẫn báo "đang bay ra ngoài" để nền tạm ẩn nhân vật đó (trông như bay từ nền ra).
 */
export const guideStage: { out: boolean; box: { x: number; y: number; w: number; h: number } | null } = { out: false, box: null };

const SNOOZE_KEY = 'fumo.guide.snoozeUntil';
const ELAPSED_KEY = 'fumo.guide.elapsed';
const ASKED_KEY = 'fumo.guide.asked';
const HUB_HIDE_KEY = 'fumo.guide.hubHidden';

const ls = {
  get(k: string, s: Storage | null = safe(() => localStorage)): string | null {
    try {
      return s?.getItem(k) ?? null;
    } catch {
      return null;
    }
  },
  set(k: string, v: string, s: Storage | null = safe(() => localStorage)): void {
    try {
      s?.setItem(k, v);
    } catch {
      /* bỏ qua */
    }
  },
};
function safe<T>(f: () => T): T | null {
  try {
    return f();
  } catch {
    return null;
  }
}
const session = () => safe(() => sessionStorage);

/** Các bước hội thoại. */
export type GuideStep = 'hidden' | 'ask' | 'yes' | 'no' | 'hub';

/**
 * Người hướng dẫn: Cirno (sáng) / Reimu (tối).
 *  - Khách lướt web ~1–2 phút → bay từ ảnh nền ra hỏi có muốn chơi minigame không.
 *    "Không" → 24 giờ sau mới hỏi lại. "Có" → OK → sang trang Mini game.
 *  - Ở trang Mini game: chào mừng; rê chuột vào từng game thì giới thiệu game đó.
 */
@Injectable({ providedIn: 'root' })
export class GuideService {
  private readonly settings = inject(SettingsService).settings;
  private readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  readonly cfg = computed(() => guideOf(this.settings()));
  readonly dark = computed(() => this.theme.theme() === 'dark');
  readonly name = computed(() => (this.dark() ? this.cfg().darkName : this.cfg().lightName));
  readonly image = computed(() => (this.dark() ? this.cfg().darkImage : this.cfg().lightImage));

  readonly step = signal<GuideStep>('hidden');
  /** Câu đang nói ở trang Mini game (đổi khi rê chuột vào game). */
  readonly hubLine = signal('');
  private path = '';
  private timer?: ReturnType<typeof setInterval>;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    this.path = this.router.url.split(/[?#]/)[0];
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      this.path = (e as NavigationEnd).urlAfterRedirects.split(/[?#]/)[0];
      this.onRoute();
    });
    this.onRoute();
    // Đếm thời gian lướt web (chỉ khi tab đang hiện), lưu theo phiên để tải lại trang vẫn tính tiếp.
    this.timer = setInterval(() => this.tick(), 1000);
  }

  private onRoute(): void {
    const onHub = this.path === '/mini-game';
    if (onHub && this.cfg().enabled && ls.get(HUB_HIDE_KEY, session()) !== '1') {
      this.hubLine.set(this.cfg().hubWelcome);
      this.step.set('hub');
    } else if (this.step() === 'hub' || (this.step() !== 'hidden' && this.path.startsWith('/mini-game'))) {
      this.step.set('hidden');
    }
  }

  private tick(): void {
    if (document.visibilityState !== 'visible' || this.step() !== 'hidden') return;
    const c = this.cfg();
    if (!c.enabled || this.path.startsWith('/mini-game') || this.path.startsWith('/admin') || this.path.startsWith('/gio-hang')) return;
    if (ls.get(ASKED_KEY, session()) === '1') return;
    if (Number(ls.get(SNOOZE_KEY) || 0) > Date.now()) return;
    // Đang mở hộp thoại / ô nhập khác → chờ.
    if (document.querySelector('dialog[open], .modal-open')) return;
    const n = Number(ls.get(ELAPSED_KEY, session()) || 0) + 1;
    ls.set(ELAPSED_KEY, String(n), session());
    if (n >= Math.max(10, c.delaySec || 90)) {
      ls.set(ASKED_KEY, '1', session());
      this.step.set('ask');
    }
  }

  answer(yes: boolean): void {
    if (yes) this.step.set('yes');
    else {
      ls.set(SNOOZE_KEY, String(Date.now() + Math.max(1, this.cfg().snoozeHours || 24) * 3600_000));
      this.step.set('no');
    }
  }

  goPlay(): void {
    this.step.set('hidden');
    void this.router.navigateByUrl('/mini-game');
  }

  close(): void {
    if (this.step() === 'hub') ls.set(HUB_HIDE_KEY, '1', session());
    this.step.set('hidden');
  }

  /** Trang Mini game: khách rê chuột vào 1 game → người hướng dẫn giới thiệu. null = quay lại lời chào. */
  hoverGame(id: string | null): void {
    if (this.step() !== 'hub') return;
    const c = this.cfg();
    if (!id) return this.hubLine.set(c.hubWelcome);
    const custom = c.gameLines[id]?.trim();
    if (custom) return this.hubLine.set(custom);
    const s = this.settings();
    const game = resolveGames(s.minigames).find((g) => g.id === id);
    const cats = gameCategories(s.gameCategories);
    const cat = game?.cats.map((cid) => cats.find((x) => x.id === cid)).find((x) => x?.line);
    this.hubLine.set(cat?.line || `${game?.title ?? 'Trò này'} vui lắm đó, chơi thử nha!`);
  }

  /** Admin xem thử. */
  preview(step: GuideStep): void {
    if (step === 'hub') this.hubLine.set(this.cfg().hubWelcome);
    this.step.set(step);
  }
}

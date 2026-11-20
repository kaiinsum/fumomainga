import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { gameCategories, resolveGames } from '../../models/minigames';
import { guideOf } from '../../models/site-settings';
import { perf } from '../../core/perf';
import { MinigameAccessService } from '../../services/minigame-access.service';
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
const PERF_ASKED_KEY = 'fumo.guide.perfAsked';

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
/** fly: đang bay 1 vòng dẫn đường · intro: vừa tới trang Mini game, đứng giữa màn hình giới thiệu. */
/** slash: khách vừa chém đôi mascot trang chủ → mời chơi Fumo Ninja. */
/** perf: hỏi bật cấu hình cao · perfOff: hỏi lại trước khi tắt · menu: được gọi ra bằng nút triệu hồi · say: nói 1 câu rồi tự ẩn. */
export type GuideStep = 'hidden' | 'ask' | 'yes' | 'no' | 'fly' | 'intro' | 'hub' | 'slash' | 'perf' | 'perfOff' | 'menu' | 'say';

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
  private readonly access = inject(MinigameAccessService);
  /** Câu sẽ nói khi tới trang Mini game (vd. nhắc nhập code). */
  private pendingHubLine = '';

  readonly cfg = computed(() => guideOf(this.settings()));
  readonly dark = computed(() => this.theme.theme() === 'dark');
  readonly name = computed(() => (this.dark() ? this.cfg().darkName : this.cfg().lightName));
  readonly image = computed(() => (this.dark() ? this.cfg().darkImage : this.cfg().lightImage));

  readonly step = signal<GuideStep>('hidden');
  /** Câu đang nói ở trang Mini game (đổi khi rê chuột vào game). */
  readonly hubLine = signal('');
  /** Câu đang nói ở bước 'say'. */
  readonly sayText = signal('');
  /** Đang chạy chế độ nhẹ? (cập nhật khi đổi) */
  readonly lite = signal(perf.lite);
  /** Đường dẫn hiện tại (để ẩn nút triệu hồi trong màn chơi game). */
  readonly route = signal('');
  private path = '';
  private timer?: ReturnType<typeof setInterval>;
  private started = false;
  /** Đang dẫn khách sang trang Mini game. */
  private touring = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    this.path = this.router.url.split(/[?#]/)[0];
    this.route.set(this.path);
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      this.path = (e as NavigationEnd).urlAfterRedirects.split(/[?#]/)[0];
      this.route.set(this.path);
      this.onRoute();
    });
    this.onRoute();
    // Máy yếu (đang ở chế độ nhẹ do web tự đoán / tự đo) → hỏi có muốn bật cấu hình cao không.
    perf.onChange((lite) => {
      this.lite.set(lite);
      if (lite) setTimeout(() => this.askPerf(), 1200);
    });
    setTimeout(() => this.askPerf(), 3500);
    // Đếm thời gian lướt web (chỉ khi tab đang hiện), lưu theo phiên để tải lại trang vẫn tính tiếp.
    this.timer = setInterval(() => this.tick(), 1000);
  }

  private onRoute(): void {
    const onHub = this.path === '/mini-game';
    if (onHub && this.touring) {
      this.touring = false;
      this.step.set('intro');
      return;
    }
    if (this.step() === 'fly' || this.step() === 'intro') return;
    if (onHub && this.pendingHubLine) {
      this.hubLine.set(this.pendingHubLine);
      this.pendingHubLine = '';
      this.step.set('hub');
      return;
    }
    if (this.step() === 'slash' && !onHub) {
      this.step.set('hidden');
      return;
    }
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

  /** Bấm OK: bay 1 vòng (component vẽ) rồi dẫn sang trang Mini game. */
  goPlay(): void {
    this.step.set('fly');
  }

  /** Bay xong vòng → sang trang Mini game, ở đó đứng giữa màn hình giới thiệu. */
  arrive(): void {
    this.touring = true;
    if (this.path === '/mini-game') this.onRoute();
    else void this.router.navigateByUrl('/mini-game');
  }

  /** Giới thiệu xong → thu nhỏ về góc, chuyển sang chế độ chào ở trang Mini game. */
  settle(): void {
    this.hubLine.set(this.cfg().hubWelcome);
    this.step.set('hub');
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

  /** Hỏi bật cấu hình cao (1 lần, chỉ khi web tự chuyển chế độ nhẹ và khách chưa tự chọn). */
  private askPerf(): void {
    const c = this.cfg();
    if (!c.enabled || !c.perfAskEnabled || !perf.lite || perf.forced()) return;
    if (this.step() !== 'hidden' || this.path.startsWith('/admin') || /^\/mini-game\/./.test(this.path)) return;
    if (ls.get(PERF_ASKED_KEY) === '1') return;
    ls.set(PERF_ASKED_KEY, '1');
    this.step.set('perf');
  }

  /** Trả lời "bật cấu hình cao?" — Không thì giữ chế độ nhẹ (và không hỏi lại). */
  answerPerf(yes: boolean): void {
    perf.set(yes ? 'full' : 'lite');
    this.lite.set(perf.lite);
    if (yes) this.say(this.cfg().perfOnReply);
    else this.say('Ok, mình giữ chế độ nhẹ cho mượt nha. Muốn bật thì gọi mình ở nút bên trái!');
  }

  /** Trả lời "tắt cấu hình cao?" */
  answerPerfOff(yes: boolean): void {
    if (yes) {
      perf.set('lite');
      this.lite.set(true);
      this.say(this.cfg().perfOffReply);
    } else this.say('Ok, vẫn giữ hiệu ứng đầy đủ nha~');
  }

  /** Nói 1 câu rồi tự ẩn (component hẹn giờ). */
  say(text: string): void {
    this.sayText.set(text);
    this.step.set('say');
  }

  /** Nút triệu hồi bên trái: gọi người hướng dẫn ra kèm các lựa chọn. */
  summon(): void {
    if (this.step() === 'fly' || this.step() === 'intro') return;
    this.step.set('menu');
  }

  /** Lựa chọn trong menu triệu hồi. */
  menuPick(what: 'play' | 'perf'): void {
    if (what === 'perf') return this.step.set(perf.lite ? 'perf' : 'perfOff');
    if (this.path === '/mini-game') return this.settle();
    this.goPlay();
  }

  /** Fumo Ninja đang mở (không bị admin khoá / ẩn)? */
  ninjaOpen(): boolean {
    return resolveGames(this.settings().minigames).find((g) => g.id === 'ninja')?.status === 'open';
  }

  /** Khách vừa chém đôi mascot trang chủ → mời chơi Fumo Ninja (chỉ khi game đang mở). */
  offerNinja(): boolean {
    const c = this.cfg();
    if (!c.enabled || !c.slashEnabled || !this.ninjaOpen()) return false;
    if (this.step() !== 'hidden' && this.step() !== 'no' && this.step() !== 'ask') return false;
    this.step.set('slash');
    return true;
  }

  /** Trả lời lời mời Fumo Ninja: chơi được ngay → vào game; hôm nay cần code → tới ô nhập code ở trang Mini game. */
  answerNinja(yes: boolean): void {
    if (!yes) return this.step.set('hidden');
    if (this.access.canPlay('ninja')) {
      this.step.set('hidden');
      void this.router.navigateByUrl('/mini-game/fumo-ninja');
      return;
    }
    this.pendingHubLine = this.cfg().slashCode;
    this.step.set('hidden');
    void this.router.navigate(['/mini-game'], { queryParams: { code: 'ninja' } });
  }

  /** Admin xem thử. */
  preview(step: GuideStep): void {
    if (step === 'hub') this.hubLine.set(this.cfg().hubWelcome);
    this.step.set(step);
  }
}

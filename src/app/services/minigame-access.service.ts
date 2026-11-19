import { Injectable, computed, inject, signal } from '@angular/core';
import { dailyFreeIds, dailyPool, resolveGames, rollFor, vnToday } from '../models/minigames';
import { OrderApiService } from './order-api.service';
import { SettingsService } from './settings.service';

const UNLOCK_KEY = 'fumo.minigame.unlock';

function readUnlockDay(): string {
  try {
    return JSON.parse(localStorage.getItem(UNLOCK_KEY) ?? 'null')?.day ?? '';
  } catch {
    return '';
  }
}

/**
 * Quyền chơi minigame trong ngày: mỗi ngày chỉ mở N trò miễn phí (admin chỉnh),
 * nhập đúng code hôm nay thì mở hết đến 23:59 (giờ Việt Nam) — qua ngày mới tự khoá lại.
 */
@Injectable({ providedIn: 'root' })
export class MinigameAccessService {
  private readonly settings = inject(SettingsService).settings;
  private readonly api = inject(OrderApiService);

  /** Đổi mỗi phút để tự nhận ra lúc sang ngày mới khi trang vẫn mở. */
  private readonly tick = signal(Date.now());
  private readonly unlockDay = signal(readUnlockDay());

  readonly today = computed(() => vnToday(this.tick()));
  readonly limit = computed(() => Math.max(0, Math.round(this.settings().minigameDailyFree || 0)));
  /** Đang giới hạn số trò mỗi ngày. */
  readonly limited = computed(() => {
    const pool = dailyPool(resolveGames(this.settings().minigames)).length;
    return this.limit() > 0 && this.limit() < pool;
  });
  readonly unlocked = computed(() => this.unlockDay() === this.today());
  readonly freeIds = computed(() =>
    dailyFreeIds(resolveGames(this.settings().minigames), this.limit(), this.today(), rollFor(this.settings().minigameRoll, this.today())),
  );

  constructor() {
    setInterval(() => this.tick.set(Date.now()), 60_000);
  }

  /** Game này hôm nay chơi được không (chưa tính trạng thái khoá / ẩn của admin). */
  canPlay(id: string): boolean {
    return !this.limited() || this.unlocked() || this.freeIds().has(id);
  }

  /** Gửi code lên máy chủ kiểm tra; đúng → mở hết đến hết ngày. Trả về thông báo lỗi ('' = thành công). */
  async unlock(code: string): Promise<string> {
    try {
      const res = await this.api.call<{ ok: boolean; day: string }>('POST', '/api/minigame', { code }, false, { timeoutMs: 15000 });
      if (!res.ok) return 'Code không đúng.';
      this.unlockDay.set(res.day);
      try {
        localStorage.setItem(UNLOCK_KEY, JSON.stringify({ day: res.day }));
      } catch {
        /* bỏ qua */
      }
      return '';
    } catch (e) {
      return e instanceof Error ? e.message : 'Không kiểm tra được code, thử lại sau nhé.';
    }
  }
}

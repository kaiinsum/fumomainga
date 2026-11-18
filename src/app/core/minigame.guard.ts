import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { resolveGames } from '../models/minigames';
import { SettingsService } from '../services/settings.service';

/**
 * Chặn vào thẳng link của mini game đang bị admin khoá / ẩn → đưa về trang Mini game kèm thông báo.
 * Dùng: canActivate: [minigameGuard('ninja')]
 */
export const minigameGuard =
  (id: string): CanActivateFn =>
  async () => {
    const settings = inject(SettingsService);
    const router = inject(Router);
    // Đợi cài đặt từ máy chủ (tối đa 2,5 giây) để không lỡ cho vào game vừa bị khoá.
    await Promise.race([settings.ready, new Promise((r) => setTimeout(r, 2500))]);
    const game = resolveGames(settings.settings().minigames).find((g) => g.id === id);
    if (!game || game.status === 'open') return true;
    return router.createUrlTree(['/mini-game'], { queryParams: { khoa: id } });
  };

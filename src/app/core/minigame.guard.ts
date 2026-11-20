import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { resolveGames } from '../models/minigames';
import { SettingsService } from '../services/settings.service';

/**
 * Chặn vào thẳng link của mini game đang bị admin khoá / ẩn → đưa về trang Mini game kèm thông báo.
 * Trò cần code hôm nay: cho vào trang, popup nhập code (minigame-gate) hiện đè lên.
 * Dùng: canActivate: [minigameGuard('ninja')]
 */
export const minigameGuard =
  (id: string): CanActivateFn =>
  async () => {
    const settings = inject(SettingsService);
    const router = inject(Router);
    // Đợi cài đặt từ máy chủ (tối đa 6 giây). Máy chủ chậm hơn thế thì vẫn cho vào trang,
    // nhưng <app-minigame-gate> sẽ kiểm tra lại ngay khi cài đặt về và hiện popup nhập code / báo khoá.
    await Promise.race([settings.ready, new Promise((r) => setTimeout(r, 6000))]);
    const game = resolveGames(settings.settings().minigames).find((g) => g.id === id);
    if (game && game.status !== 'open') return router.createUrlTree(['/mini-game'], { queryParams: { khoa: id } });
    // Cần code: vẫn mở trang game, popup nhập code hiện đè lên (nhập đúng là chơi luôn, không phải quay lại).
    return true;
  };

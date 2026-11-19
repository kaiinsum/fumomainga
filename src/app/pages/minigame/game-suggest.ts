import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameArt, resolveGames } from '../../models/minigames';
import { MinigameAccessService } from '../../services/minigame-access.service';
import { SettingsService } from '../../services/settings.service';

const ART_ICON: Record<GameArt, string> = { jp: '⌨️', gacha: '🎁', dle: '🔎', ninja: '🗡️', shmup: '🚀', crush: '💎' };

/** Cuối mỗi trang minigame: gợi ý các trò khác (kèm trạng thái miễn phí / cần code / tạm khoá). */
@Component({
  selector: 'app-game-suggest',
  imports: [RouterLink],
  template: `
    @if (items().length) {
      <section class="container suggest" aria-labelledby="suggest-title">
        <h2 id="suggest-title">🎮 Thử thêm <span>minigame khác</span></h2>
        <div class="list">
          @for (g of items(); track g.id) {
            @if (g.state === 'locked') {
              <div class="item locked" aria-disabled="true">
                <span class="ico" [class]="'ico art-' + g.art">{{ g.icon }}</span>
                <span class="txt"><b>{{ g.title }}</b><small>{{ g.desc }}</small></span>
                <span class="st locked">🔒 Tạm khoá</span>
              </div>
            } @else {
              <a class="item" [routerLink]="g.state === 'code' ? '/mini-game' : g.path"
                [queryParams]="g.state === 'code' ? { code: g.id } : null">
                <span class="ico" [class]="'ico art-' + g.art">{{ g.icon }}</span>
                <span class="txt"><b>{{ g.title }}</b><small>{{ g.desc }}</small></span>
                <span class="st" [class]="'st ' + g.state">{{ label[g.state] }}</span>
              </a>
            }
          }
        </div>
        <p class="all"><a routerLink="/mini-game">Xem tất cả minigame →</a></p>
      </section>
    }
  `,
  styles: `
    .suggest { padding: 8px 0 56px; }
    h2 { font-size: 1.35rem; margin: 0 0 14px; text-align: center; }
    h2 span { color: var(--primary); }
    .list { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; }
    .item {
      display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: 18px; color: var(--text); text-decoration: none;
      background: var(--surface); border: 1.5px solid var(--border); transition: transform .2s, border-color .2s, box-shadow .2s;
    }
    a.item:hover { transform: translateY(-4px); border-color: var(--primary); box-shadow: 0 12px 26px color-mix(in srgb, var(--primary) 22%, transparent); }
    .item.locked { opacity: .55; cursor: not-allowed; }
    .ico { width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; font-size: 1.5rem; background: var(--primary-100); }
    .art-shmup { background: linear-gradient(135deg, #1a0f2e, #2b3d7a); }
    .art-gacha { background: linear-gradient(135deg, #ffd6e7, #ffe9a8); }
    .art-dle { background: linear-gradient(135deg, #dff3ff, #c9e8ff); }
    .art-ninja { background: linear-gradient(135deg, #ffe3c2, #ffc2c2); }
    .art-jp { background: linear-gradient(135deg, #2a1b55, #6b4fd6); }
    .art-crush { background: linear-gradient(135deg, #3b1d6e, #c2185b); }
    .txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .txt b { font-size: 1rem; }
    .txt small { color: var(--muted); font-size: .82rem; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .st { margin-top: auto; align-self: flex-start; font-size: .78rem; font-weight: 800; padding: 4px 12px; border-radius: 999px; background: var(--primary); color: var(--on-primary); }
    .st.free { background: color-mix(in srgb, #3fcf74 22%, var(--surface)); color: #1f8a4c; }
    .st.code { background: #ffb800; color: #3a2a00; }
    .st.locked { background: var(--surface-2); color: var(--muted); }
    .all { text-align: center; margin: 16px 0 0; }
    .all a { color: var(--primary-dark); font-weight: 800; }
    @media (max-width: 600px) {
      .suggest { padding-bottom: 40px; }
      h2 { font-size: 1.1rem; }
      .list { grid-template-columns: 1fr 1fr; gap: 10px; }
      .item { padding: 10px; gap: 6px; border-radius: 14px; }
      .ico { width: 36px; height: 36px; font-size: 1.15rem; border-radius: 11px; }
      .txt b { font-size: .86rem; }
      .txt small { font-size: .72rem; }
      .st { font-size: .66rem; padding: 3px 8px; }
    }
  `,
})
export class GameSuggestComponent {
  /** id của game đang chơi (không gợi ý lại chính nó). */
  readonly current = input.required<string>();
  private readonly settings = inject(SettingsService).settings;
  private readonly access = inject(MinigameAccessService);

  readonly label = { play: '▶ Chơi ngay', free: '🎟 Miễn phí hôm nay', code: '🔑 Cần code hôm nay', locked: '🔒 Tạm khoá' } as const;

  readonly items = computed(() => {
    const limited = this.access.limited() && !this.access.unlocked();
    const free = this.access.freeIds();
    return resolveGames(this.settings().minigames)
      .filter((g) => g.status !== 'hidden' && g.id !== this.current())
      .map((g) => ({
        id: g.id,
        path: g.path,
        title: g.title,
        desc: g.desc,
        art: g.art,
        icon: ART_ICON[g.art],
        state: (g.status === 'locked' ? 'locked' : !limited ? 'play' : free.has(g.id) ? 'free' : 'code') as keyof typeof this.label,
      }))
      // Trò chơi được ngay lên trước.
      .sort((a, b) => ['free', 'play', 'code', 'locked'].indexOf(a.state) - ['free', 'play', 'code', 'locked'].indexOf(b.state));
  });
}

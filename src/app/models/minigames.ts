/**
 * Danh sách mini game + cấu hình admin (khoá / mở / ẩn, thứ tự, tên, nhãn, mô tả).
 * Cấu hình nằm trong SiteSettings → lưu lên máy chủ, mọi khách thấy giống nhau.
 */

export type GameArt = 'shmup' | 'gacha' | 'dle' | 'ninja' | 'jp';

/** open: chơi được · locked: hiện thẻ nhưng khoá · hidden: ẩn hẳn khỏi trang Mini game. */
export type GameStatus = 'open' | 'locked' | 'hidden';

export interface GameDef {
  id: string;
  path: string;
  art: GameArt;
  title: string;
  tag: string;
  desc: string;
  /** Ngày ra mắt mặc định (YYYY-MM-DD) — dùng cho thông báo "Minigame mới". Trống = không thông báo. */
  releasedAt: string;
}

/** Thứ tự ở đây = thứ tự mặc định. Game mới thêm sau sẽ tự nối vào cuối danh sách của admin. */
export const GAMES: GameDef[] = [
  {
    id: 'jp-type',
    path: '/mini-game/go-chu-diet-fumo',
    art: 'jp',
    title: 'Gõ chữ diệt Fumo',
    tag: '⌨️ Gõ chữ · Tiếng Nhật · Mới',
    desc: 'Fumo mang chữ tiếng Nhật rơi từ trời xuống — gõ đúng cách đọc để tiêu diệt, phản đòn boss. 3 mức từ hiragana tới kanji khó!',
    releasedAt: '2026-11-17',
  },
  {
    id: 'gacha',
    path: '/mini-game/tui-mu',
    art: 'gacha',
    title: 'Túi mù may mắn',
    tag: '🎁 Gacha · Mới',
    desc: 'Bóc túi mù xem hôm nay số phận chọn bé thú bông nào cho bạn!',
    releasedAt: '',
  },
  {
    id: 'touhoudle',
    path: '/mini-game/doan-nhan-vat',
    art: 'dle',
    title: 'Đoán nhân vật (Touhoudle)',
    tag: '🔎 Đố vui · Mỗi ngày',
    desc: 'Đoán nhân vật bí ẩn qua chủng loài, game đầu tiên, nơi ở, màu tóc... Mỗi ngày một nhân vật mới!',
    releasedAt: '',
  },
  {
    id: 'ninja',
    path: '/mini-game/fumo-ninja',
    art: 'ninja',
    title: 'Fumo Ninja',
    tag: '🗡️ Chém fumo · Mới',
    desc: 'Vuốt để chém các bé fumo bay lên. Cẩn thận Reimu viền neon đỏ — chém trúng là thua!',
    releasedAt: '',
  },
  {
    id: 'shmup',
    path: '/mini-game/dai-chien-mot-vai',
    art: 'shmup',
    title: 'Đại chiến Mọt Vải',
    tag: '🚀 Bắn đạn · Né đạn',
    desc: 'Né mưa đạn, hạ bầy mọt vải và đánh bại Nữ hoàng Mọt.',
    releasedAt: '',
  },
];

/** Cấu hình admin cho 1 game. Trường để trống = dùng nội dung mặc định. */
export interface GameSetting {
  id: string;
  status: GameStatus;
  title: string;
  tag: string;
  desc: string;
  /** Lời nhắn hiện trên thẻ khi game bị khoá. */
  lockMsg: string;
  /** Ngày ra mắt (YYYY-MM-DD) cho thông báo khách. Trống = ngày mặc định của game. */
  releasedAt?: string;
  /** Nội dung thông báo cho khách. Trống = dùng mô tả ngắn. */
  notice?: string;
}

export const DEFAULT_LOCK_MSG = 'Game đang bảo trì, quay lại sau nhé!';

export const DEFAULT_GAME_SETTINGS: GameSetting[] = GAMES.map((g) => ({ id: g.id, status: 'open', title: '', tag: '', desc: '', lockMsg: '', releasedAt: '', notice: '' }));

/** Một game đã gộp định nghĩa + cấu hình admin, theo đúng thứ tự admin xếp. */
export interface ResolvedGame extends GameDef {
  status: GameStatus;
  lockMsg: string;
  /** Nội dung thông báo cho khách. */
  notice: string;
}

/** Gộp cấu hình admin với danh sách game: giữ thứ tự admin, bỏ game không còn tồn tại, nối game mới vào cuối. */
export function resolveGames(saved: GameSetting[] | undefined): ResolvedGame[] {
  const list = Array.isArray(saved) ? saved : [];
  const seen = new Set<string>();
  const out: ResolvedGame[] = [];
  for (const s of list) {
    const def = GAMES.find((g) => g.id === s?.id);
    if (!def || seen.has(def.id)) continue;
    seen.add(def.id);
    out.push({
      ...def,
      title: s.title?.trim() || def.title,
      tag: s.tag?.trim() || def.tag,
      desc: s.desc?.trim() || def.desc,
      status: s.status === 'locked' || s.status === 'hidden' ? s.status : 'open',
      lockMsg: s.lockMsg?.trim() || DEFAULT_LOCK_MSG,
      releasedAt: s.releasedAt?.trim() || def.releasedAt,
      notice: s.notice?.trim() || s.desc?.trim() || def.desc,
    });
  }
  for (const def of GAMES) if (!seen.has(def.id)) out.push({ ...def, status: 'open', lockMsg: DEFAULT_LOCK_MSG, notice: def.desc });
  return out;
}

/** Danh sách cấu hình đầy đủ (mỗi game một dòng, đúng thứ tự) để trang admin chỉnh. */
export function normalizeGameSettings(saved: GameSetting[] | undefined): GameSetting[] {
  const byId = new Map((Array.isArray(saved) ? saved : []).map((s) => [s?.id, s]));
  return resolveGames(saved).map((g) => {
    const s = byId.get(g.id);
    return {
      id: g.id,
      status: g.status,
      title: s?.title ?? '',
      tag: s?.tag ?? '',
      desc: s?.desc ?? '',
      lockMsg: s?.lockMsg ?? '',
      releasedAt: s?.releasedAt ?? '',
      notice: s?.notice ?? '',
    };
  });
}

/**
 * Danh sách mini game + cấu hình admin (khoá / mở / ẩn, thứ tự, tên, nhãn, mô tả).
 * Cấu hình nằm trong SiteSettings → lưu lên máy chủ, mọi khách thấy giống nhau.
 */

export type GameArt = 'shmup' | 'gacha' | 'dle' | 'ninja' | 'jp' | 'crush' | 'merge' | 'piano';

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
  /** Phân loại mặc định (id trong danh sách phân loại). 1 game được nhiều phân loại. */
  cats: string[];
}

/** Phân loại minigame (admin thêm / sửa được). `line` = câu người hướng dẫn nói khi khách rê chuột vào game thuộc loại này. */
export interface GameCategory {
  id: string;
  name: string;
  icon: string;
  line: string;
}

export const DEFAULT_GAME_CATEGORIES: GameCategory[] = [
  { id: 'giai-tri', name: 'Giải trí', icon: '🎉', line: 'Minigame này chill lắm, vô chơi thử đi!' },
  { id: 'tri-tue', name: 'Trí tuệ', icon: '🧠', line: 'Trò này hơi tốn não đó nha, sẵn sàng chưa?' },
  { id: 'chien-thuat', name: 'Chiến thuật', icon: '♟️', line: 'Minigame này cần chiến thuật đó, bạn chắc chứ?' },
];

/** Danh sách phân loại đang dùng (admin chưa chỉnh → mặc định). */
export const gameCategories = (saved: GameCategory[] | undefined): GameCategory[] =>
  Array.isArray(saved) && saved.length ? saved.filter((c) => c && c.id && c.name) : DEFAULT_GAME_CATEGORIES;

/** Thứ tự ở đây = thứ tự mặc định. Game mới thêm sau sẽ tự nối vào cuối danh sách của admin. */
export const GAMES: GameDef[] = [
  {
    id: 'piano',
    path: '/mini-game/anime-piano',
    art: 'piano',
    title: 'Anime Piano Tiles',
    tag: '🎹 Âm nhạc · Nhịp điệu · Mới',
    desc: 'Tìm bài hát anime / J-pop yêu thích trên YouTube, ô nhạc tự sinh theo bài — gõ trúng nhịp để ăn Perfect và combo!',
    releasedAt: '2026-11-20',
    cats: ['giai-tri'],
  },
  {
    id: 'merge',
    path: '/mini-game/merge-fumo',
    art: 'merge',
    title: 'Merge Fumo',
    tag: '🫧 Thả & gộp · Mới',
    desc: 'Thả các bé fumo vào hộp quà, 2 bé giống nhau chạm nhau sẽ gộp thành bé lớn hơn. Gộp tới Reimu siêu to — đừng để hộp tràn!',
    releasedAt: '2026-11-20',
    cats: ['giai-tri', 'chien-thuat'],
  },
  {
    id: 'crush',
    path: '/mini-game/fumo-crush-saga',
    art: 'crush',
    title: 'Fumo Crush Saga',
    tag: '💎 Ghép fumo · Thủ đền · Mới',
    desc: 'Ghép 3 bé fumo cùng màu để chém, 4 ném bom, 5 bắn laser, 6 tung chiêu đặc biệt — bảo vệ đền Hakurei khỏi lũ yêu quái. Chơi vô tận!',
    releasedAt: '2026-11-19',
    cats: ['giai-tri', 'chien-thuat'],
  },
  {
    id: 'jp-type',
    path: '/mini-game/go-chu-diet-fumo',
    art: 'jp',
    title: 'Gõ chữ diệt Fumo',
    tag: '⌨️ Gõ chữ · Tiếng Nhật · Mới',
    desc: 'Fumo mang chữ tiếng Nhật rơi từ trời xuống — gõ đúng cách đọc để tiêu diệt, phản đòn boss. 3 mức từ hiragana tới kanji khó!',
    releasedAt: '2026-11-17',
    cats: ['tri-tue'],
  },
  {
    id: 'gacha',
    path: '/mini-game/tui-mu',
    art: 'gacha',
    title: 'Túi mù may mắn',
    tag: '🎁 Gacha · Mới',
    desc: 'Bóc túi mù xem hôm nay số phận chọn bé thú bông nào cho bạn!',
    releasedAt: '',
    cats: ['giai-tri'],
  },
  {
    id: 'touhoudle',
    path: '/mini-game/doan-nhan-vat',
    art: 'dle',
    title: 'Đoán nhân vật (Touhoudle)',
    tag: '🔎 Đố vui · Mỗi ngày',
    desc: 'Đoán nhân vật bí ẩn qua chủng loài, game đầu tiên, nơi ở, màu tóc... Mỗi ngày một nhân vật mới!',
    releasedAt: '',
    cats: ['tri-tue'],
  },
  {
    id: 'ninja',
    path: '/mini-game/fumo-ninja',
    art: 'ninja',
    title: 'Fumo Ninja',
    tag: '🗡️ Chém fumo · Mới',
    desc: 'Vuốt để chém các bé fumo bay lên. Cẩn thận Reimu viền neon đỏ — chém trúng là thua!',
    releasedAt: '',
    cats: ['giai-tri'],
  },
  {
    id: 'shmup',
    path: '/mini-game/dai-chien-mot-vai',
    art: 'shmup',
    title: 'Đại chiến Mọt Vải',
    tag: '🚀 Bắn đạn · Né đạn',
    desc: 'Né mưa đạn, hạ bầy mọt vải và đánh bại Nữ hoàng Mọt.',
    releasedAt: '',
    cats: ['giai-tri', 'chien-thuat'],
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
  /** Luôn mở miễn phí mỗi ngày (không cần code). */
  free?: boolean;
  /** Phân loại (id). Không có = dùng mặc định của game. */
  cats?: string[];
}

export const DEFAULT_LOCK_MSG = 'Game đang bảo trì, quay lại sau nhé!';

export const DEFAULT_GAME_SETTINGS: GameSetting[] = GAMES.map((g) => ({ id: g.id, status: 'open', title: '', tag: '', desc: '', lockMsg: '', releasedAt: '', notice: '', free: false, cats: [...g.cats] }));

/** Một game đã gộp định nghĩa + cấu hình admin, theo đúng thứ tự admin xếp. */
export interface ResolvedGame extends GameDef {
  status: GameStatus;
  lockMsg: string;
  /** Nội dung thông báo cho khách. */
  notice: string;
  /** Admin đánh dấu luôn mở miễn phí. */
  free: boolean;
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
      free: !!s.free,
      cats: Array.isArray(s.cats) ? s.cats : def.cats,
    });
  }
  for (const def of GAMES) if (!seen.has(def.id)) out.push({ ...def, status: 'open', lockMsg: DEFAULT_LOCK_MSG, notice: def.desc, free: false });
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
      free: !!s?.free,
      cats: Array.isArray(s?.cats) ? [...s!.cats] : [...g.cats],
    };
  });
}

// ---------- Giới hạn trò chơi miễn phí mỗi ngày ----------

/** Ngày hôm nay theo giờ Việt Nam: 'YYYY-MM-DD' (đổi ngày lúc 0:00 giờ VN). */
export function vnToday(now = Date.now()): string {
  return new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
}

/** Số ngẫu nhiên cố định theo chuỗi (cùng ngày → cùng kết quả trên mọi máy). */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Trò luôn mở miễn phí mỗi ngày, không tính vào giới hạn (Túi mù may mắn). */
export const ALWAYS_FREE_ID = 'gacha';

/** Các trò đang mở được đem đi random theo ngày (trừ trò luôn mở). */
export const dailyPool = (games: ResolvedGame[]): ResolvedGame[] => games.filter((g) => g.status === 'open' && g.id !== ALWAYS_FREE_ID);

/** Lần random lại của admin trong ngày `day` (0 = chưa random lại). */
export const rollFor = (roll: { day: string; n: number } | undefined, day: string): number => (roll?.day === day ? roll.n : 0);

/**
 * Các game được chơi miễn phí trong ngày `day`.
 * limit = 0 → không giới hạn (mọi game đang mở). Túi mù luôn mở (không tính vào limit);
 * game "luôn miễn phí" luôn có mặt; còn lại random theo ngày. `roll` > 0 = admin bấm random lại.
 */
export function dailyFreeIds(games: ResolvedGame[], limit: number, day: string, roll = 0): Set<string> {
  const open = games.filter((g) => g.status === 'open');
  const pool = dailyPool(games);
  if (!limit || limit >= pool.length) return new Set(open.map((g) => g.id));
  const always = open.filter((g) => g.id === ALWAYS_FREE_ID);
  const pinned = pool.filter((g) => g.free);
  const rest = pool.filter((g) => !g.free);
  const rnd = seeded('fumo-free:' + day + (roll ? ':' + roll : ''));
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return new Set([...always, ...pinned, ...rest.slice(0, Math.max(0, limit - pinned.length))].map((g) => g.id));
}

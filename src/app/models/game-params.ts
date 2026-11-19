/**
 * Thông số chỉnh được của từng minigame (Admin → Minigame → ✏️ Sửa thông tin → Thông số trò chơi).
 * Mỗi game có bộ thông số riêng; để mặc định thì game chạy như ban đầu.
 * Lưu trong SiteSettings.gameParams: { [id game]: { [khoá]: số } }.
 */

export interface ParamDef {
  key: string;
  label: string;
  hint?: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  def: number;
}

export const GAME_PARAMS: Record<string, ParamDef[]> = {
  merge: [
    { key: 'cooldown', label: 'Thời gian chờ giữa 2 lần thả', unit: 'giây', min: 0.2, max: 1.5, step: 0.05, def: 0.55, hint: 'Ngắn = thả liên tục được, dễ hơn.' },
    { key: 'dangerTime', label: 'Vượt vạch đỏ bao lâu thì thua', unit: 'giây', min: 1, max: 6, step: 0.5, def: 2 },
    { key: 'gravity', label: 'Trọng lực', unit: '%', min: 50, max: 200, step: 10, def: 100, hint: 'Cao = bé rơi nhanh, nảy ít.' },
    { key: 'topBonus', label: 'Thưởng khi gộp 2 bé lớn nhất', unit: 'điểm', min: 100, max: 5000, step: 100, def: 500 },
  ],
  crush: [
    { key: 'shrineHp', label: 'Máu đền lúc bắt đầu', unit: 'máu', min: 50, max: 500, step: 10, def: 100 },
    { key: 'damage', label: 'Sát thương của người chơi', unit: '%', min: 50, max: 300, step: 10, def: 100 },
    { key: 'enemySpeed', label: 'Tốc độ quái', unit: '%', min: 50, max: 200, step: 10, def: 100 },
    { key: 'bossHp', label: 'Máu boss', unit: '%', min: 50, max: 300, step: 10, def: 100 },
  ],
  ninja: [
    { key: 'lives', label: 'Số bé được để rơi trước khi thua', unit: 'bé', min: 1, max: 10, step: 1, def: 3 },
    { key: 'speed', label: 'Tốc độ bay', unit: '%', min: 50, max: 200, step: 10, def: 100 },
    { key: 'bombRate', label: 'Tần suất Reimu bom', unit: '%', min: 0, max: 300, step: 10, def: 100, hint: '0% = không có bom.' },
  ],
  'jp-type': [
    { key: 'lives', label: 'Số mạng lúc bắt đầu', unit: 'mạng', min: 1, max: 5, step: 1, def: 3 },
    { key: 'fall', label: 'Tốc độ rơi của chữ', unit: '%', min: 50, max: 200, step: 10, def: 100 },
  ],
  shmup: [
    { key: 'lives', label: 'Mạng cộng thêm', unit: 'mạng', min: 0, max: 5, step: 1, def: 0, hint: 'Cộng vào số mạng theo độ khó.' },
    { key: 'bombs', label: 'Bom cộng thêm', unit: 'bom', min: 0, max: 5, step: 1, def: 0 },
  ],
};

/** Thông số đã áp chỉnh sửa của admin (giới hạn trong khoảng cho phép). */
export function gameParams(all: Record<string, Record<string, number>> | undefined, game: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of GAME_PARAMS[game] ?? []) {
    const v = Number(all?.[game]?.[d.key]);
    out[d.key] = Number.isFinite(v) ? Math.min(d.max, Math.max(d.min, v)) : d.def;
  }
  return out;
}

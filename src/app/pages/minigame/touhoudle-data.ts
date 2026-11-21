/**
 * Dữ liệu nhân vật cho "Đoán nhân vật (Touhoudle)".
 * Soạn tay - muốn sửa / thêm nhân vật chỉ cần sửa danh sách CHARACTERS bên dưới.
 *
 * game: số thứ tự game nơi nhân vật XUẤT HIỆN LẦN ĐẦU (xem GAMES).
 * role: vai trò trong game đó - 'Màn 1'...'Màn 6', 'Extra', 'Phantasm', 'Nhân vật chính',
 *       'Chơi được' (game mà mọi nhân vật đều chơi được), 'Trùm cuối' (game đối kháng).
 * species: một hoặc nhiều chủng loài (trùng một phần → ô màu vàng).
 */

export const GAMES: Record<number, string> = {
  1: 'TH1 · Highly Responsive to Prayers',
  2: 'TH2 · Story of Eastern Wonderland',
  5: 'TH5 · Mystic Square',
  6: 'TH6 · Embodiment of Scarlet Devil',
  7: 'TH7 · Perfect Cherry Blossom',
  7.5: 'TH7.5 · Immaterial and Missing Power',
  8: 'TH8 · Imperishable Night',
  9: 'TH9 · Phantasmagoria of Flower View',
  10: 'TH10 · Mountain of Faith',
  10.5: 'TH10.5 · Scarlet Weather Rhapsody',
  11: 'TH11 · Subterranean Animism',
  12: 'TH12 · Undefined Fantastic Object',
  12.5: 'TH12.5 · Double Spoiler',
  13: 'TH13 · Ten Desires',
  14: 'TH14 · Double Dealing Character',
  15: 'TH15 · Legacy of Lunatic Kingdom',
  16: 'TH16 · Hidden Star in Four Seasons',
  17: 'TH17 · Wily Beast and Weakest Creature',
};

export interface Character {
  name: string;
  gender: 'Nữ' | 'Nam';
  species: string[];
  game: number;
  role: string;
  location: string;
  hair: string;
}

const c = (name: string, species: string[], game: number, role: string, location: string, hair: string, gender: Character['gender'] = 'Nữ'): Character => ({
  name,
  gender,
  species,
  game,
  role,
  location,
  hair,
});

export const CHARACTERS: Character[] = [
  // PC-98
  c('Reimu Hakurei', ['Con người'], 1, 'Nhân vật chính', 'Đền Hakurei', 'Đen'),
  c('Marisa Kirisame', ['Con người', 'Pháp sư'], 2, 'Màn 4', 'Rừng Ma Thuật', 'Vàng'),
  c('Alice Margatroid', ['Pháp sư', 'Yêu quái'], 5, 'Màn 3', 'Rừng Ma Thuật', 'Vàng'),
  // TH6
  c('Rumia', ['Yêu quái'], 6, 'Màn 1', 'Không cố định', 'Vàng'),
  c('Daiyousei', ['Tiên'], 6, 'Màn 2', 'Hồ Sương Mù', 'Xanh lá'),
  c('Cirno', ['Tiên'], 6, 'Màn 2', 'Hồ Sương Mù', 'Xanh dương'),
  c('Hong Meiling', ['Yêu quái'], 6, 'Màn 3', 'Hồng Ma Quán', 'Đỏ'),
  c('Koakuma', ['Ác ma'], 6, 'Màn 4', 'Hồng Ma Quán', 'Đỏ'),
  c('Patchouli Knowledge', ['Pháp sư', 'Yêu quái'], 6, 'Màn 4', 'Hồng Ma Quán', 'Tím'),
  c('Sakuya Izayoi', ['Con người'], 6, 'Màn 5', 'Hồng Ma Quán', 'Bạc'),
  c('Remilia Scarlet', ['Ma cà rồng'], 6, 'Màn 6', 'Hồng Ma Quán', 'Xanh nhạt'),
  c('Flandre Scarlet', ['Ma cà rồng'], 6, 'Extra', 'Hồng Ma Quán', 'Vàng'),
  // TH7
  c('Letty Whiterock', ['Yêu quái'], 7, 'Màn 1', 'Không cố định', 'Tím'),
  c('Chen', ['Yêu quái', 'Thức thần'], 7, 'Màn 2', 'Mayohiga', 'Nâu'),
  c('Lunasa Prismriver', ['Linh hồn quấy phá'], 7, 'Màn 4', 'Dinh Thự Prismriver', 'Vàng'),
  c('Merlin Prismriver', ['Linh hồn quấy phá'], 7, 'Màn 4', 'Dinh Thự Prismriver', 'Xanh nhạt'),
  c('Lyrica Prismriver', ['Linh hồn quấy phá'], 7, 'Màn 4', 'Dinh Thự Prismriver', 'Nâu'),
  c('Youmu Konpaku', ['Con người', 'Hồn ma'], 7, 'Màn 5', 'Bạch Ngọc Lâu', 'Bạc'),
  c('Yuyuko Saigyouji', ['Hồn ma'], 7, 'Màn 6', 'Bạch Ngọc Lâu', 'Hồng'),
  c('Ran Yakumo', ['Yêu quái', 'Thức thần'], 7, 'Extra', 'Mayohiga', 'Vàng'),
  c('Yukari Yakumo', ['Yêu quái'], 7, 'Phantasm', 'Không rõ', 'Vàng'),
  // TH7.5
  c('Suika Ibuki', ['Quỷ'], 7.5, 'Trùm cuối', 'Không cố định', 'Cam'),
  // TH8
  c('Wriggle Nightbug', ['Yêu quái'], 8, 'Màn 1', 'Không cố định', 'Xanh lá'),
  c('Mystia Lorelei', ['Yêu quái'], 8, 'Màn 2', 'Không cố định', 'Hồng'),
  c('Keine Kamishirasawa', ['Con người', 'Yêu quái'], 8, 'Màn 3', 'Làng Người', 'Bạc'),
  c('Tewi Inaba', ['Thỏ Trái Đất', 'Yêu quái'], 8, 'Màn 5', 'Eientei', 'Đen'),
  c('Reisen Udongein Inaba', ['Thỏ Mặt Trăng'], 8, 'Màn 5', 'Eientei', 'Tím'),
  c('Eirin Yagokoro', ['Người Mặt Trăng'], 8, 'Màn 6', 'Eientei', 'Bạc'),
  c('Kaguya Houraisan', ['Người Mặt Trăng'], 8, 'Màn 6', 'Eientei', 'Đen'),
  c('Fujiwara no Mokou', ['Con người'], 8, 'Extra', 'Rừng Tre Lạc Lối', 'Trắng'),
  // TH9
  c('Aya Shameimaru', ['Thiên cẩu'], 9, 'Chơi được', 'Núi Yêu Quái', 'Đen'),
  c('Medicine Melancholy', ['Yêu quái'], 9, 'Chơi được', 'Đồi Vô Danh', 'Vàng'),
  c('Komachi Onozuka', ['Tử thần'], 9, 'Chơi được', 'Higan', 'Đỏ'),
  c('Eiki Shiki', ['Diêm vương'], 9, 'Chơi được', 'Higan', 'Xanh lá'),
  // TH10
  c('Shizuha Aki', ['Thần'], 10, 'Màn 1', 'Núi Yêu Quái', 'Vàng'),
  c('Minoriko Aki', ['Thần'], 10, 'Màn 1', 'Núi Yêu Quái', 'Vàng'),
  c('Hina Kagiyama', ['Thần'], 10, 'Màn 2', 'Núi Yêu Quái', 'Xanh lá'),
  c('Nitori Kawashiro', ['Kappa'], 10, 'Màn 3', 'Núi Yêu Quái', 'Xanh dương'),
  c('Momiji Inubashiri', ['Thiên cẩu'], 10, 'Màn 4', 'Núi Yêu Quái', 'Trắng'),
  c('Sanae Kochiya', ['Con người', 'Thần'], 10, 'Màn 5', 'Đền Moriya', 'Xanh lá'),
  c('Kanako Yasaka', ['Thần'], 10, 'Màn 6', 'Đền Moriya', 'Tím'),
  c('Suwako Moriya', ['Thần'], 10, 'Extra', 'Đền Moriya', 'Vàng'),
  // TH10.5
  c('Iku Nagae', ['Yêu quái'], 10.5, 'Chơi được', 'Thiên Giới', 'Tím'),
  c('Tenshi Hinanawi', ['Thiên nhân'], 10.5, 'Trùm cuối', 'Thiên Giới', 'Xanh dương'),
  // TH11
  c('Kisume', ['Yêu quái'], 11, 'Màn 1', 'Địa Ngục Cũ', 'Xanh lá'),
  c('Yamame Kurodani', ['Yêu quái'], 11, 'Màn 1', 'Địa Ngục Cũ', 'Vàng'),
  c('Parsee Mizuhashi', ['Yêu quái'], 11, 'Màn 2', 'Địa Ngục Cũ', 'Vàng'),
  c('Yuugi Hoshiguma', ['Quỷ'], 11, 'Màn 3', 'Địa Ngục Cũ', 'Vàng'),
  c('Satori Komeiji', ['Giác'], 11, 'Màn 4', 'Địa Linh Điện', 'Tím'),
  c('Rin Kaenbyou', ['Hỏa xa', 'Yêu quái'], 11, 'Màn 5', 'Địa Linh Điện', 'Đỏ'),
  c('Utsuho Reiuji', ['Quạ địa ngục', 'Yêu quái'], 11, 'Màn 6', 'Địa Linh Điện', 'Đen'),
  c('Koishi Komeiji', ['Giác'], 11, 'Extra', 'Địa Linh Điện', 'Xanh lá'),
  // TH12
  c('Nazrin', ['Yêu quái'], 12, 'Màn 1', 'Mệnh Liên Tự', 'Xám'),
  c('Kogasa Tatara', ['Phó tang thần'], 12, 'Màn 2', 'Không cố định', 'Xanh dương'),
  c('Ichirin Kumoi', ['Yêu quái'], 12, 'Màn 3', 'Mệnh Liên Tự', 'Xanh dương'),
  c('Minamitsu Murasa', ['Hồn ma'], 12, 'Màn 4', 'Mệnh Liên Tự', 'Đen'),
  c('Shou Toramaru', ['Yêu quái'], 12, 'Màn 5', 'Mệnh Liên Tự', 'Vàng'),
  c('Byakuren Hijiri', ['Pháp sư'], 12, 'Màn 6', 'Mệnh Liên Tự', 'Tím'),
  c('Nue Houjuu', ['Nue', 'Yêu quái'], 12, 'Extra', 'Mệnh Liên Tự', 'Đen'),
  // TH12.5
  c('Hatate Himekaidou', ['Thiên cẩu'], 12.5, 'Chơi được', 'Núi Yêu Quái', 'Nâu'),
  // TH13
  c('Kyouko Kasodani', ['Yêu quái'], 13, 'Màn 2', 'Mệnh Liên Tự', 'Xanh lá'),
  c('Yoshika Miyako', ['Cương thi'], 13, 'Màn 3', 'Lăng Thần Linh', 'Xanh dương'),
  c('Seiga Kaku', ['Tiên nhân'], 13, 'Màn 4', 'Không cố định', 'Xanh dương'),
  c('Soga no Tojiko', ['Hồn ma'], 13, 'Màn 5', 'Lăng Thần Linh', 'Xanh lá'),
  c('Mononobe no Futo', ['Tiên nhân'], 13, 'Màn 5', 'Lăng Thần Linh', 'Bạc'),
  c('Toyosatomimi no Miko', ['Tiên nhân', 'Thánh nhân'], 13, 'Màn 6', 'Lăng Thần Linh', 'Nâu'),
  c('Mamizou Futatsuiwa', ['Yêu quái', 'Tanuki'], 13, 'Extra', 'Không cố định', 'Nâu'),
  // TH14
  c('Wakasagihime', ['Nhân ngư', 'Yêu quái'], 14, 'Màn 1', 'Hồ Sương Mù', 'Xanh dương'),
  c('Sekibanki', ['Yêu quái'], 14, 'Màn 2', 'Làng Người', 'Đỏ'),
  c('Kagerou Imaizumi', ['Người sói', 'Yêu quái'], 14, 'Màn 3', 'Rừng Tre Lạc Lối', 'Nâu'),
  c('Seija Kijin', ['Thiên tà quỷ', 'Yêu quái'], 14, 'Màn 5', 'Lâu Đài Kim Huy', 'Đen'),
  c('Sukuna Shinmyoumaru', ['Tiểu nhân'], 14, 'Màn 6', 'Lâu Đài Kim Huy', 'Tím'),
  c('Raiko Horikawa', ['Phó tang thần'], 14, 'Extra', 'Không cố định', 'Đỏ'),
  // TH15
  c('Seiran', ['Thỏ Mặt Trăng'], 15, 'Màn 1', 'Mặt Trăng', 'Xanh dương'),
  c('Ringo', ['Thỏ Mặt Trăng'], 15, 'Màn 2', 'Mặt Trăng', 'Vàng'),
  c('Doremy Sweet', ['Mộng thú', 'Yêu quái'], 15, 'Màn 3', 'Thế Giới Mộng', 'Xanh dương'),
  c('Sagume Kishin', ['Người Mặt Trăng'], 15, 'Màn 4', 'Mặt Trăng', 'Bạc'),
  c('Clownpiece', ['Tiên'], 15, 'Màn 5', 'Địa Ngục', 'Vàng'),
  c('Junko', ['Thần linh'], 15, 'Màn 6', 'Không cố định', 'Vàng'),
  c('Hecatia Lapislazuli', ['Thần'], 15, 'Extra', 'Địa Ngục', 'Đỏ'),
  // TH16
  c('Eternity Larva', ['Tiên'], 16, 'Màn 1', 'Không cố định', 'Xanh dương'),
  c('Aunn Komano', ['Komainu'], 16, 'Màn 3', 'Đền Hakurei', 'Xanh lá'),
  c('Narumi Yatadera', ['Jizo'], 16, 'Màn 4', 'Rừng Ma Thuật', 'Đen'),
  c('Okina Matara', ['Thần'], 16, 'Màn 6', 'Cõi Sau Cửa', 'Vàng'),
  // TH17
  c('Keiki Haniyasushin', ['Thần'], 17, 'Màn 6', 'Linh Viên Nguyên Thủy', 'Xanh dương'),
  c('Saki Kurokoma', ['Yêu quái'], 17, 'Extra', 'Súc Sinh Giới', 'Đen'),
];

/** Thứ tự màn để so sánh ↑↓ (chỉ áp dụng giữa các màn 1–6, Extra, Phantasm). */
export function stageOrder(role: string): number | null {
  const m = role.match(/^Màn (\d)$/);
  if (m) return Number(m[1]);
  if (role === 'Extra') return 7;
  if (role === 'Phantasm') return 8;
  return null;
}

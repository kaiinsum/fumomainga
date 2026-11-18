/**
 * Từ vựng cho "Gõ chữ diệt Fumo".
 * jp: chữ hiện trên fumo · kana: cách đọc (bỏ trống nếu jp đã là kana) · ro: romaji · vi: nghĩa tiếng Việt.
 * Người chơi gõ romaji (hoặc gõ thẳng chữ Nhật / kana bằng bộ gõ tiếng Nhật).
 */
export interface JpWord {
  jp: string;
  kana?: string;
  ro: string;
  vi: string;
  /** Cách gõ khác cũng chấp nhận (vd: は gõ theo bàn phím là "ha"). */
  alt?: string[];
}

export type JpLevel = 'easy' | 'normal' | 'hard';

const w = (jp: string, ro: string, vi: string, kana?: string): JpWord => ({ jp, ro, vi, kana });

// ---------------- DỄ: bảng chữ hiragana + từ đơn giản ----------------
const HIRA: [string, string][] = [
  ['あ', 'a'], ['い', 'i'], ['う', 'u'], ['え', 'e'], ['お', 'o'],
  ['か', 'ka'], ['き', 'ki'], ['く', 'ku'], ['け', 'ke'], ['こ', 'ko'],
  ['さ', 'sa'], ['し', 'shi'], ['す', 'su'], ['せ', 'se'], ['そ', 'so'],
  ['た', 'ta'], ['ち', 'chi'], ['つ', 'tsu'], ['て', 'te'], ['と', 'to'],
  ['な', 'na'], ['に', 'ni'], ['ぬ', 'nu'], ['ね', 'ne'], ['の', 'no'],
  ['は', 'ha'], ['ひ', 'hi'], ['ふ', 'fu'], ['へ', 'he'], ['ほ', 'ho'],
  ['ま', 'ma'], ['み', 'mi'], ['む', 'mu'], ['め', 'me'], ['も', 'mo'],
  ['や', 'ya'], ['ゆ', 'yu'], ['よ', 'yo'],
  ['ら', 'ra'], ['り', 'ri'], ['る', 'ru'], ['れ', 're'], ['ろ', 'ro'],
  ['わ', 'wa'], ['を', 'wo'], ['ん', 'n'],
];

export const EASY: JpWord[] = [
  ...HIRA.map(([jp, ro]) => w(jp, ro, `chữ "${ro}"`)),
  w('ねこ', 'neko', 'con mèo'),
  w('いぬ', 'inu', 'con chó'),
  w('さくら', 'sakura', 'hoa anh đào'),
  w('すし', 'sushi', 'sushi'),
  w('あめ', 'ame', 'mưa / kẹo'),
  w('そら', 'sora', 'bầu trời'),
  w('うみ', 'umi', 'biển'),
  w('やま', 'yama', 'núi'),
  w('はな', 'hana', 'hoa'),
  w('ほし', 'hoshi', 'ngôi sao'),
  w('つき', 'tsuki', 'mặt trăng'),
  w('ゆき', 'yuki', 'tuyết'),
  w('かわいい', 'kawaii', 'dễ thương'),
  w('ありがとう', 'arigatou', 'cảm ơn'),
  { ...w('こんにちは', 'konnichiwa', 'xin chào'), alt: ['konnichiha'] },
  w('おはよう', 'ohayou', 'chào buổi sáng'),
  w('さよなら', 'sayonara', 'tạm biệt'),
  w('はい', 'hai', 'vâng'),
  w('いいえ', 'iie', 'không'),
  w('みず', 'mizu', 'nước'),
  w('ともだち', 'tomodachi', 'bạn bè'),
  w('ふも', 'fumo', 'fumo'),
  w('たべる', 'taberu', 'ăn'),
  w('のむ', 'nomu', 'uống'),
  w('あか', 'aka', 'màu đỏ'),
  w('あお', 'ao', 'màu xanh'),
  w('しろ', 'shiro', 'màu trắng'),
  w('くろ', 'kuro', 'màu đen'),
  w('おかし', 'okashi', 'bánh kẹo'),
  w('うさぎ', 'usagi', 'con thỏ'),
  w('きつね', 'kitsune', 'con cáo'),
  w('すき', 'suki', 'thích'),
  w('ねむい', 'nemui', 'buồn ngủ'),
];

// ---------------- TRUNG BÌNH: katakana + kanji N5 ----------------
export const NORMAL: JpWord[] = [
  w('アニメ', 'anime', 'phim hoạt hình'),
  w('ゲーム', 'geemu', 'trò chơi'),
  w('コーヒー', 'koohii', 'cà phê'),
  w('テレビ', 'terebi', 'ti vi'),
  w('パン', 'pan', 'bánh mì'),
  w('カメラ', 'kamera', 'máy ảnh'),
  w('ピアノ', 'piano', 'đàn piano'),
  w('ラーメン', 'raamen', 'mì ramen'),
  w('ケーキ', 'keeki', 'bánh kem'),
  w('アイス', 'aisu', 'kem'),
  w('ホテル', 'hoteru', 'khách sạn'),
  w('メロン', 'meron', 'dưa lưới'),
  w('山', 'yama', 'núi', 'やま'),
  w('川', 'kawa', 'sông', 'かわ'),
  w('水', 'mizu', 'nước', 'みず'),
  w('火', 'hi', 'lửa', 'ひ'),
  w('木', 'ki', 'cây', 'き'),
  w('金', 'kane', 'tiền', 'かね'),
  w('日本', 'nihon', 'Nhật Bản', 'にほん'),
  w('学生', 'gakusei', 'học sinh', 'がくせい'),
  w('先生', 'sensei', 'giáo viên', 'せんせい'),
  w('電車', 'densha', 'tàu điện', 'でんしゃ'),
  w('学校', 'gakkou', 'trường học', 'がっこう'),
  w('友達', 'tomodachi', 'bạn bè', 'ともだち'),
  w('天気', 'tenki', 'thời tiết', 'てんき'),
  w('元気', 'genki', 'khoẻ mạnh', 'げんき'),
  w('猫', 'neko', 'con mèo', 'ねこ'),
  w('犬', 'inu', 'con chó', 'いぬ'),
  w('花', 'hana', 'hoa', 'はな'),
  w('雨', 'ame', 'mưa', 'あめ'),
  w('雪', 'yuki', 'tuyết', 'ゆき'),
  w('空', 'sora', 'bầu trời', 'そら'),
  w('月', 'tsuki', 'mặt trăng', 'つき'),
  w('星', 'hoshi', 'ngôi sao', 'ほし'),
  w('人', 'hito', 'người', 'ひと'),
  w('大きい', 'ookii', 'to lớn', 'おおきい'),
  w('小さい', 'chiisai', 'nhỏ bé', 'ちいさい'),
  w('食べる', 'taberu', 'ăn', 'たべる'),
  w('飲む', 'nomu', 'uống', 'のむ'),
  w('見る', 'miru', 'nhìn', 'みる'),
  w('行く', 'iku', 'đi', 'いく'),
  w('来る', 'kuru', 'đến', 'くる'),
  w('本', 'hon', 'quyển sách', 'ほん'),
  w('名前', 'namae', 'tên', 'なまえ'),
  w('時間', 'jikan', 'thời gian', 'じかん'),
  w('東京', 'toukyou', 'Tokyo', 'とうきょう'),
  w('神社', 'jinja', 'đền thần đạo', 'じんじゃ'),
  w('桜', 'sakura', 'hoa anh đào', 'さくら'),
  w('春', 'haru', 'mùa xuân', 'はる'),
  w('夏', 'natsu', 'mùa hè', 'なつ'),
  w('秋', 'aki', 'mùa thu', 'あき'),
  w('冬', 'fuyu', 'mùa đông', 'ふゆ'),
  w('魚', 'sakana', 'con cá', 'さかな'),
  w('肉', 'niku', 'thịt', 'にく'),
  w('車', 'kuruma', 'ô tô', 'くるま'),
  w('駅', 'eki', 'nhà ga', 'えき'),
  w('映画', 'eiga', 'phim', 'えいが'),
  w('音楽', 'ongaku', 'âm nhạc', 'おんがく'),
  w('写真', 'shashin', 'bức ảnh', 'しゃしん'),
  w('部屋', 'heya', 'căn phòng', 'へや'),
  w('家族', 'kazoku', 'gia đình', 'かぞく'),
  w('お茶', 'ocha', 'trà', 'おちゃ'),
];

// ---------------- KHÓ: kanji khó, từ ít gặp + từ Touhou ----------------
export const HARD: JpWord[] = [
  w('薔薇', 'bara', 'hoa hồng', 'ばら'),
  w('檸檬', 'remon', 'quả chanh', 'れもん'),
  w('林檎', 'ringo', 'quả táo', 'りんご'),
  w('葡萄', 'budou', 'quả nho', 'ぶどう'),
  w('挨拶', 'aisatsu', 'chào hỏi', 'あいさつ'),
  w('曖昧', 'aimai', 'mơ hồ', 'あいまい'),
  w('躊躇', 'chuucho', 'do dự', 'ちゅうちょ'),
  w('贅沢', 'zeitaku', 'xa xỉ', 'ぜいたく'),
  w('醤油', 'shouyu', 'xì dầu', 'しょうゆ'),
  w('憂鬱', 'yuuutsu', 'u sầu', 'ゆううつ'),
  w('蜻蛉', 'tonbo', 'chuồn chuồn', 'とんぼ'),
  w('紫陽花', 'ajisai', 'hoa cẩm tú cầu', 'あじさい'),
  w('向日葵', 'himawari', 'hoa hướng dương', 'ひまわり'),
  w('蒲公英', 'tanpopo', 'bồ công anh', 'たんぽぽ'),
  w('雰囲気', "fun'iki", 'bầu không khí', 'ふんいき'),
  w('幻想郷', 'gensoukyou', 'Ảo Tưởng Hương', 'げんそうきょう'),
  w('博麗神社', 'hakureijinja', 'đền Hakurei', 'はくれいじんじゃ'),
  w('紅魔館', 'koumakan', 'Hồng Ma Quán', 'こうまかん'),
  w('白玉楼', 'hakugyokurou', 'Bạch Ngọc Lâu', 'はくぎょくろう'),
  w('弾幕', 'danmaku', 'màn đạn', 'だんまく'),
  w('妖怪', 'youkai', 'yêu quái', 'ようかい'),
  w('巫女', 'miko', 'vu nữ', 'みこ'),
  w('吸血鬼', 'kyuuketsuki', 'ma cà rồng', 'きゅうけつき'),
  w('亡霊', 'bourei', 'vong linh', 'ぼうれい'),
  w('境界', 'kyoukai', 'ranh giới', 'きょうかい'),
  w('妖精', 'yousei', 'tiên nhỏ', 'ようせい'),
  w('魔法使い', 'mahoutsukai', 'pháp sư', 'まほうつかい'),
  w('蝙蝠', 'koumori', 'con dơi', 'こうもり'),
  w('鬱陶しい', 'uttoushii', 'phiền phức', 'うっとうしい'),
  w('顰蹙', 'hinshuku', 'khó chịu, chê bai', 'ひんしゅく'),
  w('齟齬', 'sogo', 'mâu thuẫn', 'そご'),
  w('杞憂', 'kiyuu', 'lo hão', 'きゆう'),
  w('邂逅', 'kaikou', 'tình cờ gặp gỡ', 'かいこう'),
  w('刹那', 'setsuna', 'khoảnh khắc', 'せつな'),
  w('黄昏', 'tasogare', 'hoàng hôn', 'たそがれ'),
  w('陽炎', 'kagerou', 'ảo ảnh hơi nóng', 'かげろう'),
  w('時雨', 'shigure', 'mưa rào cuối thu', 'しぐれ'),
  w('五月雨', 'samidare', 'mưa đầu hạ', 'さみだれ'),
  w('東雲', 'shinonome', 'rạng đông', 'しののめ'),
  w('不知火', 'shiranui', 'lửa ma trên biển', 'しらぬい'),
  w('蜃気楼', 'shinkirou', 'ảo ảnh', 'しんきろう'),
  w('流石', 'sasuga', 'quả nhiên', 'さすが'),
  w('素敵', 'suteki', 'tuyệt vời', 'すてき'),
  w('我儘', 'wagamama', 'ích kỷ, đỏng đảnh', 'わがまま'),
  w('欠伸', 'akubi', 'cái ngáp', 'あくび'),
  w('胡瓜', 'kyuuri', 'dưa chuột', 'きゅうり'),
  w('南瓜', 'kabocha', 'bí ngô', 'かぼちゃ'),
  w('西瓜', 'suika', 'dưa hấu', 'すいか'),
  w('海月', 'kurage', 'con sứa', 'くらげ'),
  w('河豚', 'fugu', 'cá nóc', 'ふぐ'),
  w('秋刀魚', 'sanma', 'cá thu đao', 'さんま'),
  w('土産', 'miyage', 'quà lưu niệm', 'みやげ'),
  w('団扇', 'uchiwa', 'quạt tròn', 'うちわ'),
  w('浴衣', 'yukata', 'áo yukata', 'ゆかた'),
  w('風鈴', 'fuurin', 'chuông gió', 'ふうりん'),
  w('花火', 'hanabi', 'pháo hoa', 'はなび'),
  w('提灯', 'chouchin', 'đèn lồng', 'ちょうちん'),
  w('狐', 'kitsune', 'con cáo', 'きつね'),
  w('狸', 'tanuki', 'con lửng chó', 'たぬき'),
  w('鬼', 'oni', 'con quỷ', 'おに'),
  w('天狗', 'tengu', 'thiên cẩu', 'てんぐ'),
  w('河童', 'kappa', 'thuỷ quái kappa', 'かっぱ'),
  w('龍', 'ryuu', 'con rồng', 'りゅう'),
  w('魑魅魍魎', 'chimimouryou', 'yêu ma quỷ quái', 'ちみもうりょう'),
];

export const WORDS: Record<JpLevel, JpWord[]> = { easy: EASY, normal: NORMAL, hard: HARD };

/**
 * Chuẩn hoá romaji để so sánh dễ dãi: chấp nhận cả kiểu Hepburn (shi, chi, tsu, fu, ja...)
 * lẫn kiểu bàn phím (si, ti, tu, hu, zya...), "nn" = "n", bỏ qua nguyên âm dài (ou / oo / aa...).
 */
export function canon(input: string): string {
  let s = input.toLowerCase().replace(/[^a-z]/g, '');
  s = s
    .replace(/tch/g, 'cch')
    .replace(/shi/g, 'si')
    .replace(/sh/g, 'sy')
    .replace(/chi/g, 'ti')
    .replace(/ch/g, 'ty')
    .replace(/cy/g, 'ty')
    .replace(/tsu/g, 'tu')
    .replace(/fu/g, 'hu')
    .replace(/jy/g, 'zy')
    .replace(/ji/g, 'zi')
    .replace(/j/g, 'zy')
    .replace(/dzu/g, 'zu')
    .replace(/du/g, 'zu')
    .replace(/di/g, 'zi')
    .replace(/wo/g, 'o')
    .replace(/nn/g, 'n')
    .replace(/ou/g, 'o')
    .replace(/([aiueo])\1+/g, '$1');
  return s;
}

/** Bỏ dấu cách / chữ thường hoá cho so sánh chữ Nhật gõ bằng IME. */
const plain = (s: string) => s.replace(/\s+/g, '').trim();

/** Đã gõ đúng hết từ chưa (romaji, kana hoặc chữ Nhật)? */
export function isMatch(word: JpWord, typed: string): boolean {
  const t = plain(typed);
  if (!t) return false;
  if (t === word.jp || (word.kana && t === word.kana)) return true;
  return canon(t) !== '' && [word.ro, ...(word.alt ?? [])].some((r) => canon(t) === canon(r));
}

/** Phần đã gõ có đang đúng hướng với từ này không (để khoá mục tiêu, báo gõ sai). */
export function isPrefix(word: JpWord, typed: string): boolean {
  const t = plain(typed);
  if (!t) return false;
  // Gõ chữ Nhật bằng IME.
  if (/[^\x00-\x7f]/.test(t)) return word.jp.startsWith(t) || (!!word.kana && word.kana.startsWith(t));
  const raw = t.toLowerCase();
  return [word.ro, ...(word.alt ?? [])].some((ro) => {
    if (ro.replace(/'/g, '').startsWith(raw)) return true;
    const target = canon(ro);
    if (target.startsWith(canon(raw))) return true;
    // Đang gõ dở một âm ghép (sh, ch, ts, j, ky...) → thử thêm nguyên âm xem có khớp không.
    return ['a', 'i', 'u', 'e', 'o'].some((v) => target.startsWith(canon(raw + v)));
  });
}

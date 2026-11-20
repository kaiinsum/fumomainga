import { DEFAULT_GAME_CATEGORIES, DEFAULT_GAME_SETTINGS, GameCategory, GameSetting } from './minigames';

export interface AboutValue {
  icon: string;
  title: string;
  text: string;
}

export interface Milestone {
  year: string;
  text: string;
}

/** Một mục trong trang Chính sách (/chinh-sach). */
export interface PolicySection {
  icon: string;
  title: string;
  /** Mỗi dòng là một gạch đầu dòng. */
  text: string;
}

export interface FontOption {
  name: string;
  /** Các độ đậm cần tải từ Google Fonts. */
  weights: number[];
}

/** Chỉ gồm các font Google có bộ ký tự tiếng Việt đầy đủ. */
export const FONT_OPTIONS: FontOption[] = [
  { name: 'Montserrat', weights: [400, 500, 600, 700, 800, 900] },
  { name: 'Nunito', weights: [400, 600, 700, 800, 900] },
  { name: 'Be Vietnam Pro', weights: [400, 500, 600, 700, 800, 900] },
  { name: 'Quicksand', weights: [400, 500, 600, 700] },
  { name: 'Lexend', weights: [400, 500, 600, 700, 800, 900] },
  { name: 'Roboto', weights: [400, 500, 700, 900] },
];

export function googleFontUrl(font: FontOption): string {
  const family = font.name.replace(/ /g, '+');
  return `https://fonts.googleapis.com/css2?family=${family}:wght@${font.weights.join(';')}&display=swap`;
}

/** Thông báo hệ thống admin gửi cho mọi khách. */
export interface Announcement {
  id: string;
  icon: string;
  title: string;
  content: string;
  /** Link khi bấm vào (trong web, vd. /san-pham) — trống = không có. */
  link?: string;
  createdAt: number;
  /** Hết hạn (ms) — trống = không hết hạn. */
  expiresAt?: number;
  /** 'toast' (mặc định): khung nhỏ góc màn hình · 'modal': hộp lớn giữa màn hình như thiệp dịp lễ. */
  type?: 'toast' | 'modal';
  /** Modal: ảnh minh hoạ (link). */
  image?: string;
  /** Modal: nút chính / nút phụ (nút phụ không bắt buộc). Không có link = nút đóng. */
  btn1?: { text: string; link?: string };
  btn2?: { text: string; link?: string };
}

/** Người hướng dẫn bay ra từ ảnh nền: hỏi khách có muốn chơi minigame, chào ở trang Mini game. */
export interface GuideSettings {
  enabled: boolean;
  /** Lướt web bao lâu (giây) thì người hướng dẫn xuất hiện. */
  delaySec: number;
  /** Khách bấm "Không" → bao nhiêu giờ sau mới hỏi lại. */
  snoozeHours: number;
  lightName: string;
  lightImage: string;
  darkName: string;
  darkImage: string;
  askText: string;
  yesLabel: string;
  noLabel: string;
  yesReply: string;
  okLabel: string;
  noReply: string;
  /** Lời chào khi vào trang Mini game. */
  hubWelcome: string;
  /** Câu nói riêng khi rê chuột vào từng game (id game → câu). Trống = câu của phân loại. */
  gameLines: Record<string, string>;
}

export const DEFAULT_GUIDE: GuideSettings = {
  enabled: true,
  delaySec: 90,
  snoozeHours: 24,
  lightName: 'Cirno',
  lightImage: 'bg/cirno.webp',
  darkName: 'Reimu',
  darkImage: 'bg/reimu-1.webp',
  askText: 'Nãy giờ lướt hơi mệt rồi hả, muốn giải trí tí không?',
  yesLabel: 'Có chứ!',
  noLabel: 'Không, cảm ơn',
  yesReply: 'Vậy giờ mình qua minigame nhé!',
  okLabel: 'OK, đi thôi!',
  noReply: 'Vậy bạn cứ tiếp tục tìm hiểu về sản phẩm bên mình nha.',
  hubWelcome: 'Chào mừng đến với minigame! Rê chuột vào trò nào để mình giới thiệu nha~',
  gameLines: {},
};

/** Cấu hình người hướng dẫn (gộp với mặc định). */
export const guideOf = (s: Pick<SiteSettings, 'guide'>): GuideSettings => ({ ...DEFAULT_GUIDE, ...(s.guide ?? {}), gameLines: { ...(s.guide?.gameLines ?? {}) } });

export interface SiteSettings {
  // Chung
  shopName: string;
  logoEmoji: string;
  tagline: string;
  primaryColor: string;
  backgroundColor: string;
  fontFamily: string;
  footerText: string;
  // Trang chủ
  heroBadge: string;
  /** Bọc từ bằng *dấu sao* để tô màu nổi bật. */
  heroTitle: string;
  heroSubtitle: string;
  /** Số "khách hàng vui vẻ" hiện ở trang chủ. */
  happyCustomers?: number;
  /** Số năm kinh nghiệm trên thị trường fumo (trang chủ). */
  yearsExperience?: number;
  // Giới thiệu
  aboutTitle: string;
  aboutIntro: string;
  aboutValues: AboutValue[];
  /** Tiêu đề phần Hành trình. Bọc từ bằng *dấu sao* để tô màu. */
  aboutTimelineTitle: string;
  aboutMilestones: Milestone[];
  // Liên hệ
  contactAddress: string;
  contactPhone: string;
  contactEmail: string;
  contactHours: string;
  // Bong bóng nổi góc phải
  /** Link trang/Messenger Facebook. Trống → ẩn bong bóng. */
  facebookUrl: string;
  /** Link kênh TikTok. Trống → ẩn bong bóng. */
  tiktokUrl: string;
  /** Link gian hàng Shopee. Trống → ẩn bong bóng. */
  shopeeUrl: string;
  /** Hiện bong bóng trợ lý AI. */
  chatEnabled: boolean;
  chatGreeting: string;
  // Chính sách
  policyIntro: string;
  policies: PolicySection[];
  // Thanh toán chuyển khoản (ảnh QR: public/img/qr-thanh-toan.jpg)
  bankAccount: string;
  bankAccountName: string;
  bankName: string;
  // Mini game
  /** Thứ tự + khoá / mở / ẩn + nội dung thẻ của từng mini game. */
  minigames: GameSetting[];
  /** Phân loại minigame (Giải trí, Trí tuệ, Chiến thuật...). */
  gameCategories?: GameCategory[];
  /** Người hướng dẫn (Cirno / Reimu) — Marketing & tương tác → Người hướng dẫn. */
  guide?: GuideSettings;
  /** Hiện thẻ "Game bí mật — Sắp ra mắt" ở cuối danh sách. */
  minigameComingSoon: boolean;
  /** Số trò được chơi miễn phí mỗi ngày (0 = mở tất cả). Có code trong ngày thì mở hết. */
  minigameDailyFree: number;
  /** Chủ đề dịp lễ: '' = tắt · 'auto' = tự động theo lịch · id chủ đề (xem models/seasons.ts). */
  seasonTheme?: string;
  /** Lúc admin bật / đổi chủ đề (cho thông báo khách). */
  seasonChangedAt?: number;
  /** Admin sửa nội dung / ngày / màu / hiệu ứng của từng chủ đề (xem SeasonOverride). */
  seasonOverrides?: import('./seasons').SeasonOverrides;
  /** Dịp lễ admin tự thêm. */
  customSeasons?: import('./seasons').CustomSeason[];
  /** Thông số riêng từng minigame (xem models/game-params.ts). */
  gameParams?: Record<string, Record<string, number>>;
  /** Thông báo hệ thống admin gửi cho khách (hiện trong chuông + thông báo nổi). */
  announcements?: Announcement[];
  /** Admin bấm "Random lại" trong ngày `day` lần thứ n → đổi bộ trò miễn phí hôm nay. */
  minigameRoll?: { day: string; n: number };
  // Thông báo cho khách (chuông trên thanh menu)
  notifyEnabled: boolean;
  /** Sản phẩm / minigame ra mắt trong bao nhiêu ngày gần đây thì hiện thông báo. */
  notifyDays: number;
}

export const DEFAULT_SETTINGS: SiteSettings = {
  shopName: 'Fumo Mai Nga',
  logoEmoji: '🧸',
  tagline: 'Thế giới thú bông dễ thương',
  primaryColor: '#60B5FF',
  /** Sắc rất nhạt của màu chủ đạo — không thêm màu khác. */
  backgroundColor: '#F5FAFF',
  fontFamily: 'Montserrat',
  footerText: 'Nơi trưng bày những bé fumo, móc khóa, figure và phụ kiện dễ thương nhất.',

  heroBadge: '✨ Bộ sưu tập mùa đông 2026',
  heroTitle: 'Thế giới *Fumo* dễ thương',
  happyCustomers: 1200,
  yearsExperience: 3,
  heroSubtitle:
    'Nơi trưng bày thú bông fumo, móc khóa, figure và phụ kiện. Khám phá và tìm bé fumo hợp với bạn nhất.',

  aboutTitle: 'Về chúng tôi',
  aboutIntro:
    'Chúng tôi là một cửa hàng nhỏ dành cho những người yêu thú bông fumo. Mỗi sản phẩm đều được chọn lựa và chụp ảnh kỹ lưỡng để bạn dễ dàng tham khảo.',
  aboutValues: [
    { icon: '🧵', title: 'Chất lượng thủ công', text: 'Mỗi sản phẩm được kiểm tra kỹ đường may và chất liệu.' },
    { icon: '📸', title: 'Hình ảnh thật', text: 'Hình ảnh được chụp và đăng trực tiếp, đúng với sản phẩm.' },
    { icon: '💌', title: 'Tận tâm', text: 'Hỗ trợ tư vấn nhanh chóng, gói quà miễn phí.' },
  ],
  aboutTimelineTitle: 'Hành trình *của chúng tôi*',
  aboutMilestones: [
    { year: '2023', text: 'Bắt đầu với vài bé fumo tự may tặng bạn bè.' },
    { year: '2024', text: 'Mở gian hàng online đầu tiên và có 100 khách hàng.' },
    { year: '2025', text: 'Ra mắt dòng móc khóa và phụ kiện cho fumo.' },
    { year: '2026', text: 'Ra mắt website trưng bày sản phẩm.' },
  ],

  contactAddress: '123 Đường Bông Gòn, Quận 1, TP. Hồ Chí Minh',
  contactPhone: '0900 000 000',
  contactEmail: 'lienhe@fumoshop.vn',
  contactHours: '9:00 – 21:00, Thứ 2 – Chủ nhật',

  facebookUrl: '',
  tiktokUrl: '',
  shopeeUrl: '',
  chatEnabled: true,
  chatGreeting: 'Xin chào! Mình là trợ lý của shop 🧸 Bạn cần tư vấn sản phẩm, giá hay cách đặt hàng không?',

  policyIntro: 'Những điều cần biết khi mua sắm tại shop. Có thắc mắc gì cứ nhắn shop nhé!',
  policies: [
    {
      icon: '🛒',
      title: 'Đặt hàng & thanh toán',
      text: 'Chọn sản phẩm, thêm vào giỏ và điền thông tin nhận hàng.\nThanh toán bằng chuyển khoản qua mã QR hiện ngay khi đặt hàng.\nGửi ảnh giao dịch kèm mã đơn (FMxxxxxx) cho shop qua Facebook / Zalo.\nShop kiểm tra và xác nhận đơn qua điện thoại hoặc email.',
    },
    {
      icon: '🚚',
      title: 'Giao hàng',
      text: 'Giao hàng toàn quốc.\nNội thành TP.HCM 1–2 ngày, tỉnh khác 3–5 ngày.\nPhí ship tính theo đơn vị vận chuyển; miễn phí ship cho đơn từ 500.000đ.\nGói quà miễn phí — ghi chú khi đặt hàng.',
    },
    {
      icon: '🔄',
      title: 'Đổi trả',
      text: 'Đổi trong 7 ngày nếu sản phẩm lỗi đường may hoặc sai mẫu.\nSản phẩm còn nguyên tem, bao bì; vui lòng quay video khi mở hàng.\nShop chịu phí ship đổi hàng khi lỗi từ phía shop.',
    },
    {
      icon: '🧼',
      title: 'Bảo quản fumo',
      text: 'Chải bụi bằng bàn chải mềm mỗi tuần.\nGiặt tay nhẹ với nước ấm và xà phòng dịu, không vắt mạnh.\nPhơi nơi thoáng mát, tránh nắng gắt.',
    },
    {
      icon: '🔒',
      title: 'Bảo mật thông tin',
      text: 'Thông tin khách hàng chỉ dùng để giao hàng và liên hệ về đơn.\nShop không chia sẻ thông tin cho bên thứ ba.',
    },
  ],

  bankAccount: '9021083115251',
  bankAccountName: 'MAI NGA',
  bankName: 'Timo Digital Bank by BVBank',
  minigames: DEFAULT_GAME_SETTINGS,
  gameCategories: DEFAULT_GAME_CATEGORIES,
  guide: undefined,
  minigameComingSoon: true,
  minigameDailyFree: 0,
  notifyEnabled: true,
  notifyDays: 14,
};

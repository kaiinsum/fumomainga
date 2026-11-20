/**
 * Lớp chống spam / DoS ở cổng API (chạy trước mọi handler, KHÔNG tốn truy vấn database):
 *  - Giới hạn số request mỗi IP trong bộ nhớ của function (chặn nhanh 1 máy bắn liên tục).
 *  - Giới hạn riêng cho API tốn kém (chat AI) và API ghi dữ liệu công khai (thống kê, đặt hàng...).
 *  - Giới hạn dung lượng dữ liệu gửi lên.
 * DDoS diện rộng (nhiều máy cùng lúc) do Vercel tự chặn ở tầng mạng; khi bị tấn công nặng
 * bật "Attack Challenge Mode" trong Vercel → Firewall.
 *
 * Lưu ý: bộ nhớ chỉ riêng từng phiên bản function đang chạy (Vercel có thể chạy nhiều bản song song),
 * nên đây là lớp chặn nhanh; các API nhạy cảm còn có giới hạn dùng chung qua database (rateLimit).
 */

interface Bucket {
  n: number;
  reset: number;
}
const buckets = new Map<string, Bucket>();
let lastSweep = 0;

/** true = còn trong hạn mức; false = vượt quá. Cửa sổ cố định `windowMs`. */
export function memLimit(key: string, max: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfter: number } {
  // Dọn bớt khoá đã hết hạn để bộ nhớ không phình ra khi bị bắn từ nhiều IP.
  if (buckets.size > 20_000 || now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k);
  }
  let b = buckets.get(key);
  if (!b || b.reset <= now) {
    b = { n: 0, reset: now + windowMs };
    buckets.set(key, b);
  }
  b.n++;
  return { ok: b.n <= max, retryAfter: Math.max(1, Math.ceil((b.reset - now) / 1000)) };
}

export interface GuardRule {
  /** Đường dẫn sau /api/ */
  path: RegExp;
  /** Chỉ áp cho phương thức này (bỏ trống = mọi phương thức). */
  method?: string;
  max: number;
  windowMs: number;
  /** true = vượt giới hạn thì trả 204 trống (không báo lỗi cho khách — dùng cho thống kê). */
  silent?: boolean;
}

const MIN = 60_000;

/** Giới hạn chung cho mọi API: mỗi IP tối đa 240 request / phút. */
export const GLOBAL_RULE = { max: 240, windowMs: MIN };

/** Giới hạn riêng (tính thêm, ngoài giới hạn chung). */
export const RULES: GuardRule[] = [
  // Chat AI: tốn quota Gemini / Claude.
  { path: /^chat$/, method: 'POST', max: 12, windowMs: MIN },
  // Thống kê: mỗi trang chỉ gửi 1 lượt xem + 1 ping / 30 giây.
  { path: /^analytics$/, method: 'POST', max: 40, windowMs: MIN, silent: true },
  { path: /^orders$/, method: 'POST', max: 10, windowMs: MIN },
  { path: /^orders\/(lookup|confirm)$/, max: 20, windowMs: MIN },
  { path: /^contacts$/, method: 'POST', max: 6, windowMs: MIN },
  { path: /^minigame$/, method: 'POST', max: 15, windowMs: MIN },
  { path: /^admin\/login$/, method: 'POST', max: 10, windowMs: MIN },
  { path: /^leaderboard$/, method: 'POST', max: 6, windowMs: MIN },
];

/** Dung lượng tối đa dữ liệu gửi lên. API admin (đồng bộ sản phẩm, ảnh, kiến thức AI) được phép lớn hơn. */
export const MAX_BODY_PUBLIC = 64 * 1024;
export const MAX_BODY_ADMIN = 4.5 * 1024 * 1024;
export const ADMIN_BODY_PATHS = /^(catalog|settings|ai\/(catalog|knowledge)|orders\/[^/]+|admin\/password|admin\/costs|admin\/notes)$/;

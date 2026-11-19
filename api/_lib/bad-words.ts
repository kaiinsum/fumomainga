/**
 * Lọc tên người chơi trên bảng xếp hạng: chặn từ tục / xúc phạm (tiếng Việt + tiếng Anh) và mạo danh shop.
 * Bản sao ở src/app/shared/bad-words.ts (giao diện báo lỗi ngay) — sửa ở đây thì sửa cả bên đó.
 */

/** Bỏ dấu, chữ thường, đổi số / ký tự giống chữ (0→o, 1→i, 3→e, @→a...), bỏ chữ lặp (fuuuck → fuck). */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[0@4]/g, (c) => ({ '0': 'o', '@': 'a', '4': 'a' })[c]!)
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/[5$]/g, 's')
    .replace(/7/g, 't')
    .replace(/([a-z])\1+/g, '$1');
}

/** Cụm cấm: kiểm tra trong chuỗi đã bỏ hết khoảng trắng / ký tự đặc biệt. */
const CONTAINS = [
  'ditme', 'ditma', 'ditcu', 'ditbo', 'dichme', 'djtme', 'djt', 'dcm', 'dkm', 'dmm', 'dcmm', 'vcl', 'vkl', 'vcc', 'clgt', 'cmm',
  'conmemay', 'mayngu', 'thangngu', 'conchongu', 'occho', 'occac', 'cailon', 'conlon', 'loncon', 'lonme', 'dume', 'duma', 'dumay',
  'dime', 'cutmay', 'chetme', 'nguvl', 'docho', 'thangcho', 'concho', 'sucvat', 'matday', 'phanđong', 'phandong',
  'fuck', 'fuk', 'fck', 'shit', 'bitch', 'dick', 'pussy', 'cunt', 'nigga', 'niger', 'porn', 'asshole', 'motherf', 'fagot',
  'retard', 'hitler', 'nazi', 'whore', 'slut', 'penis', 'vagina', 'xxx',
  // Mạo danh
  'admin', 'quantri', 'moderator',
];

/** Từ ngắn dễ trùng chữ thường → chỉ cấm khi đứng riêng một từ. */
const WORDS = new Set(['dm', 'dmm', 'vl', 'cc', 'cl', 'lon', 'cu', 'buoi', 'deo', 'dit', 'sex', 'fu', 'wtf', 'stfu', 'dcm', 'loz']);

/** Trả về lời báo lỗi, hoặc '' nếu tên hợp lệ. */
export function checkPlayerName(raw: string): string {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length < 2) return 'Tên cần ít nhất 2 ký tự.';
  if (name.length > 20) return 'Tên tối đa 20 ký tự.';
  if (!/^[\p{L}\p{N} _.\-]+$/u.test(name)) return 'Tên chỉ gồm chữ, số, khoảng trắng và _ . -';
  const n = normalizeName(name);
  const compact = n.replace(/[^a-z]/g, '');
  if (CONTAINS.some((w) => compact.includes(w))) return 'Tên có từ không phù hợp, vui lòng đặt tên khác nhé!';
  const words = n.split(/[^a-z]+/).filter(Boolean);
  if (words.some((w) => WORDS.has(w))) return 'Tên có từ không phù hợp, vui lòng đặt tên khác nhé!';
  return '';
}

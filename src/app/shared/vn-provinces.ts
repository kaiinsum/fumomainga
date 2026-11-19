/**
 * Toạ độ (gần đúng, trung tâm tỉnh lỵ) các tỉnh / thành Việt Nam — dùng cho bản đồ nhiệt đơn hàng
 * khi đơn không có vị trí theo IP: đoán tỉnh từ địa chỉ giao hàng.
 * Gồm cả tên cũ (63 tỉnh) và tên gọi phổ biến (Sài Gòn, Vũng Tàu, Nha Trang...).
 */
export interface Province {
  name: string;
  lat: number;
  lon: number;
  /** Các cách viết khác (không dấu, viết tắt, thành phố trực thuộc). */
  alias?: string[];
}

export const VN_PROVINCES: Province[] = [
  { name: 'TP. Hồ Chí Minh', lat: 10.78, lon: 106.7, alias: ['ho chi minh', 'hcm', 'tphcm', 'tp hcm', 'sai gon', 'saigon', 'thu duc', 'go vap', 'binh thanh', 'tan binh', 'binh tan', 'phu nhuan', 'cu chi', 'hoc mon', 'nha be', 'can gio'] },
  { name: 'Hà Nội', lat: 21.03, lon: 105.85, alias: ['ha noi', 'hanoi', 'hn', 'cau giay', 'dong da', 'hoan kiem', 'ha dong', 'long bien', 'thanh xuan', 'hai ba trung', 'nam tu liem', 'bac tu liem', 'hoang mai', 'tay ho', 'ba dinh'] },
  { name: 'Đà Nẵng', lat: 16.05, lon: 108.2, alias: ['da nang', 'danang'] },
  { name: 'Hải Phòng', lat: 20.86, lon: 106.68, alias: ['hai phong'] },
  { name: 'Cần Thơ', lat: 10.03, lon: 105.78, alias: ['can tho'] },
  { name: 'An Giang', lat: 10.38, lon: 105.42, alias: ['an giang', 'long xuyen', 'chau doc'] },
  { name: 'Bà Rịa - Vũng Tàu', lat: 10.35, lon: 107.08, alias: ['ba ria', 'vung tau', 'brvt'] },
  { name: 'Bắc Giang', lat: 21.27, lon: 106.19, alias: ['bac giang'] },
  { name: 'Bắc Kạn', lat: 22.15, lon: 105.83, alias: ['bac kan', 'bac can'] },
  { name: 'Bạc Liêu', lat: 9.29, lon: 105.72, alias: ['bac lieu'] },
  { name: 'Bắc Ninh', lat: 21.18, lon: 106.07, alias: ['bac ninh', 'tu son'] },
  { name: 'Bến Tre', lat: 10.24, lon: 106.38, alias: ['ben tre'] },
  { name: 'Bình Định', lat: 13.78, lon: 109.22, alias: ['binh dinh', 'quy nhon'] },
  { name: 'Bình Dương', lat: 10.98, lon: 106.65, alias: ['binh duong', 'thu dau mot', 'di an', 'thuan an'] },
  { name: 'Bình Phước', lat: 11.53, lon: 106.88, alias: ['binh phuoc', 'dong xoai'] },
  { name: 'Bình Thuận', lat: 10.93, lon: 108.1, alias: ['binh thuan', 'phan thiet'] },
  { name: 'Cà Mau', lat: 9.18, lon: 105.15, alias: ['ca mau'] },
  { name: 'Cao Bằng', lat: 22.67, lon: 106.26, alias: ['cao bang'] },
  { name: 'Đắk Lắk', lat: 12.67, lon: 108.04, alias: ['dak lak', 'daklak', 'dac lac', 'buon ma thuot', 'buon me thuot'] },
  { name: 'Đắk Nông', lat: 12.0, lon: 107.69, alias: ['dak nong', 'gia nghia'] },
  { name: 'Điện Biên', lat: 21.39, lon: 103.02, alias: ['dien bien'] },
  { name: 'Đồng Nai', lat: 10.95, lon: 106.82, alias: ['dong nai', 'bien hoa', 'long khanh'] },
  { name: 'Đồng Tháp', lat: 10.46, lon: 105.63, alias: ['dong thap', 'cao lanh', 'sa dec'] },
  { name: 'Gia Lai', lat: 13.98, lon: 108.0, alias: ['gia lai', 'pleiku'] },
  { name: 'Hà Giang', lat: 22.82, lon: 104.98, alias: ['ha giang'] },
  { name: 'Hà Nam', lat: 20.54, lon: 105.91, alias: ['ha nam', 'phu ly'] },
  { name: 'Hà Tĩnh', lat: 18.34, lon: 105.91, alias: ['ha tinh'] },
  { name: 'Hải Dương', lat: 20.94, lon: 106.33, alias: ['hai duong'] },
  { name: 'Hậu Giang', lat: 9.78, lon: 105.47, alias: ['hau giang', 'vi thanh'] },
  { name: 'Hòa Bình', lat: 20.81, lon: 105.34, alias: ['hoa binh'] },
  { name: 'Hưng Yên', lat: 20.65, lon: 106.05, alias: ['hung yen'] },
  { name: 'Khánh Hòa', lat: 12.24, lon: 109.19, alias: ['khanh hoa', 'nha trang', 'cam ranh'] },
  { name: 'Kiên Giang', lat: 10.01, lon: 105.08, alias: ['kien giang', 'rach gia', 'phu quoc'] },
  { name: 'Kon Tum', lat: 14.35, lon: 108.0, alias: ['kon tum'] },
  { name: 'Lai Châu', lat: 22.4, lon: 103.46, alias: ['lai chau'] },
  { name: 'Lâm Đồng', lat: 11.94, lon: 108.44, alias: ['lam dong', 'da lat', 'dalat', 'bao loc'] },
  { name: 'Lạng Sơn', lat: 21.85, lon: 106.76, alias: ['lang son'] },
  { name: 'Lào Cai', lat: 22.48, lon: 103.97, alias: ['lao cai', 'sa pa', 'sapa'] },
  { name: 'Long An', lat: 10.54, lon: 106.41, alias: ['long an', 'tan an'] },
  { name: 'Nam Định', lat: 20.43, lon: 106.17, alias: ['nam dinh'] },
  { name: 'Nghệ An', lat: 18.67, lon: 105.69, alias: ['nghe an', 'vinh'] },
  { name: 'Ninh Bình', lat: 20.25, lon: 105.97, alias: ['ninh binh'] },
  { name: 'Ninh Thuận', lat: 11.56, lon: 108.99, alias: ['ninh thuan', 'phan rang'] },
  { name: 'Phú Thọ', lat: 21.32, lon: 105.4, alias: ['phu tho', 'viet tri'] },
  { name: 'Phú Yên', lat: 13.09, lon: 109.3, alias: ['phu yen', 'tuy hoa'] },
  { name: 'Quảng Bình', lat: 17.47, lon: 106.62, alias: ['quang binh', 'dong hoi'] },
  { name: 'Quảng Nam', lat: 15.57, lon: 108.47, alias: ['quang nam', 'tam ky', 'hoi an'] },
  { name: 'Quảng Ngãi', lat: 15.12, lon: 108.8, alias: ['quang ngai'] },
  { name: 'Quảng Ninh', lat: 20.95, lon: 107.08, alias: ['quang ninh', 'ha long', 'cam pha', 'mong cai'] },
  { name: 'Quảng Trị', lat: 16.82, lon: 107.1, alias: ['quang tri', 'dong ha'] },
  { name: 'Sóc Trăng', lat: 9.6, lon: 105.97, alias: ['soc trang'] },
  { name: 'Sơn La', lat: 21.33, lon: 103.91, alias: ['son la'] },
  { name: 'Tây Ninh', lat: 11.31, lon: 106.1, alias: ['tay ninh'] },
  { name: 'Thái Bình', lat: 20.45, lon: 106.34, alias: ['thai binh'] },
  { name: 'Thái Nguyên', lat: 21.59, lon: 105.85, alias: ['thai nguyen'] },
  { name: 'Thanh Hóa', lat: 19.81, lon: 105.78, alias: ['thanh hoa'] },
  { name: 'Huế', lat: 16.46, lon: 107.59, alias: ['hue', 'thua thien'] },
  { name: 'Tiền Giang', lat: 10.36, lon: 106.36, alias: ['tien giang', 'my tho'] },
  { name: 'Trà Vinh', lat: 9.93, lon: 106.34, alias: ['tra vinh'] },
  { name: 'Tuyên Quang', lat: 21.82, lon: 105.21, alias: ['tuyen quang'] },
  { name: 'Vĩnh Long', lat: 10.25, lon: 105.97, alias: ['vinh long'] },
  { name: 'Vĩnh Phúc', lat: 21.31, lon: 105.6, alias: ['vinh phuc', 'vinh yen'] },
  { name: 'Yên Bái', lat: 21.72, lon: 104.9, alias: ['yen bai'] },
];

/** Bỏ dấu, chữ thường, gộp khoảng trắng. */
export const plain = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();

const KEYS: { key: string; p: Province }[] = VN_PROVINCES.flatMap((p) => [plain(p.name), ...(p.alias ?? [])].map((key) => ({ key, p })))
  // Khoá dài trước (tránh "vinh" khớp nhầm trong "vinh long").
  .sort((a, b) => b.key.length - a.key.length);

/** Đoán tỉnh / thành từ địa chỉ: lấy tên khớp nằm cuối địa chỉ nhất (tỉnh thường ghi sau cùng). */
export function provinceFromAddress(address: string): Province | null {
  const text = ` ${plain(address)} `;
  let best: { p: Province; at: number } | null = null;
  for (const { key, p } of KEYS) {
    const at = text.lastIndexOf(` ${key} `);
    if (at >= 0 && (!best || at > best.at)) best = { p, at };
  }
  return best?.p ?? null;
}

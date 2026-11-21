/** Màu gốc của bảng màu đơn sắc (#60B5FF ≈ hsl(208, 100%, 69%)). */
const HUE = 208;

/** Một sắc của màu chủ đạo theo độ sáng (0–100). */
const shade = (lightness: number, sat = 100) => `hsl(${HUE}, ${sat}%, ${lightness}%)`;

/**
 * Tạo ảnh SVG placeholder (data URI) cho dữ liệu mẫu - chỉ dùng các sắc của #60B5FF,
 * trắng và xanh đậm, không thêm màu khác. `variant` thay đổi độ sáng/bố cục cho mỗi ảnh.
 */
export function placeholderImage(label: string, variant = 0): string {
  label = label.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const v = Math.abs(variant) % 6;
  const bg1 = shade(95 - v * 2);
  const bg2 = shade(82 - v * 3);
  const body = shade(69 - v * 3);
  const hair = shade(28 + v * 3, 70);
  const ink = shade(18, 60);
  const offset = (v % 3) * 18;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs>
  <rect width="400" height="400" fill="url(#g)"/>
  <circle cx="${70 + offset}" cy="70" r="40" fill="#fff" opacity=".45"/>
  <circle cx="${340 - offset}" cy="330" r="60" fill="#fff" opacity=".3"/>
  <ellipse cx="200" cy="300" rx="95" ry="70" fill="${body}"/>
  <circle cx="200" cy="185" r="105" fill="#fff"/>
  <path d="M95 185 Q100 70 200 72 Q300 70 305 185 Q270 120 200 125 Q130 120 95 185Z" fill="${hair}"/>
  <ellipse cx="160" cy="200" rx="14" ry="20" fill="${ink}"/>
  <ellipse cx="240" cy="200" rx="14" ry="20" fill="${ink}"/>
  <circle cx="165" cy="193" r="5" fill="#fff"/><circle cx="245" cy="193" r="5" fill="#fff"/>
  <ellipse cx="140" cy="232" rx="16" ry="8" fill="${shade(85)}"/>
  <ellipse cx="260" cy="232" rx="16" ry="8" fill="${shade(85)}"/>
  <path d="M190 236 Q200 245 210 236" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/>
  <text x="200" y="385" font-family="Montserrat, 'Segoe UI', Arial, sans-serif" font-size="24" font-weight="800" text-anchor="middle" fill="${ink}">${label}</text>
</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

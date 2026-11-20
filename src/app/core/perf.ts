/**
 * Chế độ hiệu ứng theo cấu hình máy.
 * - Điện thoại / máy yếu / tiết kiệm dữ liệu / "giảm chuyển động" → chế độ NHẸ (html.lite): bớt hạt, 30fps, tắt blur & animation trang trí.
 * - Máy tính bình thường → giữ nguyên hiệu ứng; nếu đo thấy chạy giật (< 45 khung hình/giây) thì tự chuyển sang nhẹ.
 * - Ép chế độ để thử: localStorage 'fumo.perf' = 'lite' | 'full'.
 */

const KEY = 'fumo.perf';
type Listener = (lite: boolean) => void;

interface NavigatorExtra {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

function forced(): 'lite' | 'full' | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'lite' || v === 'full' ? v : null;
  } catch {
    return null;
  }
}

/** Đoán ban đầu (chưa cần đo): điện thoại, CPU ≤ 4 luồng, RAM ≤ 4GB, tiết kiệm dữ liệu, giảm chuyển động. */
function guessLite(): boolean {
  const nav = navigator as Navigator & NavigatorExtra;
  // Điện thoại / máy tính bảng: chỉ có cảm ứng (không chuột) hoặc trình duyệt tự báo là thiết bị di động.
  // (Không dựa vào kích thước màn hình — laptop 1366×768 vẫn là máy tính bình thường.)
  const uaMobile = (nav as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile ?? /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const mobile = uaMobile || matchMedia('(hover: none) and (pointer: coarse)').matches;
  const weakCpu = (nav.hardwareConcurrency || 8) <= 4;
  const lowMem = (nav.deviceMemory ?? 8) <= 4;
  const saveData = !!nav.connection?.saveData;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  return mobile || weakCpu || lowMem || saveData || reduced;
}

const listeners = new Set<Listener>();

export const perf = {
  lite: false,
  /** Khách đã tự chọn chế độ (không còn tự đoán / tự đo). */
  forced(): 'lite' | 'full' | null {
    return forced();
  },
  /** Khách chọn: 'full' = cấu hình cao (hiệu ứng đầy đủ), 'lite' = chế độ nhẹ. Áp dụng ngay, nhớ cho lần sau. */
  set(mode: 'lite' | 'full'): void {
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* bỏ qua */
    }
    setLite(mode === 'lite');
    // Nền động / hiệu ứng canvas tính lại số hạt & độ nét theo chế độ mới.
    dispatchEvent(new Event('resize'));
  },
  /** Đăng ký nhận thay đổi chế độ (vd. đo được máy giật). Trả về hàm huỷ. */
  onChange(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

function setLite(on: boolean): void {
  if (perf.lite === on) return;
  perf.lite = on;
  document.documentElement.classList.toggle('lite', on);
  listeners.forEach((fn) => fn(on));
}

/** Đo tốc độ khung hình trong ~2 giây (khi tab đang hiện); dưới 45fps → chế độ nhẹ. */
function probeFps(): void {
  let frames = 0;
  let start = 0;
  const step = (t: number) => {
    if (document.hidden) {
      // Tab bị ẩn: đo lại khi quay lại.
      document.addEventListener('visibilitychange', () => setTimeout(probeFps, 1500), { once: true });
      return;
    }
    if (!start) start = t;
    frames++;
    if (t - start < 2000) {
      requestAnimationFrame(step);
      return;
    }
    const fps = (frames * 1000) / (t - start);
    if (fps < 45) setLite(true);
  };
  requestAnimationFrame(step);
}

/** Gọi một lần khi khởi động (trước khi vẽ giao diện). */
export function initPerf(): void {
  const f = forced();
  setLite(f ? f === 'lite' : guessLite());
  // Máy tính "trông có vẻ khoẻ" → đo thật sau khi trang đã chạy hiệu ứng được một lúc.
  if (!f && !perf.lite) setTimeout(probeFps, 3000);
}

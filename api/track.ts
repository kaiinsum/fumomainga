/**
 * /api/track — trình duyệt của khách báo: mở trang (view) hoặc vẫn đang xem (ping, ~30 giây/lần).
 * Công khai, không bao giờ báo lỗi cho khách (thống kê hỏng không được làm hỏng trang web).
 */
import { clientIp, getStore, handle } from './_lib/orders';

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|uptime/i;
const empty = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export const POST = handle(async (req) => {
  const ua = (req.headers.get('user-agent') ?? '').slice(0, 300);
  if (!ua || BOT.test(ua)) return empty();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return empty();
  }
  const vid = str(body['vid'], 64);
  const path = str(body['path'], 200) || '/';
  if (!/^[A-Za-z0-9-]{8,64}$/.test(vid) || !path.startsWith('/') || path.startsWith('/admin')) return empty();

  const store = getStore().analytics;
  if (!store) return empty();
  const rawIp = (req.headers.get('x-real-ip') || clientIp(req)).slice(0, 64);
  const ip = rawIp === 'unknown' ? '' : rawIp;
  const ping = store.ping({ vid, path, ip, ua });
  try {
    if (body['t'] === 'view') {
      await Promise.all([
        ping,
        store.view({ vid, sid: str(body['sid'], 64), path, ip, ua, ref: str(body['ref'], 300) }),
      ]);
    } else {
      await ping;
    }
    // Thỉnh thoảng dọn khách online đã rời đi hơn 1 ngày.
    if (Math.random() < 0.02) await store.cleanup(Date.now() - 86_400_000);
  } catch (e) {
    console.error('track:', e instanceof Error ? e.message : e);
  }
  return empty();
});

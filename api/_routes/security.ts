/**
 * /api/admin/security - chặn IP & IP đáng ngờ (chỉ admin).
 *  GET  → { blocked, suspects }
 *  POST { action: 'block', ip, reason?, hours? } | { action: 'unblock', ip } → { blocked }
 */
import { HttpError, clientIp, handle, json, readJson, requireAdmin } from '../_lib/orders';
import { blockIp, blocklist, safeIps, suspects, unblockAll, unblockIp, validIp } from '../_lib/security';

/** Tra vị trí ước tính của 1 IP (ipwho.is - miễn phí, không cần key). Lưu tạm trong bộ nhớ 1 ngày. */
const geoCache = new Map<string, { at: number; data: unknown }>();
const PRIVATE_IP = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|fc|fd|fe80)/i;

async function ipGeo(ip: string) {
  if (PRIVATE_IP.test(ip)) return { ip, private: true };
  const hit = geoCache.get(ip);
  if (hit && Date.now() - hit.at < 86_400_000) return hit.data;
  const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,message,ip,country,country_code,region,city,latitude,longitude,connection`);
  if (!r.ok) throw new HttpError(502, 'Không tra được vị trí IP, thử lại sau.');
  const j = (await r.json()) as {
    success?: boolean;
    message?: string;
    country?: string;
    country_code?: string;
    region?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
    connection?: { isp?: string; org?: string; asn?: number };
  };
  if (!j.success) throw new HttpError(400, j.message === 'Invalid IP address' ? 'IP không hợp lệ.' : 'Không tra được vị trí IP này.');
  const data = {
    ip,
    country: j.country ?? '',
    countryCode: j.country_code ?? '',
    region: j.region ?? '',
    city: j.city ?? '',
    lat: j.latitude ?? null,
    lon: j.longitude ?? null,
    isp: j.connection?.isp || j.connection?.org || '',
    asn: j.connection?.asn ?? null,
  };
  geoCache.set(ip, { at: Date.now(), data });
  if (geoCache.size > 500) geoCache.delete(geoCache.keys().next().value!);
  return data;
}

export const GET = handle(async (req) => {
  await requireAdmin(req);
  // ?geo=<ip> → vị trí ước tính của IP (hiện bản đồ Google Maps ở tab Bảo mật).
  const geo = new URL(req.url).searchParams.get('geo');
  if (geo !== null) {
    const ip = geo.trim();
    if (!validIp(ip)) throw new HttpError(400, 'Địa chỉ IP không hợp lệ.');
    return json(await ipGeo(ip));
  }
  const [blocked, list] = await Promise.all([blocklist(true), suspects()]);
  return json({ blocked, suspects: list, myIp: clientIp(req), safeIps: [...safeIps()], blocklistOff: /^(1|true|yes|on)$/i.test(process.env['BLOCKLIST_OFF'] ?? '') });
});

export const POST = handle(async (req) => {
  await requireAdmin(req);
  const body = await readJson(req);
  if (body['action'] === 'unblock-all') return json({ blocked: await unblockAll() });
  const ip = typeof body['ip'] === 'string' ? body['ip'].trim() : '';
  if (!validIp(ip)) throw new HttpError(400, 'Địa chỉ IP không hợp lệ.');
  if (body['action'] === 'unblock') return json({ blocked: await unblockIp(ip) });
  if (body['action'] !== 'block') throw new HttpError(400, 'Thao tác không hợp lệ.');
  if (ip === clientIp(req)) throw new HttpError(400, 'Đây là IP của chính bạn - không thể tự chặn mình.');
  if (safeIps().has(ip)) throw new HttpError(400, 'IP này nằm trong danh sách an toàn (ADMIN_SAFE_IPS) - không chặn được.');
  const hours = Math.max(0, Math.min(24 * 365, Math.round(Number(body['hours']) || 0)));
  const reason = typeof body['reason'] === 'string' ? body['reason'].trim() : '';
  return json({ blocked: await blockIp(ip, reason, hours) });
});

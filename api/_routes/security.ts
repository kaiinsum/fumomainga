/**
 * /api/admin/security — chặn IP & IP đáng ngờ (chỉ admin).
 *  GET  → { blocked, suspects }
 *  POST { action: 'block', ip, reason?, hours? } | { action: 'unblock', ip } → { blocked }
 */
import { HttpError, clientIp, handle, json, readJson, requireAdmin } from '../_lib/orders';
import { blockIp, blocklist, safeIps, suspects, unblockAll, unblockIp, validIp } from '../_lib/security';

export const GET = handle(async (req) => {
  await requireAdmin(req);
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
  if (ip === clientIp(req)) throw new HttpError(400, 'Đây là IP của chính bạn — không thể tự chặn mình.');
  if (safeIps().has(ip)) throw new HttpError(400, 'IP này nằm trong danh sách an toàn (ADMIN_SAFE_IPS) — không chặn được.');
  const hours = Math.max(0, Math.min(24 * 365, Math.round(Number(body['hours']) || 0)));
  const reason = typeof body['reason'] === 'string' ? body['reason'].trim() : '';
  return json({ blocked: await blockIp(ip, reason, hours) });
});

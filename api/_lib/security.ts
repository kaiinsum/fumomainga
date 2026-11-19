/**
 * Bảo mật: chặn IP thủ công + ghi lại IP spam (bị giới hạn tốc độ) để admin xem và chặn.
 *  - Danh sách chặn: app_kv 'security:blocklist' (đọc lại tối đa mỗi 20 giây / bản function).
 *  - Sự kiện spam: app_kv 'security:events' (mỗi IP + loại + đường dẫn ghi tối đa 1 lần / 2 phút, giữ 500 dòng).
 *  - Nhập sai mật khẩu admin: lấy từ lịch sử đăng nhập 'admin:logins'.
 * Lưu ý: chặn ở đây áp cho mọi API (đặt hàng, chat AI, liên hệ, đăng nhập...). Muốn chặn cả việc xem trang web
 * thì thêm IP vào Vercel → Firewall.
 */
import { getStore } from './orders';

const BLOCK_KEY = 'security:blocklist';
const EVENT_KEY = 'security:events';
const LOGIN_KEY = 'admin:logins';
const MAX_EVENTS = 500;

export interface BlockedIp {
  ip: string;
  reason: string;
  at: number;
  /** Hết hạn chặn (ms) — trống = chặn vĩnh viễn. */
  until?: number;
}

export interface SecurityEvent {
  ip: string;
  kind: 'rate';
  path: string;
  at: number;
}

export interface Suspect {
  ip: string;
  /** Số lần bị chặn vì gửi quá nhanh (24 giờ qua). */
  rateHits: number;
  /** Số lần nhập sai mật khẩu admin (24 giờ qua). */
  loginFails: number;
  paths: string[];
  last: number;
  blocked: boolean;
  level: 'warn' | 'danger';
}

export const validIp = (ip: string) => /^[0-9a-fA-F:.]{3,45}$/.test(ip) && /[.:]/.test(ip);

let cache: { at: number; map: Map<string, BlockedIp> } | null = null;

/** Danh sách IP đang bị chặn (đã bỏ mục hết hạn). */
export async function blocklist(fresh = false): Promise<BlockedIp[]> {
  const list = (await getStore().getJson<BlockedIp[]>(BLOCK_KEY)) ?? [];
  const now = Date.now();
  const live = list.filter((b) => !b.until || b.until > now);
  if (fresh || live.length !== list.length) cache = { at: now, map: new Map(live.map((b) => [b.ip, b])) };
  return live;
}

/** IP có đang bị chặn không (bộ nhớ đệm 20 giây; lỗi database thì không chặn). */
export async function isBlocked(ip: string): Promise<BlockedIp | null> {
  if (!ip || ip === 'unknown') return null;
  const now = Date.now();
  if (!cache || now - cache.at > 20_000) {
    try {
      await blocklist(true);
    } catch {
      cache = { at: now, map: cache?.map ?? new Map() };
    }
  }
  const b = cache!.map.get(ip);
  return b && (!b.until || b.until > now) ? b : null;
}

export async function blockIp(ip: string, reason: string, hours: number): Promise<BlockedIp[]> {
  const list = (await blocklist(true)).filter((b) => b.ip !== ip);
  const item: BlockedIp = { ip, reason: reason.slice(0, 120) || 'Chặn thủ công', at: Date.now(), ...(hours > 0 ? { until: Date.now() + hours * 3600_000 } : {}) };
  const next = [item, ...list].slice(0, 1000);
  await getStore().setJson(BLOCK_KEY, next);
  cache = { at: Date.now(), map: new Map(next.map((b) => [b.ip, b])) };
  return next;
}

export async function unblockIp(ip: string): Promise<BlockedIp[]> {
  const next = (await blocklist(true)).filter((b) => b.ip !== ip);
  await getStore().setJson(BLOCK_KEY, next);
  cache = { at: Date.now(), map: new Map(next.map((b) => [b.ip, b])) };
  return next;
}

const lastRecorded = new Map<string, number>();

/** Ghi 1 lần IP bị giới hạn tốc độ (bỏ qua nếu vừa ghi cùng IP + đường dẫn trong 2 phút). */
export async function recordRateHit(ip: string, path: string): Promise<void> {
  if (!ip || ip === 'unknown') return;
  const key = `${ip}|${path}`;
  const now = Date.now();
  if (now - (lastRecorded.get(key) ?? 0) < 120_000) return;
  lastRecorded.set(key, now);
  if (lastRecorded.size > 5000) for (const [k, t] of lastRecorded) if (now - t > 120_000) lastRecorded.delete(k);
  try {
    const store = getStore();
    const list = (await store.getJson<SecurityEvent[]>(EVENT_KEY)) ?? [];
    await store.setJson(EVENT_KEY, [{ ip, kind: 'rate', path, at: now } satisfies SecurityEvent, ...list].slice(0, MAX_EVENTS));
  } catch (e) {
    console.error('Không ghi được sự kiện bảo mật', e);
  }
}

/** IP đáng ngờ trong 24 giờ qua: bị giới hạn tốc độ ≥ 2 lần hoặc nhập sai mật khẩu admin ≥ 3 lần. */
export async function suspects(): Promise<Suspect[]> {
  const store = getStore();
  const since = Date.now() - 86_400_000;
  const [events, logins, blocked] = await Promise.all([
    store.getJson<SecurityEvent[]>(EVENT_KEY).then((x) => x ?? []),
    store.getJson<{ kind: string; at: number; ip: string }[]>(LOGIN_KEY).then((x) => x ?? []),
    blocklist(),
  ]);
  const map = new Map<string, Suspect>();
  const get = (ip: string) => {
    let s = map.get(ip);
    if (!s) map.set(ip, (s = { ip, rateHits: 0, loginFails: 0, paths: [], last: 0, blocked: false, level: 'warn' }));
    return s;
  };
  for (const e of events) {
    if (e.at < since) continue;
    const s = get(e.ip);
    s.rateHits++;
    if (!s.paths.includes(e.path) && s.paths.length < 6) s.paths.push(e.path);
    s.last = Math.max(s.last, e.at);
  }
  for (const l of logins) {
    if (l.kind !== 'fail' || l.at < since || !l.ip || l.ip === 'unknown') continue;
    const s = get(l.ip);
    s.loginFails++;
    if (!s.paths.includes('admin/login') && s.paths.length < 6) s.paths.push('admin/login');
    s.last = Math.max(s.last, l.at);
  }
  const blockedSet = new Set(blocked.map((b) => b.ip));
  return [...map.values()]
    .filter((s) => s.rateHits >= 2 || s.loginFails >= 3)
    .map((s) => ({ ...s, blocked: blockedSet.has(s.ip), level: (s.rateHits >= 6 || s.loginFails >= 6 ? 'danger' : 'warn') as Suspect['level'] }))
    .sort((a, b) => b.last - a.last);
}

/**
 * Lưu trữ đơn hàng trên máy chủ (Upstash Redis - bật trong Vercel → Storage / Marketplace).
 * Thư mục bắt đầu bằng "_" nên Vercel không biến file này thành một API riêng.
 */
import { Redis } from '@upstash/redis';
import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { ProductRow, supabaseStore } from './supabase-store';
import { AnalyticsStore, Maintenance, memoryAnalytics, memoryMaintenance } from './analytics';

/** Project Supabase của shop (URL không phải bí mật; khoá đặt trong biến môi trường). */
const DEFAULT_SUPABASE_URL = 'https://socfkoptqceyzhhpwxoe.supabase.co';

export type OrderStatus = 'pending' | 'paid' | 'shipping' | 'done' | 'cancelled';
export const ORDER_STATUSES: OrderStatus[] = ['pending', 'paid', 'shipping', 'done', 'cancelled'];

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

export interface Customer {
  name: string;
  phone: string;
  email: string;
  address: string;
  note: string;
  /** Vị trí theo IP lúc đặt (máy chủ tự thêm, khách không gửi được). */
  geo?: OrderGeo;
}

/** Vị trí ước tính theo IP lúc đặt (Vercel tự gắn) - chỉ admin xem, dùng cho bản đồ nhiệt. */
export interface OrderGeo {
  ip: string;
  country: string;
  region: string;
  city: string;
  lat: number | null;
  lon: number | null;
}

/** Đọc vị trí theo IP từ header của Vercel (chạy thử ở máy thì không có → chỉ lưu IP). */
export function geoFromRequest(req: Request): OrderGeo {
  const h = (k: string) => {
    const v = req.headers.get(k) ?? '';
    try {
      return decodeURIComponent(v).slice(0, 80);
    } catch {
      return v.slice(0, 80);
    }
  };
  const n = (k: string) => {
    const v = Number(req.headers.get(k));
    return req.headers.get(k) && Number.isFinite(v) ? v : null;
  };
  const ip = clientIp(req);
  return {
    ip: ip === 'unknown' ? '' : ip.slice(0, 64),
    country: h('x-vercel-ip-country'),
    region: h('x-vercel-ip-country-region'),
    city: h('x-vercel-ip-city'),
    lat: n('x-vercel-ip-latitude'),
    lon: n('x-vercel-ip-longitude'),
  };
}

export interface Order {
  code: string;
  status: OrderStatus;
  customer: Customer;
  items: OrderItem[];
  total: number;
  createdAt: number;
  updatedAt: number;
  /** Lúc khách bấm "Tôi đã chuyển khoản". */
  paidClaimAt?: number;
  /** Ghi chú nội bộ của shop - khách không xem được. */
  adminNote: string;
}

// ---------- Kho lưu ----------
interface Store {
  get(code: string): Promise<Order | null>;
  put(order: Order): Promise<void>;
  del(code: string): Promise<void>;
  list(): Promise<Order[]>;
  /** Đếm số lần gọi trong một khoảng thời gian (chống spam). */
  hit(key: string, windowSec: number): Promise<number>;
  /** Lưu / đọc dữ liệu tuỳ ý (kiến thức AI, dữ liệu sản phẩm cho AI...). */
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown): Promise<void>;
  delKey(key: string): Promise<void>;
  /** Ghi bảng sản phẩm (chỉ có ở Supabase). */
  syncProducts?(products: ProductRow[]): Promise<void>;
  /** Thống kê truy cập (Supabase hoặc bộ nhớ khi chạy thử). */
  analytics?: AnalyticsStore;
  /** Dọn dữ liệu không dùng khi bộ nhớ gần đầy. */
  maintenance?: Maintenance;
  /** Lưu ảnh và trả về link công khai (chỉ có ở Supabase Storage). */
  uploadImage?(path: string, bytes: Uint8Array, contentType: string): Promise<string>;
  /** Lời nhắn liên hệ (Supabase có bảng riêng; kho khác lưu dạng danh sách JSON). */
  contacts?: ContactStore;
  /** Dung lượng chi tiết: từng bảng / khoá dữ liệu + kho ảnh (chỉ có ở Supabase). */
  usage?(): Promise<UsageInfo>;
  /** Lần ghi gần nhất vào database (app_kv, đơn hàng, lượt xem...) - để giữ Supabase không bị tạm dừng. */
  lastWrite?(): Promise<number | null>;
}

export interface UsageInfo {
  /** null = chưa có hàm storage_breakdown (chạy lại supabase/schema.sql). */
  db: { total: number; tables: { name: string; bytes: number; rows: number }[]; kv: { key: string; bytes: number }[] } | null;
  media: { bytes: number; count: number; folders: { name: string; bytes: number; count: number }[] } | null;
}

export interface Contact {
  id: number;
  name: string;
  phone: string;
  email: string;
  message: string;
  status: 'new' | 'done';
  adminNote: string;
  createdAt: number;
  updatedAt: number;
}

export interface ContactStore {
  add(c: Omit<Contact, 'id' | 'status' | 'adminNote' | 'createdAt' | 'updatedAt'>): Promise<Contact>;
  list(): Promise<Contact[]>;
  update(id: number, patch: Partial<Pick<Contact, 'status' | 'adminNote'>>): Promise<Contact | null>;
  remove(id: number): Promise<void>;
}

/** Lời nhắn lưu thành một danh sách JSON (dùng cho Redis / bộ nhớ tạm khi chạy thử). */
export function kvContacts(store: Store): ContactStore {
  const KEY = 'contacts';
  const all = async () => (await store.getJson<Contact[]>(KEY)) ?? [];
  return {
    async add(c) {
      const list = await all();
      const now = Date.now();
      const item: Contact = { ...c, id: (list[0]?.id ?? 0) + 1, status: 'new', adminNote: '', createdAt: now, updatedAt: now };
      await store.setJson(KEY, [item, ...list].slice(0, 2000));
      return item;
    },
    list: all,
    async update(id, patch) {
      const list = await all();
      const item = list.find((x) => x.id === id);
      if (!item) return null;
      Object.assign(item, patch, { updatedAt: Date.now() });
      await store.setJson(KEY, list);
      return item;
    },
    async remove(id) {
      await store.setJson(KEY, (await all()).filter((x) => x.id !== id));
    },
  };
}

/** Bảng contacts chưa được tạo trên Supabase (chưa chạy lại supabase/schema.sql). */
const missingTable = (e: unknown) => e instanceof Error && /Could not find the table|does not exist|PGRST205/i.test(e.message);

export function getContacts(): ContactStore {
  const s = getStore();
  if (!s.contacts) return kvContacts(s);
  // Có Supabase nhưng thiếu bảng contacts → lưu tạm vào app_kv để không mất lời nhắn nào.
  const table = s.contacts;
  const kv = kvContacts(s);
  const viaTable = <A extends unknown[], R>(fn: (...a: A) => Promise<R>, fallback: (...a: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      try {
        return await fn(...args);
      } catch (e) {
        if (!missingTable(e)) throw e;
        console.warn('Bảng contacts chưa có trên Supabase - lưu tạm vào app_kv. Hãy chạy lại supabase/schema.sql.');
        return fallback(...args);
      }
    };
  return {
    add: viaTable(table.add, kv.add),
    // Danh sách: gộp cả lời nhắn trong bảng (nếu có) và lời nhắn lưu tạm.
    list: async () => {
      const [a, b] = await Promise.all([viaTable(table.list, async () => [] as Contact[])(), kv.list()]);
      return [...a, ...b.map((c) => ({ ...c, id: -c.id }))].sort((x, y) => y.createdAt - x.createdAt);
    },
    // id âm = lời nhắn lưu tạm trong app_kv.
    update: (id, patch) => (id < 0 ? kv.update(-id, patch).then((c) => c && { ...c, id: -c.id }) : viaTable(table.update, kv.update)(id, patch)),
    remove: (id) => (id < 0 ? kv.remove(-id) : viaTable(table.remove, kv.remove)(id)),
  };
}

function redisStore(redis: Redis): Store {
  return {
    get: (code) => redis.get<Order>(`order:${code}`),
    async put(order) {
      await redis.set(`order:${order.code}`, order);
      await redis.zadd('orders', { score: order.createdAt, member: order.code });
    },
    async del(code) {
      await redis.del(`order:${code}`);
      await redis.zrem('orders', code);
    },
    async list() {
      const codes = await redis.zrange<string[]>('orders', 0, -1, { rev: true });
      if (!codes.length) return [];
      const rows = await redis.mget<(Order | null)[]>(...codes.map((c) => `order:${c}`));
      return rows.filter((o): o is Order => !!o);
    },
    async hit(key, windowSec) {
      const k = `rl:${key}`;
      const n = await redis.incr(k);
      if (n === 1) await redis.expire(k, windowSec);
      return n;
    },
    getJson: (key) => redis.get(key),
    async setJson(key, value) {
      await redis.set(key, value);
    },
    async delKey(key) {
      await redis.del(key);
    },
  };
}

/** Chỉ dùng khi chạy thử ở máy (không có Redis). Trên Vercel bắt buộc phải có Redis. */
function memoryStore(): Store {
  const memAn = memoryAnalytics();
  const orders = new Map<string, Order>();
  const hits = new Map<string, { n: number; until: number }>();
  const kv = new Map<string, unknown>();
  return {
    get: async (code) => structuredClone(orders.get(code) ?? null),
    put: async (order) => void orders.set(order.code, structuredClone(order)),
    del: async (code) => void orders.delete(code),
    list: async () => [...orders.values()].sort((a, b) => b.createdAt - a.createdAt),
    async hit(key, windowSec) {
      const now = Date.now();
      const h = hits.get(key);
      const next = !h || h.until < now ? { n: 1, until: now + windowSec * 1000 } : { n: h.n + 1, until: h.until };
      hits.set(key, next);
      return next.n;
    },
    analytics: memAn,
    maintenance: memoryMaintenance(memAn),
    getJson: async <T,>(key: string) => structuredClone((kv.get(key) as T | undefined) ?? null),
    setJson: async (key, value) => void kv.set(key, structuredClone(value)),
    delKey: async (key) => void kv.delete(key),
  };
}

let store: Store | null = null;
export function getStore(): Store {
  if (store) return store;
  // Ưu tiên Supabase; vẫn hỗ trợ Upstash Redis nếu đã cài từ trước.
  const sbKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  const url = process.env['KV_REST_API_URL'] ?? process.env['UPSTASH_REDIS_REST_URL'];
  const token = process.env['KV_REST_API_TOKEN'] ?? process.env['UPSTASH_REDIS_REST_TOKEN'];
  if (sbKey) store = supabaseStore(process.env['SUPABASE_URL'] || DEFAULT_SUPABASE_URL, sbKey);
  else if (url && token) store = redisStore(new Redis({ url, token }));
  else if (!process.env['VERCEL']) store = memoryStore();
  else throw new HttpError(503, 'Chưa cấu hình cơ sở dữ liệu: thêm SUPABASE_SERVICE_ROLE_KEY trên Vercel.');
  return store;
}

// ---------- Tiện ích HTTP ----------
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/** Bọc handler: lỗi HttpError → JSON có thông báo; lỗi khác → 500. */
export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      // Admin được xem chi tiết lỗi (vd. chưa chạy schema.sql trên Supabase); khách chỉ thấy thông báo chung.
      const detail = isAdmin(req) && e instanceof Error ? ` (${e.message})` : '';
      return json({ error: 'Máy chủ gặp lỗi, vui lòng thử lại.' + detail }, 500);
    }
  };
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    /* rơi xuống dưới */
  }
  throw new HttpError(400, 'Dữ liệu gửi lên không hợp lệ.');
}

/**
 * IP thật của khách. Trên Vercel: 'x-vercel-forwarded-for' / 'x-real-ip' do Vercel tự gắn và ghi đè,
 * khách không giả được. 'x-forwarded-for' chỉ dùng khi chạy thử ở máy.
 */
export function clientIp(req: Request): string {
  const first = (h: string) => (req.headers.get(h) ?? '').split(',')[0].trim();
  return first('x-vercel-forwarded-for') || first('x-real-ip') || first('x-forwarded-for') || 'unknown';
}

export async function rateLimit(req: Request, name: string, max: number, windowSec: number): Promise<void> {
  const n = await getStore().hit(`${name}:${clientIp(req)}`, windowSec);
  if (n > max) throw new HttpError(429, 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.');
}

const safeEq = (x: string, y: string) => {
  const a = Buffer.from(x);
  const b = Buffer.from(y);
  return a.length === b.length && timingSafeEqual(a, b);
};

// ---------- Mật khẩu admin (lưu trên máy chủ) + phiên đăng nhập ----------
/** Mật khẩu admin đã đổi: lưu băm scrypt trong app_kv. Chưa đổi lần nào → mật khẩu = ADMIN_API_KEY. */
const PASSWORD_KEY = 'admin:password';
interface SavedPassword {
  salt: string;
  hash: string;
  /** Tăng mỗi lần đổi mật khẩu → mọi phiên đăng nhập cũ hết hiệu lực. */
  ver: number;
  changedAt: number;
}
/** Phiên đăng nhập admin hết hạn sau 30 ngày. */
const TOKEN_TTL = 30 * 86_400_000;
const TOKEN_PREFIX = 't1.';

const scrypt = (pw: string, salt: string) => scryptSync(pw, salt, 64).toString('hex');
const sign = (payload: string) => createHmac('sha256', process.env['ADMIN_API_KEY'] ?? '').update(payload).digest('base64url');

async function savedPassword(): Promise<SavedPassword | null> {
  return getStore().getJson<SavedPassword>(PASSWORD_KEY);
}

/** Mật khẩu đúng không (theo mật khẩu đã lưu trên máy chủ; chưa đổi lần nào thì so với ADMIN_API_KEY). */
export async function checkAdminPassword(pw: string): Promise<boolean> {
  const saved = await savedPassword();
  if (saved) return safeEq(scrypt(pw, saved.salt), saved.hash);
  const key = process.env['ADMIN_API_KEY'];
  return !!key && safeEq(pw, key);
}

/** Đổi mật khẩu: lưu băm mới, tăng phiên bản (đăng xuất mọi máy khác). Trả về phiên đăng nhập mới. */
export async function setAdminPassword(pw: string): Promise<string> {
  const ver = ((await savedPassword())?.ver ?? 0) + 1;
  const salt = randomBytes(16).toString('hex');
  await getStore().setJson(PASSWORD_KEY, { salt, hash: scrypt(pw, salt), ver, changedAt: Date.now() } satisfies SavedPassword);
  return makeAdminToken(ver);
}

export async function adminTokenForLogin(): Promise<string> {
  return makeAdminToken((await savedPassword())?.ver ?? 0);
}

function makeAdminToken(ver: number): string {
  const payload = `${TOKEN_PREFIX}${Date.now() + TOKEN_TTL}.${ver}`;
  return `${payload}.${sign(payload)}`;
}

/** Phiên đăng nhập hợp lệ (đúng chữ ký, chưa hết hạn) → phiên bản mật khẩu lúc đăng nhập; sai → null. */
function readAdminToken(token: string): number | null {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const i = token.lastIndexOf('.');
  const payload = token.slice(0, i);
  if (!safeEq(token.slice(i + 1), sign(payload))) return null;
  const [exp, ver] = payload.slice(TOKEN_PREFIX.length).split('.').map(Number);
  return exp > Date.now() && Number.isInteger(ver) ? ver : null;
}

/**
 * Quyền quản trị: header x-admin-key = ADMIN_API_KEY, hoặc phiên đăng nhập có chữ ký hợp lệ
 * (kiểm tra nhanh, chưa so phiên bản mật khẩu - requireAdmin mới so).
 */
export function isAdmin(req: Request): boolean {
  const expected = process.env['ADMIN_API_KEY'];
  const given = req.headers.get('x-admin-key') ?? '';
  if (!expected) return false;
  return safeEq(given, expected) || readAdminToken(given) !== null;
}

export async function requireAdmin(req: Request): Promise<void> {
  const expected = process.env['ADMIN_API_KEY'];
  if (!expected) throw new HttpError(503, 'Chưa cấu hình ADMIN_API_KEY trên máy chủ.');
  const given = req.headers.get('x-admin-key') ?? '';
  if (safeEq(given, expected)) return;
  const ver = readAdminToken(given);
  if (ver === null) throw new HttpError(401, 'Mã quản trị không đúng.');
  // Đã đổi mật khẩu sau lần đăng nhập này → phiên cũ hết hiệu lực.
  if (ver !== ((await savedPassword())?.ver ?? 0)) throw new HttpError(401, 'Phiên đăng nhập đã hết hiệu lực (mật khẩu đã đổi). Vui lòng đăng nhập lại.');
}

// ---------- Kiểm tra dữ liệu ----------
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const digits = (s: string) => s.replace(/\D/g, '');

/** Cùng quy tắc với src/app/shared/validators.ts. */
export function normalizePhone(raw: string): string {
  let d = raw.replace(/[\s.\-()]/g, '');
  if (d.startsWith('+84')) d = '0' + d.slice(3);
  else if (/^84\d{9}$/.test(d)) d = '0' + d.slice(2);
  return d;
}
export const isValidVnPhone = (raw: string) => /^0(?:[35789]\d{8}|2\d{9})$/.test(normalizePhone(raw));
export const isValidEmail = (v: string) => /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(v) && !v.includes('..');

export function parseCustomer(v: unknown): Customer {
  const c = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const customer: Customer = {
    name: str(c['name'], 80),
    phone: str(c['phone'], 20),
    email: str(c['email'], 120),
    address: str(c['address'], 300),
    note: str(c['note'], 500),
  };
  if (customer.name.length < 2) throw new HttpError(400, 'Vui lòng nhập họ tên.');
  customer.phone = normalizePhone(customer.phone);
  if (!isValidVnPhone(customer.phone)) throw new HttpError(400, 'Số điện thoại không hợp lệ (VD: 0912 345 678).');
  customer.email = customer.email.toLowerCase();
  if (customer.email && !isValidEmail(customer.email)) throw new HttpError(400, 'Email không hợp lệ.');
  if (customer.address.length < 5) throw new HttpError(400, 'Vui lòng nhập địa chỉ nhận hàng.');
  return customer;
}

export function parseItems(v: unknown): OrderItem[] {
  if (!Array.isArray(v) || !v.length) throw new HttpError(400, 'Giỏ hàng đang trống.');
  if (v.length > 50) throw new HttpError(400, 'Giỏ hàng có quá nhiều sản phẩm.');
  return v.map((raw) => {
    const it = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const item: OrderItem = {
      id: str(it['id'], 64),
      name: str(it['name'], 120),
      price: Math.round(Number(it['price'])),
      qty: Math.round(Number(it['qty'])),
    };
    if (!item.name || !Number.isFinite(item.price) || item.price < 0 || item.price > 1e9) {
      throw new HttpError(400, 'Sản phẩm trong giỏ không hợp lệ.');
    }
    if (!Number.isFinite(item.qty) || item.qty < 1 || item.qty > 99) throw new HttpError(400, 'Số lượng không hợp lệ.');
    return item;
  });
}

export const orderTotal = (items: OrderItem[]) => items.reduce((s, i) => s + i.price * i.qty, 0);

export function parseStatus(v: unknown): OrderStatus {
  if (typeof v === 'string' && (ORDER_STATUSES as string[]).includes(v)) return v as OrderStatus;
  throw new HttpError(400, 'Trạng thái đơn không hợp lệ.');
}

/** Mã đơn dạng FM + 6 ký tự, bỏ các ký tự dễ nhầm (0/O, 1/I/L). */
export async function newOrderCode(): Promise<string> {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = 'FM';
    for (let i = 0; i < 6; i++) code += alphabet[randomInt(alphabet.length)];
    if (!(await getStore().get(code))) return code;
  }
  throw new HttpError(500, 'Không tạo được mã đơn, vui lòng thử lại.');
}

export const normalizeCode = (v: unknown) => str(v, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Thông tin khách được xem khi tra cứu (ẩn bớt địa chỉ, SĐT, không có ghi chú nội bộ). */
export function publicView(o: Order) {
  const phone = digits(o.customer.phone);
  return {
    code: o.code,
    status: o.status,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    paidClaimAt: o.paidClaimAt ?? null,
    items: o.items,
    total: o.total,
    customer: { name: o.customer.name, phone: `${'*'.repeat(Math.max(0, phone.length - 3))}${phone.slice(-3)}` },
  };
}

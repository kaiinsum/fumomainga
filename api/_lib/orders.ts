/**
 * Lưu trữ đơn hàng trên máy chủ (Upstash Redis — bật trong Vercel → Storage / Marketplace).
 * Thư mục bắt đầu bằng "_" nên Vercel không biến file này thành một API riêng.
 */
import { Redis } from '@upstash/redis';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { ProductRow, supabaseStore } from './supabase-store';

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
  /** Ghi chú nội bộ của shop — khách không xem được. */
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

export function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
}

export async function rateLimit(req: Request, name: string, max: number, windowSec: number): Promise<void> {
  const n = await getStore().hit(`${name}:${clientIp(req)}`, windowSec);
  if (n > max) throw new HttpError(429, 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.');
}

/** Khoá quản trị: biến môi trường ADMIN_API_KEY, gửi qua header x-admin-key. */
export function isAdmin(req: Request): boolean {
  const expected = process.env['ADMIN_API_KEY'];
  const given = req.headers.get('x-admin-key') ?? '';
  if (!expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireAdmin(req: Request): void {
  if (!process.env['ADMIN_API_KEY']) throw new HttpError(503, 'Chưa cấu hình ADMIN_API_KEY trên máy chủ.');
  if (!isAdmin(req)) throw new HttpError(401, 'Mã quản trị không đúng.');
}

// ---------- Kiểm tra dữ liệu ----------
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const digits = (s: string) => s.replace(/\D/g, '');

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
  if (!/^\+?[\d\s.-]{9,15}$/.test(customer.phone) || digits(customer.phone).length < 9) {
    throw new HttpError(400, 'Số điện thoại không hợp lệ.');
  }
  if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) throw new HttpError(400, 'Email không hợp lệ.');
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

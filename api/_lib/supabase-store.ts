/**
 * Kho dữ liệu trên Supabase (Postgres) — bảng tạo bằng supabase/schema.sql.
 * Chỉ chạy trên máy chủ với SERVICE ROLE KEY (bỏ qua RLS); trình duyệt không bao giờ thấy khoá này.
 */
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import type { Contact, ContactStore, Order, OrderItem, OrderStatus } from './orders';

/** Bucket công khai chứa ảnh sản phẩm / tin tức. */
const MEDIA_BUCKET = 'media';

interface ContactRow {
  id: number;
  name: string;
  phone: string;
  email: string;
  message: string;
  status: Contact['status'];
  admin_note: string;
  created_at: string;
  updated_at: string;
}

const toContact = (r: ContactRow): Contact => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  email: r.email,
  message: r.message,
  status: r.status,
  adminNote: r.admin_note ?? '',
  createdAt: new Date(r.created_at).getTime(),
  updatedAt: new Date(r.updated_at).getTime(),
});

interface OrderRow {
  code: string;
  status: OrderStatus;
  customer: Order['customer'];
  total: number;
  admin_note: string;
  paid_claim_at: string | null;
  created_at: string;
  updated_at: string;
  order_items?: { product_id: string; name: string; price: number; qty: number }[];
}

export interface ProductRow {
  id: string;
  name: string;
  category: string;
  price: number;
  salePrice: number | null;
  inStock: boolean;
  featured: boolean;
  tags: string[];
  description: string;
}

const ORDER_SELECT = 'code,status,customer,total,admin_note,paid_claim_at,created_at,updated_at,order_items(product_id,name,price,qty)';
const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : undefined);
const iso = (t: number | undefined) => (t ? new Date(t).toISOString() : null);
const digits = (s: string) => s.replace(/\D/g, '');

function toOrder(r: OrderRow): Order {
  return {
    code: r.code,
    status: r.status,
    customer: r.customer,
    items: (r.order_items ?? []).map<OrderItem>((i) => ({ id: i.product_id, name: i.name, price: Number(i.price), qty: i.qty })),
    total: Number(r.total),
    createdAt: ms(r.created_at)!,
    updatedAt: ms(r.updated_at)!,
    paidClaimAt: ms(r.paid_claim_at),
    adminNote: r.admin_note ?? '',
  };
}

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Supabase (${what}): ${res.error.message}`);
  return res.data;
}

/** Mỗi lần gọi Supabase tối đa 9 giây; lỗi mạng (không tới được máy chủ) thì thử lại 1 lần. */
const REQUEST_TIMEOUT_MS = 9000;
const fetchWithRetry: typeof fetch = async (input, init) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (e) {
      // Chỉ thử lại lỗi kết nối / quá giờ; không thử lại khi bên gọi tự huỷ.
      if (attempt >= 1 || init?.signal?.aborted) throw e;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
};

export function supabaseStore(url: string, serviceKey: string) {
  const db: SupabaseClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithRetry },
  });
  /** false khi DB chưa có hàm save_order (chưa chạy lại schema.sql) → dùng cách cũ nhiều bước. */
  let hasSaveOrderRpc = true;

  const contacts: ContactStore = {
    async add(c) {
      const row = check(
        await db.from('contacts').insert({ name: c.name, phone: c.phone, email: c.email, message: c.message }).select().single(),
        'lưu liên hệ',
      );
      return toContact(row as ContactRow);
    },
    async list() {
      const rows = check(await db.from('contacts').select('*').order('created_at', { ascending: false }).limit(1000), 'danh sách liên hệ');
      return (rows as ContactRow[]).map(toContact);
    },
    async update(id, patch) {
      const row = check(
        await db
          .from('contacts')
          .update({
            ...(patch.status ? { status: patch.status } : {}),
            ...(patch.adminNote !== undefined ? { admin_note: patch.adminNote } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .maybeSingle(),
        'cập nhật liên hệ',
      );
      return row ? toContact(row as ContactRow) : null;
    },
    async remove(id) {
      check(await db.from('contacts').delete().eq('id', id), 'xoá liên hệ');
    },
  };

  return {
    contacts,
    async get(code: string): Promise<Order | null> {
      const row = check(await db.from('orders').select(ORDER_SELECT).eq('code', code).maybeSingle(), 'đọc đơn');
      return row ? toOrder(row as unknown as OrderRow) : null;
    },

    async put(order: Order): Promise<void> {
      // Nhanh: một lần gọi duy nhất, chạy trọn trong một giao dịch.
      if (hasSaveOrderRpc) {
        const { error } = await db.rpc('save_order', {
          p: {
            code: order.code,
            status: order.status,
            phone: digits(order.customer.phone),
            customer: order.customer,
            total: order.total,
            admin_note: order.adminNote,
            paid_claim_at: iso(order.paidClaimAt),
            created_at: iso(order.createdAt),
            updated_at: iso(order.updatedAt),
            items: order.items.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
          },
        });
        if (!error) return;
        if (!/save_order|PGRST202|function/i.test(`${error.code ?? ''} ${error.message}`)) throw new Error(`Supabase (lưu đơn): ${error.message}`);
        hasSaveOrderRpc = false;
      }
      // Dự phòng (DB cũ): 1) Khách hàng: mỗi số điện thoại một dòng, cập nhật thông tin mới nhất.
      const c = order.customer;
      const customer = check(
        await db
          .from('customers')
          .upsert(
            { phone: digits(c.phone), name: c.name, email: c.email, address: c.address, updated_at: new Date().toISOString() },
            { onConflict: 'phone' },
          )
          .select('id')
          .single(),
        'lưu khách hàng',
      ) as { id: number };
      // 2) Đơn hàng.
      check(
        await db.from('orders').upsert({
          code: order.code,
          status: order.status,
          customer_id: customer.id,
          customer: order.customer,
          total: order.total,
          admin_note: order.adminNote,
          paid_claim_at: iso(order.paidClaimAt),
          created_at: iso(order.createdAt),
          updated_at: iso(order.updatedAt),
        }),
        'lưu đơn',
      );
      // 3) Sản phẩm trong đơn: ghi lại toàn bộ.
      check(await db.from('order_items').delete().eq('order_code', order.code), 'xoá sản phẩm cũ của đơn');
      if (order.items.length) {
        check(
          await db.from('order_items').insert(
            order.items.map((i) => ({ order_code: order.code, product_id: i.id, name: i.name, price: i.price, qty: i.qty })),
          ),
          'lưu sản phẩm của đơn',
        );
      }
    },

    async del(code: string): Promise<void> {
      check(await db.from('orders').delete().eq('code', code), 'xoá đơn');
    },

    async list(): Promise<Order[]> {
      const rows = check(
        await db.from('orders').select(ORDER_SELECT).order('created_at', { ascending: false }).limit(1000),
        'danh sách đơn',
      );
      return (rows as unknown as OrderRow[]).map(toOrder);
    },

    async hit(key: string, windowSec: number): Promise<number> {
      const n = check(await db.rpc('hit_rate_limit', { p_key: key, p_window_sec: windowSec }), 'chống spam');
      return Number(n);
    },

    async getJson<T>(key: string): Promise<T | null> {
      const row = check(await db.from('app_kv').select('value').eq('key', key).maybeSingle(), 'đọc dữ liệu');
      return row ? ((row as { value: T }).value ?? null) : null;
    },

    async setJson(key: string, value: unknown): Promise<void> {
      check(await db.from('app_kv').upsert({ key, value, updated_at: new Date().toISOString() }), 'ghi dữ liệu');
    },

    async delKey(key: string): Promise<void> {
      check(await db.from('app_kv').delete().eq('key', key), 'xoá dữ liệu');
    },

    /** Tải ảnh lên Supabase Storage (bucket công khai "media", tự tạo nếu chưa có) → trả về link công khai. */
    async uploadImage(path: string, bytes: Uint8Array, contentType: string): Promise<string> {
      const put = () => db.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType, upsert: true, cacheControl: '31536000' });
      let res = await put();
      if (res.error && /not.?found|does not exist/i.test(res.error.message)) {
        const made = await db.storage.createBucket(MEDIA_BUCKET, { public: true, fileSizeLimit: '5MB' });
        if (made.error && !/already exists/i.test(made.error.message)) throw new Error(`Tạo kho ảnh: ${made.error.message}`);
        res = await put();
      }
      if (res.error) throw new Error(`Tải ảnh lên: ${res.error.message}`);
      return db.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
    },

    /** Bảng products = đúng danh sách admin vừa đồng bộ (thêm / sửa / xoá cho khớp). */
    async syncProducts(products: ProductRow[]): Promise<void> {
      const now = new Date().toISOString();
      if (products.length) {
        const rows = products.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          price: p.price,
          sale_price: p.salePrice,
          in_stock: p.inStock,
          featured: p.featured,
          tags: p.tags,
          description: p.description,
          synced_at: now,
        }));
        let res = await db.from('products').upsert(rows);
        // DB cũ chưa có cột sale_price (chưa chạy lại schema.sql) → vẫn đồng bộ được phần còn lại.
        if (res.error && /sale_price/.test(res.error.message)) res = await db.from('products').upsert(rows.map(({ sale_price: _s, ...r }) => r));
        check(res, 'đồng bộ sản phẩm');
      }
      // Sản phẩm không còn trong danh sách thì xoá (những dòng chưa được cập nhật ở lần đồng bộ này).
      check(await db.from('products').delete().lt('synced_at', now), 'dọn sản phẩm đã xoá');
    },
  };
}

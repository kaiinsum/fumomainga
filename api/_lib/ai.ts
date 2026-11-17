/**
 * Dữ liệu cho trợ lý AI: file kiến thức (.md) admin tải lên + ảnh chụp danh sách sản phẩm admin đồng bộ.
 * Cả hai lưu trên máy chủ (Redis) để trợ lý trả lời đúng với những gì đang có trên website.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HttpError, getStore } from './orders';

export const KNOWLEDGE_KEY = 'ai:knowledge';
export const CATALOG_KEY = 'ai:catalog';
export const MAX_KNOWLEDGE_CHARS = 100_000;

export interface SavedKnowledge {
  text: string;
  fileName: string;
  updatedAt: number;
}

export interface CatalogProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  /** Giá sau giảm, null nếu không giảm. */
  salePrice: number | null;
  variants: { name: string; price: number; salePrice: number | null }[];
  inStock: boolean;
  featured: boolean;
  tags: string[];
  description: string;
}

export interface CatalogSnapshot {
  shopName: string;
  products: CatalogProduct[];
  categories: string[];
  news: { title: string; excerpt: string; path: string; date: string }[];
  syncedAt: number;
}

/** File mặc định đi kèm mã nguồn (dùng khi admin chưa tải file nào lên). */
export function readKnowledgeFile(): string {
  try {
    return readFileSync(join(process.cwd(), 'knowledge', 'kien-thuc.md'), 'utf8');
  } catch {
    return '';
  }
}

/** Bỏ ghi chú HTML (<!-- -->) — dành cho người soạn, không gửi cho AI. */
export const stripComments = (md: string) => md.replace(/<!--[\s\S]*?-->/g, '').trim();

// ---------- Kiểm tra dữ liệu đồng bộ ----------
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function parseCatalog(body: Record<string, unknown>): CatalogSnapshot {
  const products = Array.isArray(body['products']) ? body['products'] : null;
  if (!products) throw new HttpError(400, 'Thiếu danh sách sản phẩm.');
  if (products.length > 500) throw new HttpError(400, 'Tối đa 500 sản phẩm.');
  return {
    shopName: str(body['shopName'], 80),
    products: products.map((raw) => {
      const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const price = Math.round(Number(p['price']));
      return {
        id: str(p['id'], 64),
        name: str(p['name'], 120),
        category: str(p['category'], 60),
        price: Number.isFinite(price) && price >= 0 ? price : 0,
        salePrice: (() => {
          const s = Math.round(Number(p['salePrice']));
          return p['salePrice'] !== null && p['salePrice'] !== undefined && Number.isFinite(s) && s >= 0 && s < price ? s : null;
        })(),
        variants: (Array.isArray(p['variants']) ? p['variants'] : []).slice(0, 30).map((rv) => {
          const v = (rv && typeof rv === 'object' ? rv : {}) as Record<string, unknown>;
          const vp = Math.max(0, Math.round(Number(v['price'])) || 0);
          const vs = Math.round(Number(v['salePrice']));
          return { name: str(v['name'], 60), price: vp, salePrice: v['salePrice'] != null && Number.isFinite(vs) && vs >= 0 && vs < vp ? vs : null };
        }).filter((v) => v.name),
        inStock: p['inStock'] === true,
        featured: p['featured'] === true,
        tags: Array.isArray(p['tags']) ? p['tags'].map((t) => str(t, 30)).filter(Boolean).slice(0, 10) : [],
        description: str(p['description'], 400),
      };
    }).filter((p) => p.name),
    categories: Array.isArray(body['categories']) ? body['categories'].map((c) => str(c, 60)).filter(Boolean).slice(0, 50) : [],
    news: Array.isArray(body['news'])
      ? body['news'].slice(0, 30).map((raw) => {
          const n = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
          return { title: str(n['title'], 150), excerpt: str(n['excerpt'], 300), path: str(n['path'], 120), date: str(n['date'], 20) };
        })
      : [],
    syncedAt: Date.now(),
  };
}

// ---------- Chuyển dữ liệu thành văn bản cho AI ----------
const vnd = (n: number) => n.toLocaleString('vi-VN') + 'đ';

/** Bảng sản phẩm + số liệu tính sẵn (để AI không phải tự đếm / so sánh, tránh sai). */
export function catalogToPrompt(c: CatalogSnapshot): string {
  const ps = c.products;
  if (!ps.length) return 'Website hiện chưa có sản phẩm nào.';
  const inStock = ps.filter((p) => p.inStock);
  const out = ps.filter((p) => !p.inStock);
  const byPrice = [...ps].sort((a, b) => a.price - b.price);
  const cheapest = byPrice.filter((p) => p.price === byPrice[0].price);
  const priciest = byPrice.filter((p) => p.price === byPrice[byPrice.length - 1].price);
  const names = (list: CatalogProduct[]) => list.map((p) => `${p.name} (${vnd(p.price)})`).join('; ');
  const cats = [...new Set([...c.categories, ...ps.map((p) => p.category)])];

  const stats = [
    `- Tổng số sản phẩm đang trưng bày: ${ps.length} (còn hàng: ${inStock.length}, hết hàng: ${out.length}).`,
    `- Rẻ nhất: ${names(cheapest)}.`,
    `- Mắc (đắt) nhất: ${names(priciest)}.`,
    ...(inStock.length && cheapest.some((p) => !p.inStock)
      ? [`- Rẻ nhất trong số còn hàng: ${names([...inStock].sort((x, y) => x.price - y.price).slice(0, 1))}.`]
      : []),
    `- Khoảng giá: ${vnd(byPrice[0].price)} – ${vnd(byPrice[byPrice.length - 1].price)}.`,
    out.length ? `- Đang hết hàng: ${out.map((p) => p.name).join('; ')}.` : '- Tất cả sản phẩm đều còn hàng.',
    `- Theo danh mục:`,
    ...cats.map((cat) => {
      const list = ps.filter((p) => p.category === cat);
      if (!list.length) return `  - ${cat}: chưa có sản phẩm.`;
      const sorted = [...list].sort((a, b) => a.price - b.price);
      return `  - ${cat}: ${list.length} sản phẩm (${list.filter((p) => p.inStock).length} còn hàng), rẻ nhất ${sorted[0].name} ${vnd(sorted[0].price)}, mắc nhất ${sorted[sorted.length - 1].name} ${vnd(sorted[sorted.length - 1].price)}.`;
    }),
  ];

  const table = [
    '| Sản phẩm | Danh mục | Giá | Giảm giá | Phân loại (biến thể) | Tình trạng | Nổi bật | Thẻ | Đường dẫn | Mô tả |',
    '|---|---|---|---|---|---|---|---|---|',
    ...byPrice.map(
      (p) =>
        `| ${p.name} | ${p.category} | ${vnd(p.salePrice ?? p.price)} | ${p.salePrice !== null ? `đang giảm ${Math.round((1 - p.salePrice / p.price) * 100)}% (giá gốc ${vnd(p.price)})` : ''} | ${p.variants.map((v) => `${v.name}: ${v.salePrice !== null ? `${vnd(v.salePrice)} (gốc ${vnd(v.price)})` : vnd(v.price)}`).join('; ')} | ${p.inStock ? 'Còn hàng' : 'Hết hàng'} | ${p.featured ? 'Có' : ''} | ${p.tags.join(', ')} | /san-pham/${p.id} | ${p.description.replace(/\|/g, '/').replace(/\s+/g, ' ')} |`,
    ),
  ];

  const news = c.news.length
    ? ['', '### Tin tức đang đăng', ...c.news.map((n) => `- ${n.date} — ${n.title} (${n.path}): ${n.excerpt}`)]
    : [];

  return [
    `Cập nhật lúc ${new Date(c.syncedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.`,
    'Website chỉ theo dõi CÒN HÀNG / HẾT HÀNG cho từng sản phẩm, không có số lượng tồn kho từng cái.',
    '',
    '### Số liệu tính sẵn (dùng các số này, không tự đếm lại)',
    ...stats,
    '',
    '### Danh sách sản phẩm (xếp theo giá tăng dần)',
    ...table,
    ...news,
  ].join('\n');
}

/** Kiến thức + dữ liệu website cho lượt chat. Không có Redis thì dùng file mặc định, không có danh sách sản phẩm. */
export async function loadAiContext(): Promise<{ knowledge: string; catalog: CatalogSnapshot | null }> {
  try {
    const store = getStore();
    const [saved, catalog] = await Promise.all([
      store.getJson<SavedKnowledge>(KNOWLEDGE_KEY),
      store.getJson<CatalogSnapshot>(CATALOG_KEY),
    ]);
    return { knowledge: stripComments(saved?.text ?? readKnowledgeFile()), catalog };
  } catch (e) {
    console.error('Không đọc được dữ liệu AI từ Redis, dùng file mặc định.', e);
    return { knowledge: stripComments(readKnowledgeFile()), catalog: null };
  }
}

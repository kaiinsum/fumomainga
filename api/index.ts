/**
 * Cổng API duy nhất của website — MỘT Vercel Function cho mọi đường dẫn /api/*.
 *
 * Vì sao: gói Vercel miễn phí (Hobby) chỉ cho tối đa 12 function mỗi lần deploy.
 * Gộp hết vào đây thì thêm API mới bao nhiêu cũng được (vẫn là 1 function).
 *
 * Cách chạy: vercel.json chuyển /api/<đường dẫn> → /api?__path=<đường dẫn>; file này đọc lại đường dẫn gốc,
 * dựng lại Request với đúng URL cũ rồi gọi handler tương ứng trong api/_routes (thư mục bắt đầu bằng "_"
 * nên Vercel không biến chúng thành function riêng).
 *
 * THÊM API MỚI: tạo file trong api/_routes, export GET/POST/PUT/DELETE như cũ, rồi thêm một dòng vào ROUTES.
 */
import * as aiCatalog from './_routes/ai/catalog';
import * as aiKnowledge from './_routes/ai/knowledge';
import * as analytics from './_routes/analytics';
import * as catalog from './_routes/catalog';
import * as chat from './_routes/chat';
import * as minigame from './_routes/minigame';
import * as contactOne from './_routes/contacts/[id]';
import * as contacts from './_routes/contacts/index';
import * as orderOne from './_routes/orders/[code]';
import * as orderConfirm from './_routes/orders/confirm';
import * as orders from './_routes/orders/index';
import * as orderLookup from './_routes/orders/lookup';
import * as settings from './_routes/settings';
import * as adminAuth from './_routes/admin-auth';

type Handler = (req: Request) => Promise<Response>;
type Module = Partial<Record<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', Handler>>;

/** Đường dẫn (sau /api/) → module. Dòng cụ thể đặt trước dòng có tham số (vd. orders/lookup trước orders/:code). */
const ROUTES: [RegExp, Module][] = [
  [/^chat$/, chat],
  [/^settings$/, settings],
  [/^admin\/(login|password)$/, adminAuth],
  [/^catalog$/, catalog],
  [/^analytics$/, analytics],
  [/^minigame$/, minigame],
  [/^ai\/catalog$/, aiCatalog],
  [/^ai\/knowledge$/, aiKnowledge],
  [/^contacts$/, contacts],
  [/^contacts\/[^/]+$/, contactOne],
  [/^orders$/, orders],
  [/^orders\/lookup$/, orderLookup],
  [/^orders\/confirm$/, orderConfirm],
  [/^orders\/[^/]+$/, orderOne],
];

const reply = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });

async function route(req: Request): Promise<Response> {
  const url = new URL(req.url);
  // Đường dẫn gốc: từ rewrite (?__path=) hoặc chính URL (khi chạy thử / gọi thẳng).
  const fromQuery = url.searchParams.get('__path');
  const path = (fromQuery ?? url.pathname.replace(/^\/api\/?/, '')).replace(/^\/+|\/+$/g, '');
  url.searchParams.delete('__path');

  // Kiểm tra cổng API còn sống (không chứa dữ liệu gì).
  if (path === 'health') return reply({ ok: true, query: Object.fromEntries(url.searchParams) }, 200);

  const mod = ROUTES.find(([re]) => re.test(path))?.[1];
  if (!mod) return reply({ error: 'Không tìm thấy API.' }, 404);
  const method = req.method.toUpperCase() as keyof Module;
  const handler = mod[method];
  if (!handler) {
    const allow = Object.keys(mod).filter((k) => /^[A-Z]+$/.test(k)).join(', ');
    return reply({ error: 'Phương thức không được hỗ trợ.' }, 405, { allow });
  }

  // Dựng lại Request với URL gốc /api/<path>?<query> — các handler đọc mã đơn / id từ đường dẫn như trước.
  const target = `${url.origin}/api/${path}${url.search}`;
  const hasBody = method !== 'GET';
  const forwarded = new Request(target, {
    method,
    headers: req.headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
  });
  return handler(forwarded);
}

export const GET = route;
export const POST = route;
export const PUT = route;
export const DELETE = route;
export const PATCH = route;

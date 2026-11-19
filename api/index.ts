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
import * as security from './_routes/security';
import { isBlocked, recordRateHit } from './_lib/security';
import { ADMIN_BODY_PATHS, GLOBAL_RULE, MAX_BODY_ADMIN, MAX_BODY_PUBLIC, RULES, memLimit } from './_lib/guard';
import { clientIp, isAdmin } from './_lib/orders';

type Handler = (req: Request) => Promise<Response>;
type Module = Partial<Record<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', Handler>>;

/** Đường dẫn (sau /api/) → module. Dòng cụ thể đặt trước dòng có tham số (vd. orders/lookup trước orders/:code). */
const ROUTES: [RegExp, Module][] = [
  [/^chat$/, chat],
  [/^settings$/, settings],
  [/^admin\/(login|password)$/, adminAuth],
  [/^admin\/security$/, security],
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

const tooMany = (retryAfter: number) =>
  reply({ error: 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.' }, 429, { 'retry-after': String(retryAfter) });

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

  // ---- Chống spam / DoS (không tốn database) ----
  const admin = isAdmin(req);
  if (!admin) {
    const ip = clientIp(req);
    // IP bị admin chặn → từ chối mọi API (trừ khi đang đăng nhập admin hợp lệ).
    const blocked = await isBlocked(ip);
    if (blocked) return reply({ error: 'Địa chỉ IP của bạn đã bị chặn. Nếu nhầm lẫn, vui lòng liên hệ shop qua Facebook / điện thoại.' }, 403);
    const all = memLimit(`all:${ip}`, GLOBAL_RULE.max, GLOBAL_RULE.windowMs);
    if (!all.ok) {
      await recordRateHit(ip, '*');
      return tooMany(all.retryAfter);
    }
    for (const r of RULES) {
      if (!r.path.test(path) || (r.method && r.method !== method)) continue;
      const lim = memLimit(`${r.path.source}:${method}:${ip}`, r.max, r.windowMs);
      if (!lim.ok) {
        await recordRateHit(ip, path);
        return r.silent ? new Response(null, { status: 204 }) : tooMany(lim.retryAfter);
      }
    }
  }

  // Dựng lại Request với URL gốc /api/<path>?<query> — các handler đọc mã đơn / id từ đường dẫn như trước.
  const target = `${url.origin}/api/${path}${url.search}`;
  const hasBody = method !== 'GET';
  let body: ArrayBuffer | undefined;
  if (hasBody) {
    const limit = admin && ADMIN_BODY_PATHS.test(path) ? MAX_BODY_ADMIN : MAX_BODY_PUBLIC;
    if (Number(req.headers.get('content-length') ?? 0) > limit) return reply({ error: 'Dữ liệu gửi lên quá lớn.' }, 413);
    body = await req.arrayBuffer();
    if (body.byteLength > limit) return reply({ error: 'Dữ liệu gửi lên quá lớn.' }, 413);
  }
  const forwarded = new Request(target, { method, headers: req.headers, body });
  return handler(forwarded);
}

export const GET = route;
export const POST = route;
export const PUT = route;
export const DELETE = route;
export const PATCH = route;

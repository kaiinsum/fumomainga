/**
 * /api/admin/system - trang "Lưu trữ & tên miền" (CHỈ admin).
 *  GET  → dung lượng chi tiết (cơ sở dữ liệu, kho ảnh), thông tin hosting, hạn tên miền.
 *  PATCH { domain, domainExpires, registrar, renewUrl, hostingPlan, hostingExpires, note } → lưu thông tin nhập tay.
 * Hạn tên miền: thử tra RDAP (dữ liệu đăng ký công khai); không tra được (vd. một số đuôi .vn) thì dùng ngày admin nhập.
 */
import { HttpError, getStore, handle, json, readJson, requireAdmin } from '../_lib/orders';
import { HEARTBEAT_KEY, Heartbeat } from './keepalive';

const KEY = 'admin:system';
const DB_LIMIT_MB = Number(process.env['DB_LIMIT_MB']) || 500;
const MEDIA_LIMIT_MB = Number(process.env['MEDIA_LIMIT_MB']) || 1024;

interface Manual {
  domain: string;
  domainExpires: string;
  registrar: string;
  renewUrl: string;
  hostingPlan: string;
  hostingExpires: string;
  note: string;
}
const FIELDS: (keyof Manual)[] = ['domain', 'domainExpires', 'registrar', 'renewUrl', 'hostingPlan', 'hostingExpires', 'note'];

function clean(raw: unknown): Manual {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = {} as Manual;
  for (const f of FIELDS) out[f] = typeof r[f] === 'string' ? (r[f] as string).trim().slice(0, f === 'note' ? 1000 : 200) : '';
  for (const f of ['domainExpires', 'hostingExpires'] as const) if (out[f] && !/^\d{4}-\d{2}-\d{2}$/.test(out[f])) out[f] = '';
  if (out.renewUrl && !/^https?:\/\//i.test(out.renewUrl)) out.renewUrl = '';
  out.domain = out.domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return out;
}

/** Tên miền gốc từ địa chỉ đang mở admin (bỏ www., bỏ cổng). Bỏ qua localhost / *.vercel.app. */
function siteDomain(req: Request): string {
  const host = (req.headers.get('x-forwarded-host') ?? new URL(req.url).host).split(',')[0].trim().replace(/:\d+$/, '').toLowerCase();
  if (!host || host === 'localhost' || /^[\d.]+$/.test(host) || host.endsWith('.vercel.app')) return '';
  return host.replace(/^www\./, '');
}

interface DomainInfo {
  name: string;
  expires: string | null;
  created: string | null;
  registrar: string | null;
  source: 'rdap' | 'manual' | null;
  error?: string;
}

const rdapCache = new Map<string, { at: number; info: Omit<DomainInfo, 'source'> }>();

async function rdap(name: string): Promise<Omit<DomainInfo, 'source'>> {
  const hit = rdapCache.get(name);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.info;
  const info: Omit<DomainInfo, 'source'> = { name, expires: null, created: null, registrar: null };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(name)}`, {
      headers: { accept: 'application/rdap+json, application/json' },
      signal: ctrl.signal,
      redirect: 'follow',
    }).finally(() => clearTimeout(timer));
    if (!res.ok) throw new Error(res.status === 404 ? 'Nhà đăng ký đuôi tên miền này chưa hỗ trợ tra cứu tự động.' : `Tra cứu lỗi ${res.status}.`);
    const d = (await res.json()) as {
      events?: { eventAction?: string; eventDate?: string }[];
      entities?: { roles?: string[]; vcardArray?: [string, [string, unknown, string, string][]] }[];
    };
    const ev = (a: string) => d.events?.find((e) => e.eventAction === a)?.eventDate ?? null;
    info.expires = ev('expiration');
    info.created = ev('registration');
    const reg = d.entities?.find((e) => e.roles?.includes('registrar'));
    info.registrar = (reg?.vcardArray?.[1]?.find((v) => v[0] === 'fn')?.[3] as string | undefined) ?? null;
    if (!info.expires) info.error = 'Dữ liệu đăng ký không công khai ngày hết hạn.';
  } catch (e) {
    info.error = e instanceof Error && e.name !== 'AbortError' ? e.message : 'Không tra cứu được (hết thời gian chờ).';
  }
  rdapCache.set(name, { at: Date.now(), info });
  return info;
}

function hosting() {
  const env = process.env;
  const supa = env['SUPABASE_SERVICE_ROLE_KEY'] ? env['SUPABASE_URL'] || 'https://socfkoptqceyzhhpwxoe.supabase.co' : '';
  return {
    provider: env['VERCEL'] ? 'Vercel' : 'Máy chạy thử (local)',
    env: env['VERCEL_ENV'] ?? null,
    region: env['VERCEL_REGION'] ?? null,
    productionUrl: env['VERCEL_PROJECT_PRODUCTION_URL'] ?? null,
    deploymentUrl: env['VERCEL_URL'] ?? null,
    branch: env['VERCEL_GIT_COMMIT_REF'] ?? null,
    commit: (env['VERCEL_GIT_COMMIT_SHA'] ?? '').slice(0, 7) || null,
    commitMessage: (env['VERCEL_GIT_COMMIT_MESSAGE'] ?? '').split('\n')[0].slice(0, 140) || null,
    repo: env['VERCEL_GIT_REPO_OWNER'] && env['VERCEL_GIT_REPO_SLUG'] ? `${env['VERCEL_GIT_REPO_OWNER']}/${env['VERCEL_GIT_REPO_SLUG']}` : null,
    database: supa ? 'Supabase' : 'Bộ nhớ tạm (chạy thử)',
    databaseHost: supa ? supa.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : null,
  };
}

export const GET = handle(async (req) => {
  await requireAdmin(req);
  const store = getStore();
  const manual = clean(await store.getJson<Manual>(KEY).catch(() => null));
  const name = manual.domain || siteDomain(req);
  const [usage, lookup, heartbeat, lastWrite] = await Promise.all([
    store.usage ? store.usage().catch((e) => ({ db: null, media: null, error: e instanceof Error ? e.message : String(e) })) : null,
    name ? rdap(name) : null,
    store.getJson<Heartbeat>(HEARTBEAT_KEY).catch(() => null),
    store.lastWrite ? store.lastWrite().catch(() => null) : null,
  ]);
  const domain: DomainInfo | null = name
    ? {
        name,
        expires: lookup?.expires ?? (manual.domainExpires ? `${manual.domainExpires}T00:00:00+07:00` : null),
        created: lookup?.created ?? null,
        registrar: lookup?.registrar ?? (manual.registrar || null),
        source: lookup?.expires ? 'rdap' : manual.domainExpires ? 'manual' : null,
        ...(lookup?.error ? { error: lookup.error } : {}),
      }
    : null;
  return json({
    now: Date.now(),
    limits: { db: DB_LIMIT_MB * 1024 * 1024, media: MEDIA_LIMIT_MB * 1024 * 1024 },
    usage,
    hosting: hosting(),
    keepalive: { heartbeat, lastWrite, cronSecret: !!process.env['CRON_SECRET'] },
    domain,
    manual,
  });
});

export const PATCH = handle(async (req) => {
  await requireAdmin(req);
  const body = await readJson(req);
  const manual = clean(body);
  if (manual.domain && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(manual.domain)) throw new HttpError(400, 'Tên miền không hợp lệ.');
  await getStore().setJson(KEY, manual);
  if (manual.domain) rdapCache.delete(manual.domain);
  return json({ manual });
});

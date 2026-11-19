/**
 * Đăng nhập / đổi mật khẩu admin — kiểm tra trên máy chủ để mọi máy dùng chung một mật khẩu.
 *  POST /api/admin/login     { password }                 → { token, loginId }
 *  GET  /api/admin/login     (cần đăng nhập)              → { logins } — lịch sử đăng nhập (IP, thiết bị, thời gian)
 *  PUT  /api/admin/password  { oldPassword, newPassword }  → { token }   (cần đang đăng nhập)
 * Chưa đổi mật khẩu lần nào thì mật khẩu = biến môi trường ADMIN_API_KEY.
 * Đổi mật khẩu xong: mật khẩu cũ không đăng nhập được nữa, mọi phiên trên máy khác bị đăng xuất.
 */
import { randomBytes } from 'node:crypto';
import {
  HttpError,
  adminTokenForLogin,
  checkAdminPassword,
  clientIp,
  getStore,
  handle,
  json,
  rateLimit,
  readJson,
  requireAdmin,
  setAdminPassword,
} from '../_lib/orders';

const LOG_KEY = 'admin:logins';
const MAX_LOG = 40;

/** Một lần đăng nhập / thử sai / đổi mật khẩu. */
export interface LoginEvent {
  id: string;
  kind: 'login' | 'fail' | 'password';
  at: number;
  ip: string;
  ua: string;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

async function record(req: Request, kind: LoginEvent['kind']): Promise<string> {
  const id = randomBytes(8).toString('hex');
  const ev: LoginEvent = {
    id,
    kind,
    at: Date.now(),
    ip: clientIp(req),
    ua: (req.headers.get('user-agent') ?? '').slice(0, 200),
  };
  try {
    const store = getStore();
    const list = (await store.getJson<LoginEvent[]>(LOG_KEY)) ?? [];
    await store.setJson(LOG_KEY, [ev, ...list].slice(0, MAX_LOG));
  } catch (e) {
    // Ghi lịch sử lỗi thì vẫn cho đăng nhập.
    console.error('Không ghi được lịch sử đăng nhập', e);
  }
  return id;
}

export const POST = handle(async (req) => {
  if (!process.env['ADMIN_API_KEY']) throw new HttpError(503, 'Chưa cấu hình ADMIN_API_KEY trên máy chủ.');
  await rateLimit(req, 'admin-login', 10, 600);
  const body = await readJson(req);
  const password = str(body['password']).slice(0, 200);
  if (!password || !(await checkAdminPassword(password))) {
    await record(req, 'fail');
    throw new HttpError(401, 'Mật khẩu không đúng.');
  }
  const loginId = await record(req, 'login');
  return json({ token: await adminTokenForLogin(), loginId });
});

export const GET = handle(async (req) => {
  await requireAdmin(req);
  return json({ logins: (await getStore().getJson<LoginEvent[]>(LOG_KEY)) ?? [] });
});

export const PUT = handle(async (req) => {
  await requireAdmin(req);
  await rateLimit(req, 'admin-password', 10, 600);
  const body = await readJson(req);
  const oldPassword = str(body['oldPassword']).slice(0, 200);
  const newPassword = str(body['newPassword']).slice(0, 200);
  if (newPassword.length < 6) throw new HttpError(400, 'Mật khẩu mới tối thiểu 6 ký tự.');
  if (!(await checkAdminPassword(oldPassword))) throw new HttpError(401, 'Mật khẩu hiện tại không đúng.');
  const token = await setAdminPassword(newPassword);
  await record(req, 'password');
  return json({ token });
});

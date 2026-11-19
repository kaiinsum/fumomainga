/**
 * Đăng nhập / đổi mật khẩu admin — kiểm tra trên máy chủ để mọi máy dùng chung một mật khẩu.
 *  POST /api/admin/login     { password }                 → { token }
 *  PUT  /api/admin/password  { oldPassword, newPassword }  → { token }   (cần đang đăng nhập)
 * Chưa đổi mật khẩu lần nào thì mật khẩu = biến môi trường ADMIN_API_KEY.
 * Đổi mật khẩu xong: mật khẩu cũ không đăng nhập được nữa, mọi phiên trên máy khác bị đăng xuất.
 */
import { HttpError, adminTokenForLogin, checkAdminPassword, handle, json, rateLimit, readJson, requireAdmin, setAdminPassword } from '../_lib/orders';

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export const POST = handle(async (req) => {
  if (!process.env['ADMIN_API_KEY']) throw new HttpError(503, 'Chưa cấu hình ADMIN_API_KEY trên máy chủ.');
  await rateLimit(req, 'admin-login', 10, 600);
  const body = await readJson(req);
  const password = str(body['password']).slice(0, 200);
  if (!password || !(await checkAdminPassword(password))) throw new HttpError(401, 'Mật khẩu không đúng.');
  return json({ token: await adminTokenForLogin() });
});

export const PUT = handle(async (req) => {
  await requireAdmin(req);
  await rateLimit(req, 'admin-password', 10, 600);
  const body = await readJson(req);
  const oldPassword = str(body['oldPassword']).slice(0, 200);
  const newPassword = str(body['newPassword']).slice(0, 200);
  if (newPassword.length < 6) throw new HttpError(400, 'Mật khẩu mới tối thiểu 6 ký tự.');
  if (!(await checkAdminPassword(oldPassword))) throw new HttpError(401, 'Mật khẩu hiện tại không đúng.');
  return json({ token: await setAdminPassword(newPassword) });
});

/**
 * /api/contacts/:id — admin đánh dấu đã xử lý / ghi chú (PUT) hoặc xoá (DELETE) một lời nhắn.
 */
import { HttpError, getContacts, handle, json, readJson, requireAdmin } from '../_lib/orders';

const idOf = (req: Request) => {
  const id = Number(new URL(req.url).pathname.split('/').pop());
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Mã lời nhắn không hợp lệ.');
  return id;
};

export const PUT = handle(async (req) => {
  requireAdmin(req);
  const body = await readJson(req);
  const status = body['status'];
  if (status !== undefined && status !== 'new' && status !== 'done') throw new HttpError(400, 'Trạng thái không hợp lệ.');
  const adminNote = typeof body['adminNote'] === 'string' ? body['adminNote'].slice(0, 1000) : undefined;
  const updated = await getContacts().update(idOf(req), { ...(status ? { status } : {}), ...(adminNote !== undefined ? { adminNote } : {}) });
  if (!updated) throw new HttpError(404, 'Không tìm thấy lời nhắn.');
  return json({ contact: updated });
});

export const DELETE = handle(async (req) => {
  requireAdmin(req);
  await getContacts().remove(idOf(req));
  return json({ ok: true });
});

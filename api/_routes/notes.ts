/**
 * /api/admin/notes — ghi chú nội bộ cho sản phẩm (CHỈ admin). Lưu riêng trong app_kv 'admin:notes',
 * KHÔNG nằm trong catalog sản phẩm công khai nên khách không bao giờ thấy.
 *  GET → { notes: { "<productId>": { text, updatedAt } } }
 *  PATCH { id, text } → sửa 1 sản phẩm (text rỗng = xoá ghi chú)
 */
import { HttpError, getStore, handle, json, readJson, requireAdmin } from '../_lib/orders';

const KEY = 'admin:notes';
const MAX_LEN = 2000;
interface Note {
  text: string;
  updatedAt: number;
}
type Notes = Record<string, Note>;

const validId = (k: string) => /^[A-Za-z0-9_:.-]{1,120}$/.test(k);

function clean(raw: unknown): Notes {
  const out: Notes = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = v as Partial<Note> | null;
    if (validId(k) && n && typeof n.text === 'string' && n.text.trim()) {
      out[k] = { text: n.text.slice(0, MAX_LEN), updatedAt: Number(n.updatedAt) || 0 };
    }
  }
  return out;
}

const read = async () => clean(await getStore().getJson<Notes>(KEY));

export const GET = handle(async (req) => {
  await requireAdmin(req);
  return json({ notes: await read() });
});

export const PATCH = handle(async (req) => {
  await requireAdmin(req);
  const body = await readJson(req);
  const id = typeof body['id'] === 'string' ? body['id'] : '';
  if (!validId(id)) throw new HttpError(400, 'Mã sản phẩm không hợp lệ.');
  const text = typeof body['text'] === 'string' ? body['text'].trim() : '';
  if (text.length > MAX_LEN) throw new HttpError(400, `Ghi chú tối đa ${MAX_LEN} ký tự.`);
  const notes = await read();
  if (text) notes[id] = { text, updatedAt: Date.now() };
  else delete notes[id];
  if (Object.keys(notes).length > 5000) throw new HttpError(400, 'Quá nhiều ghi chú.');
  await getStore().setJson(KEY, notes);
  return json({ notes });
});

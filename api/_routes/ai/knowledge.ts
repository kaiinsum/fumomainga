/**
 * /api/ai/knowledge - file kiến thức (.md) của trợ lý AI (chỉ admin).
 * GET: nội dung đang dùng · PUT: lưu nội dung mới · DELETE: quay về file mặc định trong mã nguồn.
 */
import { KNOWLEDGE_KEY, MAX_KNOWLEDGE_CHARS, SavedKnowledge, readKnowledgeFile } from '../../_lib/ai';
import { HttpError, getStore, handle, json, readJson, requireAdmin } from '../../_lib/orders';

export const GET = handle(async (req) => {
  await requireAdmin(req);
  const saved = await getStore().getJson<SavedKnowledge>(KNOWLEDGE_KEY);
  return saved
    ? json({ ...saved, source: 'admin' })
    : json({ text: readKnowledgeFile(), fileName: 'kien-thuc.md', updatedAt: null, source: 'default' });
});

export const PUT = handle(async (req) => {
  await requireAdmin(req);
  const body = await readJson(req);
  const text = typeof body['text'] === 'string' ? body['text'].replace(/\r\n/g, '\n').trim() : '';
  if (text.length < 20) throw new HttpError(400, 'Nội dung kiến thức quá ngắn.');
  if (text.length > MAX_KNOWLEDGE_CHARS) {
    throw new HttpError(400, `File quá dài (tối đa ${MAX_KNOWLEDGE_CHARS.toLocaleString('vi-VN')} ký tự).`);
  }
  const fileName = typeof body['fileName'] === 'string' && body['fileName'].trim() ? body['fileName'].trim().slice(0, 120) : 'kien-thuc.md';
  const saved: SavedKnowledge = { text, fileName, updatedAt: Date.now() };
  await getStore().setJson(KNOWLEDGE_KEY, saved);
  return json({ ...saved, source: 'admin' });
});

export const DELETE = handle(async (req) => {
  await requireAdmin(req);
  await getStore().delKey(KNOWLEDGE_KEY);
  return json({ text: readKnowledgeFile(), fileName: 'kien-thuc.md', updatedAt: null, source: 'default' });
});

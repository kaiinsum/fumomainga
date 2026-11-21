/**
 * /api/leaderboard - bảng xếp hạng top 5 của từng minigame.
 *  GET  ?game=<id>                       → { game, top: [{ name, score, at }] }
 *  POST { game, name, score }            → { top, rank } (rank = hạng vừa đạt, 0 = không lọt top)
 *  DELETE ?game=<id>&at=<ms> (admin)     → xoá 1 dòng (tên xấu lọt lưới...) · ?all=1 → xoá cả bảng
 * Tên được lọc từ cấm (api/_lib/bad-words.ts). Điểm do trình duyệt gửi - chỉ chặn số vô lý + giới hạn tần suất.
 */
import { checkPlayerName } from '../_lib/bad-words';
import { HttpError, getStore, handle, rateLimit, readJson, requireAdmin } from '../_lib/orders';

const TOP = 5;
const KEEP = 20;
/** Các game có điểm + điểm tối đa hợp lý (chặn số bịa). */
const GAMES: Record<string, number> = {
  shmup: 50_000_000,
  'jp-type': 5_000_000,
  ninja: 2_000_000,
  crush: 50_000_000,
  merge: 2_000_000,
  piano: 5_000_000,
};

interface Entry {
  name: string;
  score: number;
  at: number;
}

const key = (game: string) => `lb:${game}`;
const reply = (body: unknown, status = 200, cdn = '') =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache', ...(cdn ? { 'vercel-cdn-cache-control': cdn } : {}) },
  });

function gameOf(v: unknown): string {
  const g = typeof v === 'string' ? v : '';
  if (!(g in GAMES)) throw new HttpError(400, 'Game không hợp lệ.');
  return g;
}

async function list(game: string): Promise<Entry[]> {
  return ((await getStore().getJson<Entry[]>(key(game))) ?? []).sort((a, b) => b.score - a.score || a.at - b.at);
}

export const GET = handle(async (req) => {
  const game = gameOf(new URL(req.url).searchParams.get('game'));
  return reply({ game, top: (await list(game)).slice(0, TOP) }, 200, 'max-age=3, stale-while-revalidate=10');
});

export const POST = handle(async (req) => {
  await rateLimit(req, 'leaderboard', 8, 600);
  const body = await readJson(req);
  const game = gameOf(body['game']);
  const score = Math.round(Number(body['score']));
  if (!Number.isFinite(score) || score <= 0 || score > GAMES[game]) throw new HttpError(400, 'Điểm không hợp lệ.');
  const name = (typeof body['name'] === 'string' ? body['name'] : '').replace(/\s+/g, ' ').trim();
  const bad = checkPlayerName(name);
  if (bad) throw new HttpError(400, bad);
  const cur = await list(game);
  const entry: Entry = { name, score, at: Date.now() };
  const next = [...cur, entry].sort((a, b) => b.score - a.score || a.at - b.at).slice(0, KEEP);
  const rank = next.indexOf(entry) + 1;
  if (rank === 0 || rank > TOP) return reply({ top: cur.slice(0, TOP), rank: 0 });
  await getStore().setJson(key(game), next);
  return reply({ top: next.slice(0, TOP), rank });
});

export const DELETE = handle(async (req) => {
  await requireAdmin(req);
  const url = new URL(req.url);
  const game = gameOf(url.searchParams.get('game'));
  // ?all=1 → xoá cả bảng của game.
  const all = url.searchParams.has('all');
  const at = Number(url.searchParams.get('at'));
  const next = all ? [] : (await list(game)).filter((e) => e.at !== at);
  await getStore().setJson(key(game), next);
  return reply({ top: next.slice(0, TOP) });
});

/**
 * /api/yt — tìm bài hát trên YouTube cho minigame Anime Piano Tiles.
 *  GET ?q=<từ khoá>  → { items: [{ id, title, channel, thumb, seconds }] }  (cần biến môi trường YOUTUBE_API_KEY)
 *  GET ?id=<videoId> → { item: { id, title, channel, thumb } }               (không cần key — dùng oEmbed)
 * Ưu tiên nhạc tiếng Nhật / anime (relevanceLanguage=ja, thể loại Âm nhạc). Có cache trong bộ nhớ để đỡ tốn quota.
 */
import { HttpError, handle } from '../_lib/orders';

interface Item {
  id: string;
  title: string;
  channel: string;
  thumb: string;
  seconds?: number;
}

const cache = new Map<string, { at: number; items: Item[] }>();
const CACHE_MS = 6 * 3600_000;
const ID_RE = /^[A-Za-z0-9_-]{11}$/;

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache', 'vercel-cdn-cache-control': status === 200 ? 'max-age=600' : 'no-store' },
  });

/** "PT3M25S" → 205 */
function isoSeconds(d: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d);
  return m ? (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + +(m[3] ?? 0) : 0;
}

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export const GET = handle(async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (id) {
    if (!ID_RE.test(id)) throw new HttpError(400, 'Mã video không hợp lệ.');
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`);
    if (!r.ok) throw new HttpError(404, 'Không tìm thấy video (hoặc video không cho phát nhúng).');
    const j = (await r.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
    return reply({ item: { id, title: j.title ?? 'Video YouTube', channel: j.author_name ?? '', thumb: j.thumbnail_url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` } });
  }

  const q = (url.searchParams.get('q') ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (q.length < 2) throw new HttpError(400, 'Nhập tên bài hát (ít nhất 2 ký tự).');
  const key = process.env['YOUTUBE_API_KEY'];
  if (!key) throw new HttpError(501, 'Tìm kiếm chưa được bật (thiếu YOUTUBE_API_KEY). Bạn có thể dán link YouTube để chơi.');

  const ck = q.toLowerCase();
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_MS) return reply({ items: hit.items, cached: true });

  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    maxResults: '12',
    q,
    videoEmbeddable: 'true',
    videoCategoryId: '10',
    relevanceLanguage: 'ja',
    safeSearch: 'strict',
    key,
  });
  const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!r.ok) {
    console.error('yt search:', r.status, (await r.text()).slice(0, 300));
    throw new HttpError(502, r.status === 403 ? 'Hết lượt tìm kiếm hôm nay, thử lại sau hoặc dán link YouTube.' : 'Không tìm được trên YouTube, thử lại sau.');
  }
  const j = (await r.json()) as { items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; thumbnails?: Record<string, { url: string }> } }[] };
  let items: Item[] = (j.items ?? [])
    .filter((x) => x.id?.videoId && ID_RE.test(x.id.videoId))
    .map((x) => ({
      id: x.id!.videoId!,
      title: decode(x.snippet?.title ?? ''),
      channel: decode(x.snippet?.channelTitle ?? ''),
      thumb: x.snippet?.thumbnails?.['medium']?.url ?? x.snippet?.thumbnails?.['default']?.url ?? '',
    }));
  // Lấy thời lượng (để bỏ video quá ngắn / quá dài).
  if (items.length) {
    const d = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${items.map((i) => i.id).join(',')}&key=${key}`).catch(() => null);
    if (d?.ok) {
      const dj = (await d.json()) as { items?: { id: string; contentDetails?: { duration?: string } }[] };
      const dur = new Map((dj.items ?? []).map((v) => [v.id, isoSeconds(v.contentDetails?.duration ?? '')]));
      items = items.map((i) => ({ ...i, seconds: dur.get(i.id) ?? 0 })).filter((i) => !i.seconds || (i.seconds >= 45 && i.seconds <= 900));
    }
  }
  cache.set(ck, { at: Date.now(), items });
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  return reply({ items });
});

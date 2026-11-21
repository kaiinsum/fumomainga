/**
 * Phân loại nguồn truy cập từ trường `ref` của lượt xem đầu tiên mỗi lần mở web:
 *   "<document.referrer hoặc (direct)>[ ##utm_source=..&utm_medium=..&utm_campaign=..&click=fb]"
 * (trình duyệt gửi — xem src/app/services/tracker.service.ts).
 */

export type SourceKind = 'search' | 'social' | 'campaign' | 'referral' | 'direct' | 'internal';

export interface TrafficSource {
  kind: SourceKind;
  /** Tên hiển thị: Google, Facebook, Zalo, abc.com, Trực tiếp... */
  name: string;
  /** Chiến dịch (utm) nếu có. */
  campaign?: { source: string; medium: string; campaign: string };
}

const SEARCH: [RegExp, string][] = [
  [/(^|\.)google\./, 'Google'],
  [/(^|\.)bing\.com$/, 'Bing'],
  [/(^|\.)coccoc\.com$/, 'Cốc Cốc'],
  [/(^|\.)yahoo\./, 'Yahoo'],
  [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'],
  [/(^|\.)yandex\./, 'Yandex'],
  [/(^|\.)baidu\.com$/, 'Baidu'],
  [/(^|\.)naver\.com$/, 'Naver'],
  [/(^|\.)ecosia\.org$/, 'Ecosia'],
  [/(^|\.)search\.brave\.com$/, 'Brave Search'],
];
const SOCIAL: [RegExp, string][] = [
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|facebook\.net)$/, 'Facebook'],
  [/(^|\.)messenger\.com$/, 'Messenger'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)threads\.net$/, 'Threads'],
  [/(^|\.)(zalo\.me|zaloapp\.com|zalo\.vn)$/, 'Zalo'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'],
  [/(^|\.)(twitter\.com|x\.com|t\.co)$/, 'X (Twitter)'],
  [/(^|\.)reddit\.com$/, 'Reddit'],
  [/(^|\.)(discord\.com|discord\.gg|discordapp\.com)$/, 'Discord'],
  [/(^|\.)pinterest\./, 'Pinterest'],
  [/(^|\.)(t\.me|telegram\.org)$/, 'Telegram'],
  [/(^|\.)linkedin\.com$/, 'LinkedIn'],
  [/(^|\.)(shopee\.vn|shopee\.com)$/, 'Shopee'],
];
/** Mã gắn kèm khi bấm quảng cáo / link chia sẻ (trình duyệt gửi dạng click=...). */
const CLICK_NAMES: Record<string, [SourceKind, string]> = {
  fb: ['social', 'Facebook'],
  gads: ['campaign', 'Google Ads'],
  tiktok: ['social', 'TikTok'],
  zalo: ['social', 'Zalo'],
};

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

export function classifySource(rawRef: string, siteHost: string): TrafficSource {
  const [refPart, tagPart = ''] = (rawRef ?? '').split(' ##');
  const tags = new URLSearchParams(tagPart);
  const utmSource = (tags.get('utm_source') ?? '').trim();
  if (utmSource) {
    const campaign = { source: utmSource, medium: (tags.get('utm_medium') ?? '').trim(), campaign: (tags.get('utm_campaign') ?? '').trim() };
    return { kind: 'campaign', name: utmSource, campaign };
  }
  const click = tags.get('click');
  if (click && CLICK_NAMES[click]) {
    const [kind, name] = CLICK_NAMES[click];
    return { kind, name };
  }
  const ref = refPart.trim();
  if (!ref || ref === '(direct)') return { kind: 'direct', name: 'Trực tiếp' };
  const h = host(ref);
  if (!h) return { kind: 'referral', name: ref.slice(0, 60) };
  const self = siteHost.replace(/^www\./, '').toLowerCase();
  // Chính web này (kể cả tên miền phụ / bản Vercel cùng tên, vd. fumomainga.io.vn ↔ fumomainga.vercel.app).
  if (h === self || h.split('.')[0] === self.split('.')[0]) {
    return { kind: 'internal', name: 'Trong web' };
  }
  for (const [re, name] of SEARCH) if (re.test(h)) return { kind: 'search', name };
  for (const [re, name] of SOCIAL) if (re.test(h)) return { kind: 'social', name };
  // Ứng dụng Android gửi referrer dạng android-app://com.facebook.katana
  if (/^android-app:\/\//.test(ref)) {
    const app = ref.replace('android-app://', '');
    if (/facebook|orca/.test(app)) return { kind: 'social', name: 'Facebook' };
    if (/zing\.zalo/.test(app)) return { kind: 'social', name: 'Zalo' };
    if (/google/.test(app)) return { kind: 'search', name: 'Google' };
  }
  return { kind: 'referral', name: h };
}

export interface SourceRow {
  kind: SourceKind;
  name: string;
  entries: number;
  visitors: number;
}

/** Gom các dòng (ref thô, số lượt vào, số khách) thành bảng nguồn + bảng chiến dịch. */
export function summarizeSources(rows: { ref: string; entries: number; visitors: number }[], siteHost: string) {
  const map = new Map<string, SourceRow>();
  const camps = new Map<string, { source: string; medium: string; campaign: string; entries: number; visitors: number }>();
  for (const r of rows) {
    const s = classifySource(r.ref, siteHost);
    if (s.kind === 'internal') continue;
    const k = `${s.kind}|${s.name.toLowerCase()}`;
    const cur = map.get(k) ?? { kind: s.kind, name: s.name, entries: 0, visitors: 0 };
    cur.entries += r.entries;
    // Cùng 1 nguồn có thể có nhiều link khác nhau → cộng số khách (gần đúng).
    cur.visitors += r.visitors;
    map.set(k, cur);
    if (s.campaign) {
      const ck = `${s.campaign.source}|${s.campaign.medium}|${s.campaign.campaign}`.toLowerCase();
      const c = camps.get(ck) ?? { ...s.campaign, entries: 0, visitors: 0 };
      c.entries += r.entries;
      c.visitors += r.visitors;
      camps.set(ck, c);
    }
  }
  const list = [...map.values()].sort((a, b) => b.entries - a.entries);
  const kinds: Record<Exclude<SourceKind, 'internal'>, number> = { search: 0, social: 0, campaign: 0, referral: 0, direct: 0 };
  for (const s of list) kinds[s.kind as keyof typeof kinds] += s.entries;
  return { list, kinds, campaigns: [...camps.values()].sort((a, b) => b.entries - a.entries) };
}

/** Nhãn ngắn cho cột "Đến từ" (bảng lượt xem gần nhất). */
export function sourceLabel(rawRef: string, siteHost: string): string {
  if (!rawRef) return '';
  const s = classifySource(rawRef, siteHost);
  if (s.kind === 'campaign') return `📣 ${s.campaign!.source}${s.campaign!.campaign ? ' · ' + s.campaign!.campaign : ''}`;
  const icon = { search: '🔎', social: '💬', referral: '🔗', direct: '⌨️', internal: '↩' }[s.kind];
  return `${icon} ${s.name}`;
}

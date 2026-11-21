/**
 * Vẽ avatar chibi SVG cho nhân vật Touhoudle (hình tự vẽ: màu tóc, màu mắt + phụ kiện đặc trưng).
 * Không phụ thuộc Angular - dùng được ở mọi nơi.
 */
import { Character } from './touhoudle-data';

export const avatarSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const HAIR: Record<string, string> = {
  Vàng: '#f1c84b',
  'Xanh dương': '#4a86d9',
  'Xanh nhạt': '#9ccbf0',
  'Xanh lá': '#4fb27a',
  Đen: '#35303f',
  Tím: '#9b6fd6',
  Đỏ: '#d9534f',
  Bạc: '#c9cfd8',
  Nâu: '#9a6a43',
  Hồng: '#f19ac4',
  Trắng: '#eef0f4',
  Cam: '#ef9a4a',
  Xám: '#8f949e',
};

/** Phụ kiện + màu mắt cho từng nhân vật. Cú pháp phụ kiện: "loại" hoặc "loại:màu". */
const LOOK: Record<string, { eyes?: string; acc?: string[] }> = {
  'Reimu Hakurei': { eyes: '#8b3a2e', acc: ['bow:#d8323c'] },
  'Marisa Kirisame': { eyes: '#d9a520', acc: ['witch:#26222e'] },
  'Alice Margatroid': { eyes: '#3b6fd1', acc: ['headband:#d8323c'] },
  Rumia: { eyes: '#c4282f', acc: ['ribbon:#d8323c'] },
  Daiyousei: { eyes: '#3c9a5f', acc: ['ribbon:#f5d142', 'wings-fairy'] },
  Cirno: { eyes: '#2b6fd6', acc: ['bow:#2b6fd6', 'wings-crystal'] },
  'Hong Meiling': { eyes: '#5a7a9a', acc: ['beret:#3a9a5f'] },
  Koakuma: { eyes: '#c4282f', acc: ['wings-bat:#7a2430'] },
  'Patchouli Knowledge': { eyes: '#8a5cc7', acc: ['mobcap:#e6d5ff'] },
  'Sakuya Izayoi': { eyes: '#3b6fd1', acc: ['maid'] },
  'Remilia Scarlet': { eyes: '#c4282f', acc: ['mobcap:#ffd6e6', 'wings-bat:#3b2440'] },
  'Flandre Scarlet': { eyes: '#c4282f', acc: ['mobcap:#ffe0e0', 'wings-crystal'] },
  'Letty Whiterock': { eyes: '#8a7fc0', acc: ['hat:#e8e6ff'] },
  Chen: { eyes: '#b5462e', acc: ['cat'] },
  'Lunasa Prismriver': { eyes: '#d9a520', acc: ['hat:#2c2c38'] },
  'Merlin Prismriver': { eyes: '#3b6fd1', acc: ['hat:#f19ac4'] },
  'Lyrica Prismriver': { eyes: '#9a6a43', acc: ['hat:#d8323c'] },
  'Youmu Konpaku': { eyes: '#3b6fd1', acc: ['headband:#26222e'] },
  'Yuyuko Saigyouji': { eyes: '#e0568f', acc: ['mobcap:#bfe0ff'] },
  'Ran Yakumo': { eyes: '#d9a520', acc: ['fox'] },
  'Yukari Yakumo': { eyes: '#8a5cc7', acc: ['mobcap:#ffffff'] },
  'Suika Ibuki': { eyes: '#8b3a2e', acc: ['horns:#c99a62'] },
  'Wriggle Nightbug': { eyes: '#3c9a5f', acc: ['antennae'] },
  'Mystia Lorelei': { eyes: '#e0568f', acc: ['wings-bird:#a57952'] },
  'Keine Kamishirasawa': { eyes: '#b5462e', acc: ['hat:#3b5fc0'] },
  'Tewi Inaba': { eyes: '#c4282f', acc: ['rabbit-short'] },
  'Reisen Udongein Inaba': { eyes: '#c4282f', acc: ['rabbit'] },
  'Eirin Yagokoro': { eyes: '#6f7a8a', acc: ['hat:#3b5fc0'] },
  'Kaguya Houraisan': { eyes: '#5a2a3a' },
  'Fujiwara no Mokou': { eyes: '#c4282f', acc: ['bow:#ffffff'] },
  'Aya Shameimaru': { eyes: '#c4282f', acc: ['tokin'] },
  'Medicine Melancholy': { eyes: '#3b6fd1', acc: ['ribbon:#d8323c'] },
  'Komachi Onozuka': { eyes: '#c4282f', acc: ['ribbon:#f1c84b'] },
  'Eiki Shiki': { eyes: '#3b6fd1', acc: ['hat:#2c3e70'] },
  'Shizuha Aki': { eyes: '#d9a520', acc: ['flower:#e2582c'] },
  'Minoriko Aki': { eyes: '#d9a520', acc: ['hat:#d24b3a'] },
  'Hina Kagiyama': { eyes: '#3c9a5f', acc: ['ribbon:#d8323c'] },
  'Nitori Kawashiro': { eyes: '#3b6fd1', acc: ['hat:#3a9a5f'] },
  'Momiji Inubashiri': { eyes: '#c4282f', acc: ['wolf', 'tokin'] },
  'Sanae Kochiya': { eyes: '#3c9a5f', acc: ['flower:#ffffff'] },
  'Kanako Yasaka': { eyes: '#c4282f', acc: ['shimenawa'] },
  'Suwako Moriya': { eyes: '#d9a520', acc: ['frog'] },
  'Iku Nagae': { eyes: '#c4282f', acc: ['hat:#26222e'] },
  'Tenshi Hinanawi': { eyes: '#c4282f', acc: ['hat:#26222e'] },
  Kisume: { eyes: '#3c9a5f' },
  'Yamame Kurodani': { eyes: '#9a6a43', acc: ['ribbon:#7a5230'] },
  'Parsee Mizuhashi': { eyes: '#3c9a5f' },
  'Yuugi Hoshiguma': { eyes: '#c4282f', acc: ['horn:#d8323c'] },
  'Satori Komeiji': { eyes: '#8a5cc7', acc: ['third-eye:#e0568f'] },
  'Rin Kaenbyou': { eyes: '#c4282f', acc: ['cat'] },
  'Utsuho Reiuji': { eyes: '#c4282f', acc: ['ribbon:#3a9a5f', 'wings-bat:#26222e'] },
  'Koishi Komeiji': { eyes: '#3c9a5f', acc: ['hat:#26222e', 'third-eye:#3b6fd1'] },
  Nazrin: { eyes: '#c4282f', acc: ['mouse'] },
  'Kogasa Tatara': { eyes: '#3b6fd1' },
  'Ichirin Kumoi': { eyes: '#3b6fd1', acc: ['hat:#3b5fc0'] },
  'Minamitsu Murasa': { eyes: '#3c9a5f', acc: ['hat:#ffffff'] },
  'Shou Toramaru': { eyes: '#d9a520', acc: ['flower:#e0568f'] },
  'Byakuren Hijiri': { eyes: '#d9a520' },
  'Nue Houjuu': { eyes: '#c4282f', acc: ['wings-bat:#d8323c'] },
  'Hatate Himekaidou': { eyes: '#8a5cc7', acc: ['tokin'] },
  'Kyouko Kasodani': { eyes: '#3c9a5f', acc: ['wolf'] },
  'Yoshika Miyako': { eyes: '#8a8a8a', acc: ['hat:#c44a3a'] },
  'Seiga Kaku': { eyes: '#3b6fd1', acc: ['flower:#3b6fd1'] },
  'Soga no Tojiko': { eyes: '#3c9a5f', acc: ['hat:#26222e'] },
  'Mononobe no Futo': { eyes: '#8a8a8a', acc: ['hat:#26222e'] },
  'Toyosatomimi no Miko': { eyes: '#9a6a43', acc: ['earmuffs:#8a5cc7'] },
  'Mamizou Futatsuiwa': { eyes: '#9a6a43', acc: ['leaf', 'mouse:#7a5230'] },
  Wakasagihime: { eyes: '#3b6fd1', acc: ['hat:#3a9a5f'] },
  Sekibanki: { eyes: '#c4282f', acc: ['bow:#3b5fc0'] },
  'Kagerou Imaizumi': { eyes: '#c4282f', acc: ['wolf'] },
  'Seija Kijin': { eyes: '#c4282f', acc: ['horns:#ffffff'] },
  'Sukuna Shinmyoumaru': { eyes: '#8a5cc7', acc: ['hat:#5a2a3a'] },
  'Raiko Horikawa': { eyes: '#c4282f', acc: ['earmuffs:#d8323c'] },
  Seiran: { eyes: '#c4282f', acc: ['rabbit'] },
  Ringo: { eyes: '#c4282f', acc: ['rabbit'] },
  'Doremy Sweet': { eyes: '#3b6fd1', acc: ['hat:#d8323c'] },
  'Sagume Kishin': { eyes: '#c4282f', acc: ['wings-single'] },
  Clownpiece: { eyes: '#c4282f', acc: ['hat:#3b5fc0', 'wings-fairy'] },
  Junko: { eyes: '#c4282f', acc: ['halo'] },
  'Hecatia Lapislazuli': { eyes: '#c4282f', acc: ['halo'] },
  'Eternity Larva': { eyes: '#d9a520', acc: ['antennae', 'leaf'] },
  'Aunn Komano': { eyes: '#d9a520', acc: ['horn:#f1c84b'] },
  'Narumi Yatadera': { eyes: '#c4282f', acc: ['hat:#d8323c'] },
  'Okina Matara': { eyes: '#c4282f', acc: ['hat:#26222e'] },
  'Keiki Haniyasushin': { eyes: '#3b6fd1', acc: ['headband:#f1c84b'] },
  'Saki Kurokoma': { eyes: '#c4282f', acc: ['hat:#7a5230'] },
};

const esc = (s: string) => s.replace(/[^#a-zA-Z0-9]/g, '');

/** Vẽ chibi thành chuỗi SVG (đặt vào img qua data URL). */
function drawChibi(c: Character): string {
  const hair = HAIR[c.hair] ?? '#8f949e';
  const look = LOOK[c.name] ?? {};
  const eyes = esc(look.eyes ?? '#5a3a2a');
  const back: string[] = [];
  const front: string[] = [];
  for (const raw of look.acc ?? []) {
    const [kind, col] = raw.split(':');
    const color = esc(col ?? hair);
    switch (kind) {
      case 'bow':
        front.push(`<path d="M32 13 L14 4 L16 22 Z M32 13 L50 4 L48 22 Z" fill="${color}" stroke="#0002"/><circle cx="32" cy="13" r="4" fill="${color}" stroke="#0003"/>`);
        break;
      case 'ribbon':
        front.push(`<path d="M47 17 l9 -6 l-1 11 Z M47 17 l10 7 l-11 2 Z" fill="${color}" stroke="#0002"/><circle cx="47" cy="18" r="2.5" fill="${color}"/>`);
        break;
      case 'witch':
        front.push(`<ellipse cx="32" cy="17" rx="27" ry="5" fill="${color}"/><path d="M19 17 Q30 -10 46 -2 Q38 4 44 17 Z" fill="${color}"/><rect x="20" y="13" width="24" height="3" fill="#fff" opacity=".85"/>`);
        break;
      case 'mobcap':
        front.push(`<ellipse cx="32" cy="15" rx="22" ry="10" fill="${color}" stroke="#0002"/><path d="M12 18 Q32 26 52 18" fill="none" stroke="#d8323c" stroke-width="2.4"/>`);
        break;
      case 'hat':
        front.push(`<path d="M13 19 Q14 3 32 3 Q50 3 51 19 Z" fill="${color}" stroke="#0003"/><rect x="12" y="17" width="40" height="4" rx="2" fill="${color}" stroke="#0003"/>`);
        break;
      case 'beret':
        front.push(`<ellipse cx="32" cy="13" rx="22" ry="8" fill="${color}"/><path d="M32 7 l1.6 3.4 3.7.4 -2.8 2.5.8 3.6 -3.3-1.9 -3.3 1.9.8-3.6 -2.8-2.5 3.7-.4Z" fill="#f5d142"/>`);
        break;
      case 'headband':
        front.push(`<path d="M12 22 Q32 6 52 22" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`);
        break;
      case 'maid':
        front.push(`<path d="M14 18 Q32 8 50 18" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M16 16 q4-5 8 0 q4-5 8 0 q4-5 8 0 q4-5 8 0" fill="none" stroke="#ccd" stroke-width="1.4"/>`);
        break;
      case 'cat':
      case 'fox':
      case 'wolf': {
        const tall = kind === 'fox' ? 15 : kind === 'wolf' ? 12 : 10;
        back.push(`<path d="M12 22 L10 ${20 - tall} L24 14 Z M52 22 L54 ${20 - tall} L40 14 Z" fill="${color}" stroke="#0002"/><path d="M14 19 L13 ${22 - tall} L21 15 Z M50 19 L51 ${22 - tall} L43 15 Z" fill="#f6c9d0" opacity=".8"/>`);
        break;
      }
      case 'rabbit':
      case 'rabbit-short': {
        const h = kind === 'rabbit' ? 22 : 12;
        back.push(`<ellipse cx="22" cy="${12 - h / 2}" rx="5" ry="${h}" fill="#f4f1fa" stroke="#0002" transform="rotate(-10 22 12)"/><ellipse cx="42" cy="${12 - h / 2}" rx="5" ry="${h}" fill="#f4f1fa" stroke="#0002" transform="rotate(10 42 12)"/>`);
        break;
      }
      case 'mouse':
        back.push(`<circle cx="12" cy="12" r="8" fill="${col ? color : '#8f949e'}" stroke="#0002"/><circle cx="52" cy="12" r="8" fill="${col ? color : '#8f949e'}" stroke="#0002"/><circle cx="12" cy="12" r="4" fill="#f6c9d0"/><circle cx="52" cy="12" r="4" fill="#f6c9d0"/>`);
        break;
      case 'horns':
        front.push(`<path d="M20 14 L14 0 L25 11 Z M44 14 L50 0 L39 11 Z" fill="${color}" stroke="#0003"/>`);
        break;
      case 'horn':
        front.push(`<path d="M28 12 L32 -2 L36 12 Z" fill="${color}" stroke="#0003"/>`);
        break;
      case 'tokin':
        front.push(`<path d="M27 9 L32 4 L37 9 L36 14 L28 14 Z" fill="#d8323c" stroke="#0003"/>`);
        break;
      case 'frog':
        front.push(`<ellipse cx="32" cy="17" rx="27" ry="5" fill="#8c6bb8"/><path d="M18 17 Q32 -2 46 17 Z" fill="#8c6bb8"/><circle cx="25" cy="6" r="4" fill="#fff"/><circle cx="39" cy="6" r="4" fill="#fff"/><circle cx="25" cy="6" r="2" fill="#222"/><circle cx="39" cy="6" r="2" fill="#222"/>`);
        break;
      case 'third-eye':
        front.push(`<path d="M44 58 Q50 46 56 40" fill="none" stroke="${color}" stroke-width="1.6"/><circle cx="52" cy="54" r="6" fill="${color}"/><circle cx="52" cy="54" r="2.6" fill="#fff"/><circle cx="52" cy="54" r="1.3" fill="#c4282f"/>`);
        break;
      case 'wings-bat':
        back.push(`<path d="M10 36 L0 22 L4 34 L-2 38 L6 42 Z M54 36 L64 22 L60 34 L66 38 L58 42 Z" fill="${color}"/>`);
        break;
      case 'wings-fairy':
        back.push(`<ellipse cx="6" cy="34" rx="7" ry="12" fill="#bfe8ff" opacity=".8"/><ellipse cx="58" cy="34" rx="7" ry="12" fill="#bfe8ff" opacity=".8"/>`);
        break;
      case 'wings-crystal':
        back.push(`<path d="M8 30 L0 24 L4 34 Z M8 40 L-1 40 L6 46 Z M56 30 L64 24 L60 34 Z M56 40 L65 40 L58 46 Z" fill="#9fe3ff" stroke="#fff"/><path d="M6 34 L0 32 M58 34 L64 32" stroke="#f5d142" stroke-width="2"/>`);
        break;
      case 'wings-bird':
        back.push(`<path d="M10 34 Q-2 26 2 44 Q6 38 10 40 Z M54 34 Q66 26 62 44 Q58 38 54 40 Z" fill="${color}"/>`);
        break;
      case 'wings-single':
        back.push(`<path d="M54 30 Q66 18 64 40 Q60 34 54 38 Z" fill="#ffffff" stroke="#0002"/>`);
        break;
      case 'antennae':
        front.push(`<path d="M27 12 Q22 2 18 0 M37 12 Q42 2 46 0" fill="none" stroke="#26222e" stroke-width="1.6"/><circle cx="18" cy="0.5" r="2.4" fill="#26222e"/><circle cx="46" cy="0.5" r="2.4" fill="#26222e"/>`);
        break;
      case 'leaf':
        front.push(`<path d="M30 10 Q34 0 44 4 Q40 12 30 10 Z" fill="#4fb27a" stroke="#2e7a4f"/>`);
        break;
      case 'flower':
        front.push(`<g transform="translate(46 16)"><circle r="3.4" cx="0" cy="-3" fill="${color}"/><circle r="3.4" cx="3" cy="0" fill="${color}"/><circle r="3.4" cx="0" cy="3" fill="${color}"/><circle r="3.4" cx="-3" cy="0" fill="${color}"/><circle r="2" fill="#f5d142"/></g>`);
        break;
      case 'shimenawa':
        back.push(`<circle cx="32" cy="36" r="30" fill="none" stroke="#a5703d" stroke-width="5"/><path d="M10 14 v6 M54 14 v6 M32 6 v6" stroke="#fff" stroke-width="2"/>`);
        break;
      case 'halo':
        back.push(`<ellipse cx="32" cy="5" rx="14" ry="4" fill="none" stroke="#f5d142" stroke-width="2.5"/>`);
        break;
      case 'earmuffs':
        front.push(`<path d="M12 30 Q12 6 32 6 Q52 6 52 30" fill="none" stroke="#26222e" stroke-width="2"/><circle cx="11" cy="32" r="6" fill="${color}"/><circle cx="53" cy="32" r="6" fill="${color}"/>`);
        break;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 72 72">
<defs><radialGradient id="bg" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="${hair}" stop-opacity=".45"/></radialGradient></defs>
<circle cx="32" cy="32" r="35" fill="url(#bg)"/>
${back.join('')}
<path d="M10 34 Q8 10 32 9 Q56 10 54 34 L56 56 Q48 50 44 54 L20 54 Q16 50 8 56 Z" fill="${hair}"/>
<circle cx="32" cy="36" r="17" fill="#ffe8d6"/>
<path d="M14 34 Q14 14 32 14 Q50 14 50 34 Q46 24 40 26 Q36 20 32 26 Q28 20 24 26 Q18 24 14 34 Z" fill="${hair}"/>
<ellipse cx="25.5" cy="38" rx="3.4" ry="4.2" fill="${eyes}"/><ellipse cx="38.5" cy="38" rx="3.4" ry="4.2" fill="${eyes}"/>
<circle cx="24.5" cy="36.5" r="1.3" fill="#fff"/><circle cx="37.5" cy="36.5" r="1.3" fill="#fff"/>
<ellipse cx="21" cy="44" rx="3" ry="1.6" fill="#f6a9b8" opacity=".7"/><ellipse cx="43" cy="44" rx="3" ry="1.6" fill="#f6a9b8" opacity=".7"/>
<path d="M29.5 45 Q32 47 34.5 45" fill="none" stroke="#8a4a3a" stroke-width="1.3" stroke-linecap="round"/>
${front.join('')}
</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

const chibiCache = new Map<string, string>();
export function chibiUrl(c: Character): string {
  let url = chibiCache.get(c.name);
  if (!url) {
    url = drawChibi(c);
    chibiCache.set(c.name, url);
  }
  return url;
}


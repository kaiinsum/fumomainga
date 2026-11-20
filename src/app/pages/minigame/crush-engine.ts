/**
 * "Fumo Crush Saga" — ghép 3 bé fumo cùng màu để đánh quái đang kéo tới đền Hakurei.
 *  - 3 viên: chém 1 nhát vào con quái gần nhất
 *  - 4 viên: ném bom nổ lan
 *  - 5 viên: laser xuyên cả hàng quái
 *  - 6+ viên: chưởng chiêu đặc biệt "Mộng Tưởng Phong Ấn" (trúng mọi quái + hồi máu đền)
 * Bàn luôn có nước đi (hết nước → tự xáo bàn). Chơi vô tận: 5 chương, mỗi chương vài đợt quái + 1 boss,
 * hết chương 5 thì sang "vòng" mới mạnh hơn.
 */

import { playBaka, sfx } from '../../shared/sfx';
import { perf } from '../../core/perf';

export const W = 720;
export const H = 1100;
const FONT = 'Montserrat, "Segoe UI", Roboto, Arial, sans-serif';
const BEST_KEY = 'fumo.crush.best';

// ---------- Bố cục ----------
const FIELD_H = 400; // chiến trường phía trên
const GROUND_Y = 330; // mặt đất nơi quái đi
const GATE_X = 120; // cổng torii (quái đi tới đây là đánh đền)
const COLS = 8;
const ROWS = 8;
const CELL = 84;
const BX = (W - COLS * CELL) / 2;
const BY = FIELD_H + 16;

// ---------- 6 loại fumo (6 màu glow dễ phân biệt) ----------
export interface GemKind {
  id: string;
  name: string;
  color: string;
}
export const GEMS: GemKind[] = [
  { id: 'cirno', name: 'Cirno', color: '#2f9bff' },
  { id: 'meiling', name: 'Meiling', color: '#21d07a' },
  { id: 'flandre', name: 'Flandre', color: '#ffd21f' },
  { id: 'teto', name: 'Satori', color: '#ff3b5c' },
  { id: 'yukari', name: 'Yukari', color: '#a35cff' },
  { id: 'yuyuko', name: 'Yuyuko', color: '#ff7ad9' },
];

// ---------- Cốt truyện: 5 chương, mỗi chương 1 boss ----------
interface Chapter {
  place: string;
  story: string;
  boss: string;
  bossTitle: string;
  img: string;
  aura: string;
  sky: [string, string];
  ground: string;
  /** Màu quái thường của chương. */
  mob: string;
}
export const CHAPTERS: Chapter[] = [
  {
    place: 'Hồ Sương Mù',
    story: 'Sương lạnh phủ kín hồ, bầy yêu tinh nghịch ngợm kéo về phía đền…',
    boss: 'Cirno',
    bossTitle: 'Tiên băng mạnh nhất',
    img: 'jp-type/boss-cirno.webp',
    aura: '#6fd3ff',
    sky: ['#9fd8ff', '#e8f6ff'],
    ground: '#5f9fc9',
    mob: '#8fd6ff',
  },
  {
    place: 'Dinh thự Quỷ Đỏ',
    story: 'Màn sương đỏ che mặt trời — tiểu thư ma cà rồng thức giấc.',
    boss: 'Remilia',
    bossTitle: 'Tiểu thư của bóng đêm',
    img: 'fumo-ninja/remilia.webp',
    aura: '#ff3b5c',
    sky: ['#3a0a1c', '#b3203f'],
    ground: '#4a1020',
    mob: '#ff6b8a',
  },
  {
    place: 'Địa Linh Điện',
    story: 'Sâu dưới lòng đất, có ai đó đang đi theo bạn mà không ai nhìn thấy…',
    boss: 'Koishi',
    bossTitle: 'Cô bé vô thức',
    img: 'fumo-ninja/koishi.webp',
    aura: '#5fe39b',
    sky: ['#120c22', '#3b2a55'],
    ground: '#2a1f3a',
    mob: '#8be3b4',
  },
  {
    place: 'Đền Hakurei',
    story: 'Đền vắng khách, hòm công đức trống rỗng — vu nữ nổi giận thật rồi!',
    boss: 'Reimu',
    bossTitle: 'Vu nữ đền Hakurei',
    img: 'jp-type/boss-reimu.webp',
    aura: '#ff4040',
    sky: ['#ffb36b', '#ffe3c2'],
    ground: '#8a5a33',
    mob: '#ffb0a0',
  },
  {
    place: 'Dị biến cuối cùng',
    story: 'Bóng tối nuốt trọn Gensokyo — Reimu bóng tối xuất hiện.',
    boss: 'Reimu bóng tối',
    bossTitle: 'Dị biến tối thượng',
    img: 'jp-type/boss-dark-reimu.webp',
    aura: '#b04dff',
    sky: ['#05010d', '#2b0a45'],
    ground: '#1a0828',
    mob: '#c58bff',
  },
];

export type CrushState = 'title' | 'playing' | 'over';
export interface CrushResult {
  score: number;
  best: number;
  newBest: boolean;
  chapter: number;
  loop: number;
  kills: number;
  bosses: number;
  place: string;
}

// ---------- Kiểu dữ liệu ----------
interface Gem {
  t: number; // loại 0..5
  x: number; // vị trí vẽ (px)
  y: number;
  scale: number;
  alpha: number;
  /** Bị đóng băng / phong ấn: không đổi chỗ được, ghép trúng hoặc ghép cạnh thì vỡ. */
  ice: number;
  dying?: boolean;
}

type MobKind = 'kedama' | 'fairy' | 'ghost' | 'bat';
interface Enemy {
  kind: MobKind | 'boss';
  x: number;
  y: number;
  hp: number;
  max: number;
  speed: number;
  atk: number;
  cd: number;
  r: number;
  hurt: number;
  wob: number;
  /** Boss: hẹn giờ chiêu. */
  skill?: number;
  shot?: number;
  /** Koishi: đang tàng hình (chém thường không trúng). */
  hidden?: number;
  dead?: boolean;
}

interface Fx {
  kind: 'slash' | 'boom' | 'laser' | 'spell' | 'ring';
  x: number;
  y: number;
  color: string;
  t: number;
  life: number;
  r?: number;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}
interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  size: number;
}
/** Đòn đánh bay từ bàn ghép lên chiến trường. */
interface Bolt {
  x: number;
  y: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
  color: string;
  size: number;
  hit: () => void;
}
/** Đạn boss bay vào đền. */
interface Orb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  color: string;
}

type Phase = 'idle' | 'swap' | 'unswap' | 'clear' | 'fall' | 'shuffle';

const cx = (c: number) => BX + c * CELL + CELL / 2;
const cy = (r: number) => BY + r * CELL + CELL / 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class CrushGame {
  state: CrushState = 'title';
  /** Thông số admin chỉnh (xem models/game-params.ts). */
  params: Record<string, number> = {};
  private p = (k: string, d: number) => this.params[k] ?? d;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly imgs = new Map<string, HTMLImageElement>();
  /** Ảnh ô fumo dựng sẵn (nền + glow + ảnh) — vẽ nhanh mỗi khung hình. */
  private tiles: HTMLCanvasElement[] = [];
  private iceTile?: HTMLCanvasElement;
  private dpr = 1;
  private raf = 0;
  private last = 0;

  private grid: (Gem | null)[][] = [];
  private phase: Phase = 'idle';
  private sel: { r: number; c: number } | null = null;
  private down: { r: number; c: number; x: number; y: number } | null = null;
  private swapA: { r: number; c: number } | null = null;
  private swapB: { r: number; c: number } | null = null;
  private combo = 0;
  private idle = 0;
  private hint: [{ r: number; c: number }, { r: number; c: number }] | null = null;

  private enemies: Enemy[] = [];
  private fx: Fx[] = [];
  private parts: Particle[] = [];
  private pops: Popup[] = [];
  private bolts: Bolt[] = [];
  private orbs: Orb[] = [];

  private time = 0;
  private score = 0;
  private best = 0;
  private kills = 0;
  private bosses = 0;
  private hp = 100;
  private maxHp = 100;
  private chapter = 0;
  private loop = 0;
  private wave = 0;
  private toSpawn = 0;
  private spawnT = 0;
  private bossOut = false;
  private banner: { title: string; sub: string; t: number; color: string } | null = null;
  private pause = 0; // nghỉ giữa các đợt (giây)
  /** Đếm ngược sang chương mới sau khi hạ boss. */
  private chapterIn = 0;
  private shake = 0;
  private flash = 0;
  private flashColor = '#fff';
  private petals: { x: number; y: number; s: number; v: number }[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onState: (s: CrushState, r?: CrushResult) => void,
  ) {
    this.ctx = canvas.getContext('2d')!;
    const load = (src: string) => {
      const img = new Image();
      img.onload = () => this.buildTiles();
      img.src = src;
      this.imgs.set(src, img);
    };
    GEMS.forEach((g) => load(`fumo-ninja/${g.id}.webp`));
    CHAPTERS.forEach((c) => load(c.img));
    try {
      this.best = Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      this.best = 0;
    }
    for (let i = 0; i < 18; i++) this.petals.push({ x: rand(0, W), y: rand(0, FIELD_H), s: rand(2, 5), v: rand(10, 30) });
    this.resize();
    this.newBoard();
    addEventListener('resize', this.resize);
    canvas.addEventListener('pointerdown', this.onDown);
    addEventListener('pointermove', this.onMove);
    addEventListener('pointerup', this.onUp);
    addEventListener('pointercancel', this.onUp);
    this.raf = requestAnimationFrame(this.loopFn);
    try {
      // Chỉ để kiểm thử tự động (bật bằng localStorage 'fumo.debug').
      if (localStorage.getItem('fumo.debug')) (window as unknown as { fumoCrush?: CrushGame }).fumoCrush = this;
    } catch {
      /* bỏ qua */
    }
  }

  get bestScore(): number {
    return this.best;
  }

  start(): void {
    this.score = 0;
    this.kills = 0;
    this.bosses = 0;
    this.hp = this.maxHp = this.p('shrineHp', 100);
    this.chapter = 0;
    this.loop = 0;
    this.enemies = [];
    this.fx = [];
    this.parts = [];
    this.pops = [];
    this.bolts = [];
    this.orbs = [];
    this.combo = 0;
    this.sel = null;
    this.hint = null;
    this.idle = 0;
    this.chapterIn = 0;
    this.newBoard();
    this.phase = 'idle';
    this.startChapter();
    this.state = 'playing';
    this.onState('playing');
    sfx.play('bossIn');
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    removeEventListener('pointermove', this.onMove);
    removeEventListener('pointerup', this.onUp);
    removeEventListener('pointercancel', this.onUp);
  }

  // =====================================================================
  // Kích thước / ảnh dựng sẵn
  // =====================================================================
  private readonly resize = () => {
    const dpr = Math.min(perf.lite ? 1 : 2, devicePixelRatio || 1);
    const w = this.canvas.clientWidth || W;
    const scale = (w / W) * dpr;
    this.dpr = scale;
    this.canvas.width = Math.round(W * scale);
    this.canvas.height = Math.round(H * scale);
    this.buildTiles();
  };

  private buildTiles(): void {
    const s = this.dpr;
    const size = Math.ceil(CELL * s);
    this.tiles = GEMS.map((g) => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const x = c.getContext('2d')!;
      x.scale(s, s);
      // Nền ô có glow theo màu
      const grd = x.createRadialGradient(CELL / 2, CELL / 2, 4, CELL / 2, CELL / 2, CELL / 2);
      grd.addColorStop(0, g.color + 'cc');
      grd.addColorStop(0.55, g.color + '55');
      grd.addColorStop(1, g.color + '00');
      x.fillStyle = grd;
      x.fillRect(0, 0, CELL, CELL);
      x.strokeStyle = g.color;
      x.lineWidth = 3;
      x.shadowColor = g.color;
      x.shadowBlur = 12;
      roundRect(x, 7, 7, CELL - 14, CELL - 14, 18);
      x.stroke();
      x.shadowBlur = 0;
      const img = this.imgs.get(`fumo-ninja/${g.id}.webp`);
      if (img?.complete && img.naturalWidth) {
        const k = Math.min((CELL - 18) / img.naturalWidth, (CELL - 18) / img.naturalHeight);
        const iw = img.naturalWidth * k;
        const ih = img.naturalHeight * k;
        x.shadowColor = g.color;
        x.shadowBlur = 10;
        x.drawImage(img, (CELL - iw) / 2, (CELL - ih) / 2 + 2, iw, ih);
      }
      return c;
    });
    const ice = document.createElement('canvas');
    ice.width = ice.height = size;
    const ix = ice.getContext('2d')!;
    ix.scale(s, s);
    ix.fillStyle = 'rgba(200, 240, 255, .55)';
    roundRect(ix, 5, 5, CELL - 10, CELL - 10, 16);
    ix.fill();
    ix.strokeStyle = 'rgba(255,255,255,.95)';
    ix.lineWidth = 3;
    ix.stroke();
    ix.strokeStyle = 'rgba(255,255,255,.7)';
    ix.lineWidth = 2;
    ix.beginPath();
    ix.moveTo(18, 22);
    ix.lineTo(34, 38);
    ix.lineTo(28, 54);
    ix.moveTo(60, 18);
    ix.lineTo(52, 40);
    ix.lineTo(66, 58);
    ix.stroke();
    this.iceTile = ice;
  }

  // =====================================================================
  // Bàn ghép
  // =====================================================================
  private newBoard(): void {
    for (let tries = 0; tries < 50; tries++) {
      this.grid = [];
      for (let r = 0; r < ROWS; r++) {
        const row: (Gem | null)[] = [];
        for (let c = 0; c < COLS; c++) {
          let t = 0;
          do t = Math.floor(Math.random() * GEMS.length);
          while (
            (c >= 2 && row[c - 1]!.t === t && row[c - 2]!.t === t) ||
            (r >= 2 && this.grid[r - 1][c]!.t === t && this.grid[r - 2][c]!.t === t)
          );
          row.push(this.gem(t, r, c));
        }
        this.grid.push(row);
      }
      if (this.findMove()) return;
    }
  }

  private gem(t: number, r: number, c: number, fromY?: number): Gem {
    return { t, x: cx(c), y: fromY ?? cy(r), scale: 1, alpha: 1, ice: 0 };
  }

  /** Các nhóm ghép (hàng ngang / dọc ≥3, nhóm chữ L/T gộp chung). */
  private findGroups(): { cells: { r: number; c: number }[]; t: number }[] {
    const g = this.grid;
    const id = (r: number, c: number) => r * COLS + c;
    const parent = new Map<number, number>();
    const find = (a: number): number => {
      while (parent.get(a) !== a) a = parent.get(a)!;
      return a;
    };
    const join = (a: number, b: number) => {
      if (!parent.has(a)) parent.set(a, a);
      if (!parent.has(b)) parent.set(b, b);
      parent.set(find(a), find(b));
    };
    const run = (cells: [number, number][]) => {
      for (let i = 1; i < cells.length; i++) join(id(...cells[0]), id(...cells[i]));
    };
    for (let r = 0; r < ROWS; r++) {
      let s = 0;
      for (let c = 1; c <= COLS; c++) {
        if (c < COLS && g[r][c] && g[r][s] && g[r][c]!.t === g[r][s]!.t) continue;
        if (c - s >= 3 && g[r][s]) run(Array.from({ length: c - s }, (_, k) => [r, s + k] as [number, number]));
        s = c;
      }
    }
    for (let c = 0; c < COLS; c++) {
      let s = 0;
      for (let r = 1; r <= ROWS; r++) {
        if (r < ROWS && g[r][c] && g[s][c] && g[r][c]!.t === g[s][c]!.t) continue;
        if (r - s >= 3 && g[s][c]) run(Array.from({ length: r - s }, (_, k) => [s + k, c] as [number, number]));
        s = r;
      }
    }
    const groups = new Map<number, { r: number; c: number }[]>();
    for (const k of parent.keys()) {
      const root = find(k);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push({ r: Math.floor(k / COLS), c: k % COLS });
    }
    return [...groups.values()].map((cells) => ({ cells, t: g[cells[0].r][cells[0].c]!.t }));
  }

  private matchAt(r: number, c: number): boolean {
    const g = this.grid;
    const t = g[r][c]?.t;
    if (t === undefined) return false;
    let h = 1;
    for (let k = c - 1; k >= 0 && g[r][k]?.t === t; k--) h++;
    for (let k = c + 1; k < COLS && g[r][k]?.t === t; k++) h++;
    if (h >= 3) return true;
    let v = 1;
    for (let k = r - 1; k >= 0 && g[k][c]?.t === t; k--) v++;
    for (let k = r + 1; k < ROWS && g[k][c]?.t === t; k++) v++;
    return v >= 3;
  }

  /** Tìm 1 nước đi hợp lệ (để gợi ý / kiểm tra còn đường đi). */
  private findMove(): [{ r: number; c: number }, { r: number; c: number }] | null {
    const g = this.grid;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        for (const [dr, dc] of [
          [0, 1],
          [1, 0],
        ]) {
          const r2 = r + dr;
          const c2 = c + dc;
          if (r2 >= ROWS || c2 >= COLS) continue;
          const a = g[r][c];
          const b = g[r2][c2];
          if (!a || !b || a.ice || b.ice || a.t === b.t) continue;
          g[r][c] = b;
          g[r2][c2] = a;
          const ok = this.matchAt(r, c) || this.matchAt(r2, c2);
          g[r][c] = a;
          g[r2][c2] = b;
          if (ok) return [
            { r, c },
            { r: r2, c: c2 },
          ];
        }
    return null;
  }

  /** Hết nước đi → xáo bàn (giữ nguyên số lượng mỗi loại, không tạo sẵn hàng ghép, chắc chắn có nước). */
  private shuffle(): void {
    const all = this.grid.flat().filter((x): x is Gem => !!x);
    for (let tries = 0; tries < 200; tries++) {
      for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [all[i], all[j]] = [all[j], all[i]];
      }
      let k = 0;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) this.grid[r][c] = all[k++];
      if (!this.findGroups().length && this.findMove()) break;
      if (tries === 199) {
        // Rất hiếm: không xếp được → làm bàn mới.
        const ice = all.map((g) => g.ice);
        this.newBoard();
        this.grid.flat().forEach((g, i) => g && (g.ice = ice[i] ?? 0));
      }
    }
    this.grid.flat().forEach((g) => g && ((g.scale = 0.2), (g.alpha = 0.3)));
    this.phase = 'shuffle';
    this.say('🔀 Hết nước đi — xáo bàn!', '#ffd23f', W / 2, BY + 4 * CELL, 30);
    sfx.play('whoosh');
  }

  private cellAt(x: number, y: number): { r: number; c: number } | null {
    const c = Math.floor((x - BX) / CELL);
    const r = Math.floor((y - BY) / CELL);
    return r >= 0 && r < ROWS && c >= 0 && c < COLS ? { r, c } : null;
  }

  private trySwap(a: { r: number; c: number }, b: { r: number; c: number }): void {
    if (Math.abs(a.r - b.r) + Math.abs(a.c - b.c) !== 1) return;
    const ga = this.grid[a.r][a.c];
    const gb = this.grid[b.r][b.c];
    if (!ga || !gb) return;
    if (ga.ice || gb.ice) {
      this.say('❄ Bị đóng băng!', '#bfe9ff', cx(ga.ice ? a.c : b.c), cy(ga.ice ? a.r : b.r) - 30, 20);
      sfx.play('wrong');
      return;
    }
    this.grid[a.r][a.c] = gb;
    this.grid[b.r][b.c] = ga;
    this.swapA = a;
    this.swapB = b;
    this.sel = null;
    this.hint = null;
    this.idle = 0;
    this.combo = 0;
    this.phase = 'swap';
    sfx.play('flip');
  }

  /** Gem chạy tới đúng ô; trả về true khi mọi viên đã đứng yên. */
  private settle(dt: number): boolean {
    let done = true;
    const sp = 1100 * dt;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const g = this.grid[r][c];
        if (!g) continue;
        const tx = cx(c);
        const ty = cy(r);
        const dx = tx - g.x;
        const dy = ty - g.y;
        const d = Math.hypot(dx, dy);
        if (d > sp) {
          g.x += (dx / d) * sp;
          g.y += (dy / d) * sp;
          done = false;
        } else {
          g.x = tx;
          g.y = ty;
        }
        if (g.scale < 1) {
          g.scale = Math.min(1, g.scale + dt * 4);
          done = false;
        }
        g.alpha = Math.min(1, g.alpha + dt * 4);
      }
    return done;
  }

  private updateBoard(dt: number): void {
    switch (this.phase) {
      case 'idle': {
        this.idle += dt;
        if (this.idle > 6 && !this.hint) this.hint = this.findMove();
        break;
      }
      case 'swap':
        if (this.settle(dt)) {
          if (this.findGroups().length) this.resolve();
          else {
            const a = this.swapA!;
            const b = this.swapB!;
            const t = this.grid[a.r][a.c];
            this.grid[a.r][a.c] = this.grid[b.r][b.c];
            this.grid[b.r][b.c] = t;
            this.phase = 'unswap';
            sfx.play('wrong');
          }
        }
        break;
      case 'unswap':
      case 'shuffle':
        if (this.settle(dt)) this.phase = 'idle';
        break;
      case 'clear': {
        let done = true;
        for (const row of this.grid)
          for (const g of row)
            if (g?.dying) {
              g.scale -= dt * 5;
              g.alpha -= dt * 5;
              if (g.scale > 0) done = false;
            }
        if (done) this.drop();
        break;
      }
      case 'fall':
        if (this.settle(dt)) {
          if (this.findGroups().length) this.resolve();
          else {
            this.phase = 'idle';
            if (this.combo >= 3) this.say(`COMBO x${this.combo}!`, '#ffd23f', W / 2, BY - 30, 34);
            if (!this.findMove()) this.shuffle();
          }
        }
        break;
    }
  }

  /** Xử lý các nhóm ghép: tung đòn đánh, cộng điểm, phá băng. */
  private resolve(): void {
    const groups = this.findGroups();
    this.combo++;
    if (this.combo > 1) sfx.play('combo');
    const dying = new Set<string>();
    for (const grp of groups) {
      const n = grp.cells.length;
      const color = GEMS[grp.t].color;
      let sx = 0;
      let sy = 0;
      for (const { r, c } of grp.cells) {
        dying.add(r + ',' + c);
        sx += cx(c);
        sy += cy(r);
        this.burst(cx(c), cy(r), color, perf.lite ? 4 : 8);
      }
      sx /= n;
      sy /= n;
      const pts = n * 10 * this.combo * (1 + this.loop);
      this.score += pts;
      this.say('+' + pts, color, sx, sy, 20 + Math.min(n, 6) * 2);
      this.attack(n, color, sx, sy);
    }
    // Ghép cạnh viên bị băng → vỡ băng
    for (const key of dying) {
      const [r, c] = key.split(',').map(Number);
      for (const [dr, dc] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const g = this.grid[r + dr]?.[c + dc];
        if (g?.ice && !dying.has(r + dr + ',' + (c + dc))) {
          g.ice = 0;
          this.burst(g.x, g.y, '#dff6ff', 6);
          sfx.play('hit');
        }
      }
      this.grid[r][c]!.dying = true;
    }
    this.phase = 'clear';
  }

  /** Viên đã nổ biến mất → các viên phía trên rơi xuống, viên mới rơi từ trên vào. */
  private drop(): void {
    for (let c = 0; c < COLS; c++) {
      let w = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        const g = this.grid[r][c];
        if (g && !g.dying) {
          this.grid[w][c] = g;
          if (w !== r) this.grid[r][c] = null;
          w--;
        } else this.grid[r][c] = null;
      }
      for (let r = w, k = 1; r >= 0; r--, k++) this.grid[r][c] = this.gem(Math.floor(Math.random() * GEMS.length), r, c, BY - k * CELL + CELL / 2);
    }
    this.phase = 'fall';
  }

  // =====================================================================
  // Chiến đấu
  // =====================================================================
  private front(includeHidden = false): Enemy | undefined {
    return this.enemies.filter((e) => !e.dead && (includeHidden || !e.hidden)).sort((a, b) => a.x - b.x)[0];
  }

  private dmgMul(): number {
    return (1 + 0.3 * (this.combo - 1)) * (1 + 0.35 * this.loop) * (this.p('damage', 100) / 100);
  }

  private attack(n: number, color: string, sx: number, sy: number): void {
    const mul = this.dmgMul();
    if (n >= 6) {
      // Chiêu đặc biệt: mọi quái + hồi máu đền
      this.bolt(sx, sy, W / 2, GROUND_Y - 120, color, 30, () => {
        this.fx.push({ kind: 'spell', x: W / 2, y: GROUND_Y - 80, color, t: 0, life: 1.4 });
        this.flash = 0.6;
        this.flashColor = color;
        this.shake = 14;
        for (const e of this.enemies) this.hurt(e, 90 * mul, color);
        this.hp = Math.min(this.maxHp, this.hp + 12);
        this.say('✨ Mộng Tưởng Phong Ấn!', color, W / 2, 110, 38);
        sfx.play('spell');
        sfx.play('heal');
      });
    } else if (n === 5) {
      // Laser xuyên hàng
      this.bolt(sx, sy, GATE_X, GROUND_Y - 40, color, 20, () => {
        this.fx.push({ kind: 'laser', x: GATE_X, y: GROUND_Y - 40, color, t: 0, life: 0.6 });
        this.shake = 8;
        for (const e of this.enemies) this.hurt(e, 45 * mul, color);
        this.say('⚡ Laser Zap!', color, W / 2, 150, 32);
        sfx.play('spell');
      });
    } else if (n === 4) {
      const tgt = this.front(true);
      const tx = tgt ? tgt.x : W - 160;
      this.bolt(sx, sy, tx, GROUND_Y - 30, color, 18, () => {
        this.fx.push({ kind: 'boom', x: tx, y: GROUND_Y - 30, color, t: 0, life: 0.6, r: 150 });
        this.shake = 10;
        for (const e of this.enemies) if (Math.abs(e.x - tx) < 160) this.hurt(e, 38 * mul, color);
        this.say('💣 Bom!', color, tx, 160, 30);
        sfx.play('explode');
      });
    } else {
      const tgt = this.front();
      if (!tgt) {
        this.bolt(sx, sy, W - 100, GROUND_Y - 60, color, 12, () => undefined);
        return;
      }
      this.bolt(sx, sy, tgt.x, tgt.y - tgt.r, color, 12, () => {
        const t = tgt.dead ? this.front() : tgt;
        if (t) this.slash(t, color, mul);
      });
    }
  }

  private slash(e: Enemy, color: string, mul: number): void {
    this.fx.push({ kind: 'slash', x: e.x, y: e.y - e.r, color, t: 0, life: 0.35 });
    this.hurt(e, 18 * mul, color);
    sfx.play('slice');
  }

  private bolt(sx: number, sy: number, tx: number, ty: number, color: string, size: number, hit: () => void): void {
    this.bolts.push({ x: sx, y: sy, sx, sy, tx, ty, t: 0, dur: 0.32, color, size, hit });
  }

  private hurt(e: Enemy, dmg: number, color: string): void {
    if (e.dead) return;
    dmg = Math.round(dmg);
    e.hp -= dmg;
    e.hurt = 0.18;
    e.x += e.kind === 'boss' ? 4 : 18; // bị đẩy lùi
    this.say('-' + dmg, color, e.x + rand(-14, 14), e.y - e.r * 2 - 10, e.kind === 'boss' ? 26 : 20);
    if (e.kind === 'boss') sfx.play('bossHit');
    if (e.hp <= 0) this.kill(e);
  }

  private kill(e: Enemy): void {
    e.dead = true;
    this.burst(e.x, e.y - e.r, CHAPTERS[this.chapter].mob, 14);
    if (e.kind === 'boss') {
      const bonus = 2000 * (this.chapter + 1) * (1 + this.loop);
      this.score += bonus;
      this.bosses++;
      this.flash = 0.8;
      this.flashColor = '#fff';
      this.shake = 16;
      for (let i = 0; i < 4; i++) this.burst(e.x + rand(-60, 60), e.y - rand(40, 140), CHAPTERS[this.chapter].aura, 18);
      this.say(`🏆 Hạ ${CHAPTERS[this.chapter].boss}! +${bonus}`, '#ffd23f', W / 2, 120, 34);
      this.orbs = [];
      sfx.play('win');
      // Mọi quái còn lại tan biến, sang chương mới
      for (const o of this.enemies) if (!o.dead) ((o.dead = true), this.burst(o.x, o.y - o.r, '#fff', 8));
      this.hp = Math.min(this.maxHp, this.hp + 30);
      this.chapter++;
      if (this.chapter >= CHAPTERS.length) {
        this.chapter = 0;
        this.loop++;
        this.maxHp += 20;
        this.hp = this.maxHp;
      }
      this.chapterIn = 2.6;
    } else {
      const pts = 50 * (1 + this.chapter) * (1 + this.loop);
      this.score += pts;
      this.kills++;
      sfx.play('kill');
    }
  }

  private startChapter(): void {
    const ch = CHAPTERS[this.chapter];
    this.wave = 0;
    this.bossOut = false;
    this.banner = {
      title: (this.loop ? `Vòng ${this.loop + 1} · ` : '') + `Chương ${this.chapter + 1}: ${ch.place}`,
      sub: ch.story,
      t: 3.2,
      color: ch.aura,
    };
    this.pause = 2.4;
    this.nextWave();
  }

  /** Mỗi chương 3 đợt quái thường rồi tới boss. */
  private nextWave(): void {
    this.wave++;
    if (this.wave > 3) {
      this.spawnBoss();
      return;
    }
    this.toSpawn = 3 + this.chapter + this.wave + this.loop * 2;
    this.spawnT = 0.5;
  }

  private spawnMob(kind?: MobKind): void {
    const lvl = (1 + 0.28 * this.chapter + 0.12 * this.wave) * (1 + 0.6 * this.loop);
    const pick: MobKind = kind ?? (['kedama', 'fairy', 'ghost'] as MobKind[])[Math.floor(Math.random() * Math.min(3, 1 + this.chapter))];
    const base = { kedama: { hp: 26, sp: 34, r: 24 }, fairy: { hp: 20, sp: 52, r: 20 }, ghost: { hp: 44, sp: 24, r: 28 }, bat: { hp: 14, sp: 70, r: 16 } }[pick];
    this.enemies.push({
      kind: pick,
      x: W + 40,
      y: GROUND_Y - (pick === 'fairy' || pick === 'bat' ? rand(50, 110) : 0),
      hp: base.hp * lvl,
      max: base.hp * lvl,
      speed: base.sp * (1 + 0.08 * this.chapter + 0.12 * this.loop) * rand(0.85, 1.15) * (this.p('enemySpeed', 100) / 100),
      atk: 4 + this.chapter * 1.5 + this.loop * 3,
      cd: 0,
      r: base.r,
      hurt: 0,
      wob: rand(0, 6),
    });
  }

  private spawnBoss(): void {
    const ch = CHAPTERS[this.chapter];
    const hp = 420 * (1 + this.chapter * 0.7) * (1 + this.loop * 0.9) * (this.p('bossHp', 100) / 100);
    this.enemies.push({
      kind: 'boss',
      x: W + 90,
      y: GROUND_Y,
      hp,
      max: hp,
      speed: 26,
      atk: 8 + this.chapter * 2 + this.loop * 4,
      cd: 0,
      r: 70,
      hurt: 0,
      wob: 0,
      skill: 6,
      shot: 3,
    });
    this.bossOut = true;
    this.banner = { title: `⚠ BOSS: ${ch.boss}`, sub: ch.bossTitle, t: 2.6, color: ch.aura };
    this.shake = 10;
    sfx.play('bossIn');
  }

  /** Chiêu riêng của boss — càng về sau càng khó. */
  private bossSkill(e: Enemy): void {
    const ch = this.chapter;
    const freeze = (n: number, label: string) => {
      const cells = this.grid.flat().filter((g): g is Gem => !!g && !g.ice && !g.dying);
      for (let i = 0; i < n && cells.length; i++) cells.splice(Math.floor(Math.random() * cells.length), 1)[0].ice = 1;
      this.say(label, CHAPTERS[ch].aura, W / 2, BY + 4 * CELL, 28);
      sfx.play('freeze');
      // Đóng băng có thể làm hết nước → xáo bàn
      if (this.phase === 'idle' && !this.findMove()) this.shuffle();
    };
    const extra = this.loop;
    if (ch === 0) freeze(3 + extra, '❄ Cirno: Perfect Freeze!');
    else if (ch === 1) {
      for (let i = 0; i < 3 + extra; i++) this.spawnMob('bat');
      this.say('🦇 Remilia gọi bầy dơi!', CHAPTERS[ch].aura, W / 2, 150, 26);
      sfx.play('spell');
    } else if (ch === 2) {
      e.hidden = 3.5;
      this.say('👁 Koishi biến mất… (chỉ Bom / Laser trúng)', CHAPTERS[ch].aura, W / 2, 150, 22);
      sfx.play('whoosh');
    } else if (ch === 3) freeze(5 + extra, '📜 Reimu dán bùa phong ấn!');
    else {
      freeze(4 + extra, '🌑 Bóng tối phong ấn bàn!');
      for (let i = 0; i < 2 + extra; i++) this.spawnMob('bat');
      e.hidden = 2;
    }
  }

  private updateField(dt: number): void {
    if (this.chapterIn > 0) {
      this.chapterIn -= dt;
      if (this.chapterIn <= 0) this.startChapter();
    } else if (this.pause > 0) this.pause -= dt;
    else if (!this.bossOut) {
      if (this.toSpawn > 0) {
        this.spawnT -= dt;
        if (this.spawnT <= 0) {
          this.spawnMob();
          this.toSpawn--;
          this.spawnT = Math.max(0.7, 2.2 - this.chapter * 0.2 - this.loop * 0.3) * rand(0.7, 1.3);
        }
      } else if (!this.enemies.some((e) => !e.dead)) {
        this.pause = 1.2;
        this.nextWave();
      }
    }

    for (const e of this.enemies) {
      if (e.dead) continue;
      e.wob += dt * 4;
      e.hurt = Math.max(0, e.hurt - dt);
      if (e.hidden) e.hidden = Math.max(0, e.hidden - dt);
      if (e.kind === 'boss') {
        const stop = 470;
        if (e.x > stop) e.x -= e.speed * dt;
        e.skill! -= dt;
        e.shot! -= dt;
        if (e.skill! <= 0) {
          this.bossSkill(e);
          e.skill = Math.max(4.5, 9 - this.chapter * 0.6 - this.loop);
        }
        if (e.shot! <= 0 && e.x <= stop + 5) {
          const n = 1 + Math.min(4, this.chapter + this.loop);
          for (let i = 0; i < n; i++) {
            const ang = Math.PI + rand(-0.25, 0.25);
            const sp = rand(170, 230);
            this.orbs.push({ x: e.x - 40, y: e.y - 90, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.4, dmg: e.atk / 2, color: CHAPTERS[this.chapter].aura });
          }
          e.shot = Math.max(1.4, 3.2 - this.chapter * 0.3 - this.loop * 0.3);
          sfx.play('shot');
        }
      } else if (e.x > GATE_X + e.r) {
        e.x -= e.speed * dt;
      } else {
        e.cd -= dt;
        if (e.cd <= 0) {
          this.damageShrine(e.atk);
          e.cd = 1.3;
          e.x += 10;
        }
      }
    }
    this.enemies = this.enemies.filter((e) => !e.dead);

    for (const o of this.orbs) {
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      if (o.y > GROUND_Y - 10 || o.y < 60) o.vy *= -1;
      if (o.x < GATE_X) {
        o.dmg = -o.dmg;
        this.damageShrine(-o.dmg);
      }
    }
    this.orbs = this.orbs.filter((o) => o.dmg > 0);

    for (const b of this.bolts) {
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      const e = 1 - (1 - k) * (1 - k);
      b.x = b.sx + (b.tx - b.sx) * e;
      b.y = b.sy + (b.ty - b.sy) * e - Math.sin(k * Math.PI) * 60;
      if (k >= 1) b.hit();
    }
    this.bolts = this.bolts.filter((b) => b.t < b.dur);
  }

  private damageShrine(d: number): void {
    this.hp -= d;
    this.shake = Math.max(this.shake, 6);
    this.flash = 0.25;
    this.flashColor = '#ff1744';
    this.say('-' + Math.round(d), '#ff4d4d', GATE_X, GROUND_Y - 150, 22);
    sfx.play('playerHit');
    if (this.hp <= 0) this.gameOver();
  }

  private gameOver(): void {
    if (this.state !== 'playing') return;
    this.hp = 0;
    this.state = 'over';
    playBaka();
    const newBest = this.score > this.best;
    if (newBest) {
      this.best = this.score;
      try {
        localStorage.setItem(BEST_KEY, String(this.best));
      } catch {
        /* bỏ qua */
      }
    }
    sfx.play('gameover');
    this.onState('over', {
      score: this.score,
      best: this.best,
      newBest,
      chapter: this.chapter + 1,
      loop: this.loop + 1,
      kills: this.kills,
      bosses: this.bosses,
      place: CHAPTERS[this.chapter].place,
    });
  }

  // =====================================================================
  // Hiệu ứng
  // =====================================================================
  private burst(x: number, y: number, color: string, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(60, 260);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 0, max: rand(0.4, 0.8), color, size: rand(3, 7) });
    }
  }

  private say(text: string, color: string, x: number, y: number, size: number): void {
    this.pops.push({ text, color, x, y, life: 1.1, size });
  }

  // =====================================================================
  // Vòng lặp
  // =====================================================================
  private readonly loopFn = (now: number) => {
    this.raf = requestAnimationFrame(this.loopFn);
    if (document.hidden) {
      this.last = now;
      return;
    }
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    this.time += dt;
    if (this.state === 'playing') {
      this.updateBoard(dt);
      this.updateField(dt);
    } else if (this.phase !== 'idle') this.updateBoard(dt);
    for (const p of this.parts) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 500 * dt;
    }
    this.parts = this.parts.filter((p) => p.life < p.max);
    for (const p of this.pops) {
      p.life -= dt;
      p.y -= 40 * dt;
    }
    this.pops = this.pops.filter((p) => p.life > 0);
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < f.life);
    if (this.banner) {
      this.banner.t -= dt;
      if (this.banner.t <= 0) this.banner = null;
    }
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 2);
    this.draw();
  };

  // =====================================================================
  // Vẽ
  // =====================================================================
  private draw(): void {
    const x = this.ctx;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    x.save();
    if (this.shake > 0) x.translate(rand(-this.shake, this.shake) * 0.5, rand(-this.shake, this.shake) * 0.5);
    this.drawField(x);
    this.drawBoard(x);
    // Đòn đánh bay lên
    for (const b of this.bolts) {
      x.save();
      x.globalCompositeOperation = 'lighter';
      const g = x.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.size);
      g.addColorStop(0, '#fff');
      g.addColorStop(0.35, b.color);
      g.addColorStop(1, b.color + '00');
      x.fillStyle = g;
      x.beginPath();
      x.arc(b.x, b.y, b.size, 0, Math.PI * 2);
      x.fill();
      x.restore();
    }
    for (const p of this.parts) {
      x.globalAlpha = 1 - p.life / p.max;
      x.fillStyle = p.color;
      x.beginPath();
      x.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      x.fill();
    }
    x.globalAlpha = 1;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    for (const p of this.pops) {
      x.globalAlpha = Math.min(1, p.life * 2);
      x.font = `900 ${p.size}px ${FONT}`;
      x.lineWidth = 5;
      x.strokeStyle = 'rgba(0,0,0,.65)';
      x.strokeText(p.text, p.x, p.y);
      x.fillStyle = p.color;
      x.fillText(p.text, p.x, p.y);
    }
    x.globalAlpha = 1;
    x.restore();
    if (this.flash > 0) {
      x.fillStyle = this.flashColor;
      x.globalAlpha = this.flash * 0.35;
      x.fillRect(0, 0, W, H);
      x.globalAlpha = 1;
    }
  }

  private drawField(x: CanvasRenderingContext2D): void {
    const ch = CHAPTERS[this.chapter];
    const sky = x.createLinearGradient(0, 0, 0, FIELD_H);
    sky.addColorStop(0, ch.sky[0]);
    sky.addColorStop(1, ch.sky[1]);
    x.fillStyle = sky;
    x.fillRect(0, 0, W, FIELD_H);
    // Trang trí theo chương
    x.save();
    if (this.chapter === 1 || this.chapter === 4) {
      x.fillStyle = this.chapter === 1 ? 'rgba(255,60,80,.85)' : 'rgba(200,120,255,.6)';
      x.shadowColor = x.fillStyle as string;
      x.shadowBlur = 40;
      x.beginPath();
      x.arc(560, 90, 46, 0, Math.PI * 2);
      x.fill();
      x.shadowBlur = 0;
    }
    if (this.chapter === 0) {
      x.fillStyle = 'rgba(255,255,255,.45)';
      for (let i = 0; i < 5; i++) {
        const fx = ((this.time * 12 + i * 170) % (W + 200)) - 100;
        x.beginPath();
        x.ellipse(fx, 60 + i * 30, 90, 18, 0, 0, Math.PI * 2);
        x.fill();
      }
    }
    // Cánh hoa / đom đóm bay
    const petal = this.chapter === 3 ? '#ffc2d6' : this.chapter === 0 ? '#ffffff' : ch.aura;
    x.fillStyle = petal;
    for (const p of this.petals) {
      p.y += p.v * (1 / 60);
      p.x -= p.v * 0.4 * (1 / 60);
      if (p.y > FIELD_H) ((p.y = -5), (p.x = rand(0, W + 100)));
      x.globalAlpha = 0.55;
      x.beginPath();
      x.arc(p.x, p.y, p.s, 0, Math.PI * 2);
      x.fill();
    }
    x.globalAlpha = 1;
    x.restore();
    // Mặt đất
    x.fillStyle = ch.ground;
    x.fillRect(0, GROUND_Y, W, FIELD_H - GROUND_Y);
    x.fillStyle = 'rgba(255,255,255,.12)';
    x.fillRect(0, GROUND_Y, W, 4);

    this.drawShrine(x);
    for (const e of this.enemies) this.drawEnemy(x, e);
    for (const o of this.orbs) {
      x.save();
      x.shadowColor = o.color;
      x.shadowBlur = 14;
      x.fillStyle = '#fff';
      x.beginPath();
      x.arc(o.x, o.y, 9, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = o.color;
      x.lineWidth = 4;
      x.stroke();
      x.restore();
    }
    for (const f of this.fx) this.drawFx(x, f);

    // HUD
    x.textBaseline = 'middle';
    x.font = `800 18px ${FONT}`;
    x.textAlign = 'left';
    x.fillStyle = 'rgba(0,0,0,.45)';
    roundRect(x, 12, 12, 250, 50, 12);
    x.fill();
    x.fillStyle = '#fff';
    x.fillText('⛩ Đền Hakurei', 24, 28);
    x.fillStyle = 'rgba(255,255,255,.25)';
    roundRect(x, 24, 40, 226, 12, 6);
    x.fill();
    const k = Math.max(0, this.hp / this.maxHp);
    x.fillStyle = k > 0.5 ? '#3fdc7a' : k > 0.25 ? '#ffc94d' : '#ff4d4d';
    roundRect(x, 24, 40, 226 * k, 12, 6);
    x.fill();
    x.textAlign = 'right';
    x.fillStyle = 'rgba(0,0,0,.45)';
    roundRect(x, W - 232, 12, 220, 50, 12);
    x.fill();
    x.fillStyle = '#ffd23f';
    x.font = `900 24px ${FONT}`;
    x.fillText(this.score.toLocaleString('vi-VN'), W - 24, 30);
    x.fillStyle = '#fff';
    x.font = `700 13px ${FONT}`;
    x.fillText(`Kỷ lục ${Math.max(this.best, this.score).toLocaleString('vi-VN')}`, W - 24, 52);
    x.textAlign = 'center';
    x.font = `800 15px ${FONT}`;
    x.fillStyle = '#fff';
    x.strokeStyle = 'rgba(0,0,0,.5)';
    x.lineWidth = 4;
    const label = this.state === 'playing' ? `${this.loop ? 'Vòng ' + (this.loop + 1) + ' · ' : ''}Ch.${this.chapter + 1} ${ch.place} · ${this.bossOut ? 'BOSS' : 'Đợt ' + Math.min(3, this.wave) + '/3'}` : '';
    x.strokeText(label, W / 2, 84);
    x.fillText(label, W / 2, 84);

    if (this.banner) {
      const b = this.banner;
      const a = Math.min(1, b.t * 2, (3.2 - b.t) * 4 + 0.2);
      x.globalAlpha = Math.max(0, a);
      x.fillStyle = 'rgba(0,0,0,.6)';
      x.fillRect(0, 140, W, 96);
      x.fillStyle = b.color;
      x.font = `900 30px ${FONT}`;
      x.shadowColor = b.color;
      x.shadowBlur = 16;
      x.fillText(b.title, W / 2, 175);
      x.shadowBlur = 0;
      x.fillStyle = '#fff';
      x.font = `600 16px ${FONT}`;
      x.fillText(b.sub, W / 2, 212, W - 40);
      x.globalAlpha = 1;
    }
  }

  private drawShrine(x: CanvasRenderingContext2D): void {
    // Cổng torii
    x.save();
    x.fillStyle = '#d7263d';
    x.fillRect(30, GROUND_Y - 170, 14, 170);
    x.fillRect(100, GROUND_Y - 170, 14, 170);
    x.fillStyle = '#1d1d1d';
    x.fillRect(14, GROUND_Y - 186, 116, 14);
    x.fillStyle = '#d7263d';
    x.fillRect(22, GROUND_Y - 172, 100, 10);
    x.fillRect(24, GROUND_Y - 140, 96, 8);
    // Âm dương ngọc bảo vệ
    const oy = GROUND_Y - 220 + Math.sin(this.time * 2) * 6;
    x.translate(72, oy);
    x.rotate(this.time * 1.5);
    x.shadowColor = '#fff';
    x.shadowBlur = 16;
    x.fillStyle = '#fff';
    x.beginPath();
    x.arc(0, 0, 18, 0, Math.PI * 2);
    x.fill();
    x.shadowBlur = 0;
    x.fillStyle = '#d7263d';
    x.beginPath();
    x.arc(0, 0, 18, Math.PI / 2, (Math.PI * 3) / 2);
    x.arc(0, -9, 9, Math.PI / 2, (Math.PI * 3) / 2, true);
    x.arc(0, 9, 9, -Math.PI / 2, Math.PI / 2);
    x.fill();
    x.restore();
  }

  private drawEnemy(x: CanvasRenderingContext2D, e: Enemy): void {
    const ch = CHAPTERS[this.chapter];
    x.save();
    const bob = Math.sin(e.wob) * (e.kind === 'kedama' ? 4 : 6);
    if (e.hidden) x.globalAlpha = 0.18 + Math.abs(Math.sin(this.time * 6)) * 0.12;
    if (e.kind === 'boss') {
      const img = this.imgs.get(ch.img);
      const h = 170;
      x.shadowColor = ch.aura;
      x.shadowBlur = 30;
      x.fillStyle = ch.aura + '55';
      x.beginPath();
      x.ellipse(e.x, e.y - 4, 70, 12, 0, 0, Math.PI * 2);
      x.fill();
      if (img?.complete && img.naturalWidth) {
        const w = (img.naturalWidth / img.naturalHeight) * h;
        if (e.hurt > 0) x.filter = 'brightness(2.2)';
        x.drawImage(img, e.x - w / 2, e.y - h + bob, w, h);
        x.filter = 'none';
      }
      x.shadowBlur = 0;
      // Thanh máu boss
      x.globalAlpha = 1;
      const bw = 200;
      x.fillStyle = 'rgba(0,0,0,.6)';
      roundRect(x, e.x - bw / 2, e.y - h - 34, bw, 26, 8);
      x.fill();
      x.fillStyle = ch.aura;
      roundRect(x, e.x - bw / 2 + 3, e.y - h - 31, (bw - 6) * Math.max(0, e.hp / e.max), 8, 4);
      x.fill();
      x.fillStyle = '#fff';
      x.font = `800 12px ${FONT}`;
      x.textAlign = 'center';
      x.fillText(ch.boss, e.x, e.y - h - 15);
      x.restore();
      return;
    }
    const y = e.y - e.r + bob;
    const col = e.kind === 'bat' ? '#5a2140' : ch.mob;
    if (e.hurt > 0) x.filter = 'brightness(2)';
    if (e.kind === 'fairy' || e.kind === 'bat') {
      // Cánh
      const flap = Math.sin(this.time * 18 + e.wob) * 0.5 + 0.6;
      x.fillStyle = e.kind === 'bat' ? '#2a0f20' : 'rgba(255,255,255,.65)';
      x.beginPath();
      x.ellipse(e.x + 6, y - 6, e.r * 0.9, e.r * 0.45 * flap, -0.6, 0, Math.PI * 2);
      x.ellipse(e.x + 10, y + 4, e.r * 0.7, e.r * 0.35 * flap, 0.5, 0, Math.PI * 2);
      x.fill();
    }
    x.fillStyle = col;
    x.shadowColor = col;
    x.shadowBlur = 12;
    x.beginPath();
    if (e.kind === 'ghost') {
      x.arc(e.x, y, e.r, Math.PI, 0);
      x.lineTo(e.x + e.r, y + e.r);
      for (let i = 0; i < 4; i++) x.quadraticCurveTo(e.x + e.r - (i + 0.5) * (e.r / 2), y + e.r + (i % 2 ? -8 : 8), e.x + e.r - (i + 1) * (e.r / 2), y + e.r);
      x.closePath();
      x.globalAlpha *= 0.85;
    } else if (e.kind === 'kedama') {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const rr = e.r + (i % 2 ? 5 : 0);
        x.lineTo(e.x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      x.closePath();
    } else x.arc(e.x, y, e.r, 0, Math.PI * 2);
    x.fill();
    x.shadowBlur = 0;
    x.filter = 'none';
    // Mắt (nhìn về phía đền)
    x.fillStyle = e.kind === 'bat' ? '#ff3355' : '#1d1d1d';
    x.beginPath();
    x.arc(e.x - e.r * 0.4, y - 3, e.r * 0.15, 0, Math.PI * 2);
    x.arc(e.x + e.r * 0.05, y - 3, e.r * 0.15, 0, Math.PI * 2);
    x.fill();
    // Máu
    if (e.hp < e.max) {
      x.globalAlpha = 1;
      x.fillStyle = 'rgba(0,0,0,.5)';
      x.fillRect(e.x - 22, y - e.r - 14, 44, 6);
      x.fillStyle = '#ff4d6d';
      x.fillRect(e.x - 22, y - e.r - 14, 44 * Math.max(0, e.hp / e.max), 6);
    }
    x.restore();
  }

  private drawFx(x: CanvasRenderingContext2D, f: Fx): void {
    const k = f.t / f.life;
    x.save();
    x.globalCompositeOperation = 'lighter';
    x.strokeStyle = f.color;
    x.fillStyle = f.color;
    x.shadowColor = f.color;
    x.shadowBlur = 20;
    if (f.kind === 'slash') {
      x.globalAlpha = 1 - k;
      x.lineWidth = 8 * (1 - k) + 2;
      x.beginPath();
      x.moveTo(f.x - 60, f.y - 50 + k * 10);
      x.quadraticCurveTo(f.x, f.y - 10, f.x + 60, f.y + 40);
      x.stroke();
      x.strokeStyle = '#fff';
      x.lineWidth = 3;
      x.stroke();
    } else if (f.kind === 'boom') {
      x.globalAlpha = 1 - k;
      const g = x.createRadialGradient(f.x, f.y, 0, f.x, f.y, (f.r ?? 120) * (0.4 + k));
      g.addColorStop(0, '#fff');
      g.addColorStop(0.3, f.color);
      g.addColorStop(1, f.color + '00');
      x.fillStyle = g;
      x.beginPath();
      x.arc(f.x, f.y, (f.r ?? 120) * (0.4 + k), 0, Math.PI * 2);
      x.fill();
    } else if (f.kind === 'laser') {
      x.globalAlpha = 1 - k * k;
      const h = 46 * (1 - k) + 6;
      x.fillRect(f.x, f.y - h / 2, W - f.x, h);
      x.fillStyle = '#fff';
      x.fillRect(f.x, f.y - h / 6, W - f.x, h / 3);
    } else if (f.kind === 'spell') {
      x.globalAlpha = 1 - k;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + f.t * 3;
        const rr = 60 + k * 260;
        const ox = f.x + Math.cos(a) * rr;
        const oy = f.y + Math.sin(a) * rr * 0.45;
        const g = x.createRadialGradient(ox, oy, 0, ox, oy, 48);
        g.addColorStop(0, '#fff');
        g.addColorStop(0.4, GEMS[i % GEMS.length].color);
        g.addColorStop(1, '#0000');
        x.fillStyle = g;
        x.beginPath();
        x.arc(ox, oy, 48, 0, Math.PI * 2);
        x.fill();
      }
    }
    x.restore();
  }

  private drawBoard(x: CanvasRenderingContext2D): void {
    // Khung bàn
    x.fillStyle = '#140d26';
    x.fillRect(0, FIELD_H, W, H - FIELD_H);
    x.fillStyle = 'rgba(255,255,255,.04)';
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if ((r + c) % 2 === 0) x.fillRect(BX + c * CELL, BY + r * CELL, CELL, CELL);
    x.strokeStyle = 'rgba(255,255,255,.12)';
    x.lineWidth = 2;
    roundRect(x, BX - 4, BY - 4, COLS * CELL + 8, ROWS * CELL + 8, 14);
    x.stroke();

    x.save();
    x.beginPath();
    x.rect(BX - 4, BY - 4, COLS * CELL + 8, ROWS * CELL + 8);
    x.clip();
    const hintOn = this.hint && Math.sin(this.time * 6) > 0;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const g = this.grid[r][c];
        if (!g) continue;
        let s = g.scale;
        const isSel = this.sel?.r === r && this.sel?.c === c;
        const isHint = hintOn && this.hint!.some((h) => h.r === r && h.c === c);
        if (isSel) s *= 1.1 + Math.sin(this.time * 10) * 0.04;
        if (isHint) s *= 1.08;
        const size = CELL * Math.max(0, s);
        x.globalAlpha = Math.max(0, g.alpha);
        const tile = this.tiles[g.t];
        if (tile) x.drawImage(tile, g.x - size / 2, g.y - size / 2, size, size);
        if (g.ice && this.iceTile) x.drawImage(this.iceTile, g.x - size / 2, g.y - size / 2, size, size);
        if (isSel || isHint) {
          x.strokeStyle = isSel ? '#fff' : '#ffd23f';
          x.lineWidth = 4;
          roundRect(x, g.x - size / 2 + 4, g.y - size / 2 + 4, size - 8, size - 8, 16);
          x.stroke();
        }
      }
    x.globalAlpha = 1;
    x.restore();
  }

  // =====================================================================
  // Điều khiển: bấm 2 ô cạnh nhau hoặc kéo 1 viên sang ô bên cạnh
  // =====================================================================
  private toGame(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  private readonly onDown = (e: PointerEvent) => {
    if (this.state !== 'playing' || this.phase !== 'idle') return;
    const p = this.toGame(e);
    const cell = this.cellAt(p.x, p.y);
    if (!cell) return;
    e.preventDefault();
    if (this.sel && Math.abs(this.sel.r - cell.r) + Math.abs(this.sel.c - cell.c) === 1) {
      this.trySwap(this.sel, cell);
      this.sel = null;
      return;
    }
    this.sel = this.sel?.r === cell.r && this.sel?.c === cell.c ? null : cell;
    this.down = { ...cell, x: p.x, y: p.y };
    sfx.play('click');
  };

  private readonly onMove = (e: PointerEvent) => {
    if (!this.down || this.phase !== 'idle') return;
    const p = this.toGame(e);
    const dx = p.x - this.down.x;
    const dy = p.y - this.down.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < CELL * 0.35) return;
    const to = Math.abs(dx) > Math.abs(dy) ? { r: this.down.r, c: this.down.c + Math.sign(dx) } : { r: this.down.r + Math.sign(dy), c: this.down.c };
    const from = { r: this.down.r, c: this.down.c };
    this.down = null;
    if (to.r < 0 || to.r >= ROWS || to.c < 0 || to.c >= COLS) return;
    this.trySwap(from, to);
  };

  private readonly onUp = () => {
    this.down = null;
  };
}

function roundRect(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, r: number): void {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}

/**
 * "Gõ chữ diệt Fumo" — các bé fumo mang chữ tiếng Nhật rơi từ trời xuống, gõ đúng (romaji / kana / kanji)
 * để tiêu diệt. Chạm đất 3 lần là thua. Có fumo đặc biệt (hồi tim, bom, đóng băng) và boss định kỳ:
 * boss tung chiêu mang chữ, gõ đúng chữ đó để ném ngược chiêu về boss. Chơi vô hạn tới khi thua.
 */
import { sfx } from '../../shared/sfx';
import { JpLevel, JpWord, WORDS, isMatch, isPrefix } from './jp-words';

export const W = 900;
export const H = 640;
const GROUND = H - 46;
const STEP = 1000 / 60;
const MAX_LIVES = 5;
const START_LIVES = 3;

export type JpState = 'title' | 'playing' | 'paused' | 'over';
export type Special = 'heart' | 'bomb' | 'freeze';
type AttackKind = 'icicle' | 'orb' | 'amulet';

export interface JpResult {
  score: number;
  killed: number;
  bosses: number;
  bestCombo: number;
  accuracy: number;
  time: number;
  newBest: boolean;
  /** Các từ đã để rơi — hiện lại để ôn. */
  missed: JpWord[];
}

/** Thông số mỗi mức độ. */
const LEVELS: Record<JpLevel, { fall: number; spawn: number; accel: number; bossEvery: number; bossHp: number; atkEvery: number; mult: number; color: string }> = {
  easy: { fall: 34, spawn: 2.8, accel: 1 / 110, bossEvery: 70, bossHp: 4, atkEvery: 4.4, mult: 1, color: '#3fcf74' },
  normal: { fall: 42, spawn: 2.3, accel: 1 / 90, bossEvery: 60, bossHp: 6, atkEvery: 3.5, mult: 1.5, color: '#ffd23f' },
  hard: { fall: 50, spawn: 1.95, accel: 1 / 75, bossEvery: 50, bossHp: 8, atkEvery: 2.8, mult: 2, color: '#ff4d5e' },
};

/** Fumo thường + fumo đặc biệt. */
const NORMAL_IMGS = ['remilia', 'yukari', 'koishi', 'cirno', 'teto', 'reimu'];
const SPECIALS: Record<Special, { img: string; color: string; icon: string; label: string }> = {
  heart: { img: 'yuyuko', color: '#ff6fa8', icon: '♥', label: '+1 tim' },
  bomb: { img: 'flandre', color: '#ff7a1a', icon: '💣', label: 'BOM!' },
  freeze: { img: 'cirno-2', color: '#6fd6ff', icon: '❄', label: 'Đóng băng' },
};

interface BossDef {
  id: string;
  name: string;
  img: string;
  color: string;
  atk: AttackKind;
  spell: string;
}
const BOSSES: BossDef[] = [
  { id: 'cirno', name: 'Cirno', img: 'boss-cirno', color: '#6fd6ff', atk: 'icicle', spell: 'Băng phù「Icicle Fall」' },
  { id: 'reimu', name: 'Hakurei Reimu', img: 'boss-reimu', color: '#ff4d5e', atk: 'orb', spell: 'Linh phù「Âm Dương Ngọc」' },
  { id: 'dark', name: 'Reimu Hắc Hoá', img: 'boss-dark-reimu', color: '#c2185b', atk: 'amulet', spell: 'Phong ma「Bùa Trấn Yêu」' },
];

interface Faller {
  id: number;
  word: JpWord;
  img: string;
  special?: Special;
  x: number;
  y: number;
  /** Hệ số tốc độ riêng (to chậm, nhỏ nhanh). */
  sp: number;
  size: number;
  t: number;
  dying: number;
}

interface Shot {
  id: number;
  word: JpWord;
  kind: AttackKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  /** Đã bị gõ trúng → bay ngược về boss. */
  back: boolean;
  color: string;
}

interface Boss {
  def: BossDef;
  x: number;
  y: number;
  hp: number;
  max: number;
  t: number;
  nextAtk: number;
  flash: number;
  dying: number;
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
  star?: boolean;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
/** Font cho chữ Nhật (kana / kanji trên đầu fumo). */
const JP_FONT = '"Yu Gothic UI", "Yu Gothic", "Hiragino Sans", "Noto Sans JP", Meiryo, sans-serif';
/** Font cho chữ tiếng Việt (điểm, nghĩa, thông báo...) — Montserrat của web hiển thị dấu chuẩn; ký tự Nhật lẫn trong câu tự rơi về font Nhật. */
const TEXT_FONT = 'Montserrat, "Segoe UI", Roboto, Arial, "Yu Gothic UI", "Yu Gothic", Meiryo, sans-serif';

export class JpTypingGame {
  state: JpState = 'title';
  private level: JpLevel = 'easy';
  private readonly ctx: CanvasRenderingContext2D;
  private readonly images = new Map<string, HTMLImageElement>();
  private raf = 0;
  private last = 0;
  private acc = 0;
  private seq = 0;

  // Trạng thái ván chơi
  private fallers: Faller[] = [];
  private shots: Shot[] = [];
  private boss: Boss | null = null;
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private stars: { x: number; y: number; r: number; p: number }[] = [];
  private time = 0;
  private sinceBoss = 0;
  private nextSpawn = 0;
  private freezeT = 0;
  private flash = 0;
  private flashColor = '#fff';
  private shake = 0;
  private banner: { title: string; sub: string; t: number; color: string } | null = null;
  private targetId = -1;
  private typed = '';

  score = 0;
  lives = START_LIVES;
  private combo = 0;
  private bestCombo = 0;
  private killed = 0;
  private bossCount = 0;
  private keys = 0;
  private typos = 0;
  private missed: JpWord[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onState: (s: JpState, r?: JpResult) => void,
  ) {
    this.ctx = canvas.getContext('2d')!;
    for (const name of [...NORMAL_IMGS, ...Object.values(SPECIALS).map((s) => s.img), ...BOSSES.map((b) => b.img)]) {
      const img = new Image();
      img.src = `jp-type/${name}.webp`;
      this.images.set(name, img);
    }
    for (let i = 0; i < 70; i++) this.stars.push({ x: rand(0, W), y: rand(0, GROUND - 120), r: rand(0.6, 1.8), p: rand(0, 6.28) });
    this.resize();
    addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.onHidden);
    this.raf = requestAnimationFrame(this.loop);
  }

  static best(level: JpLevel): number {
    try {
      return Number(localStorage.getItem(`fumo.jptype.best.${level}`)) || 0;
    } catch {
      return 0;
    }
  }

  get levelColor(): string {
    return LEVELS[this.level].color;
  }

  start(level: JpLevel): void {
    this.level = level;
    this.fallers = [];
    this.shots = [];
    this.boss = null;
    this.particles = [];
    this.popups = [];
    this.time = 0;
    this.sinceBoss = 0;
    this.nextSpawn = 0.6;
    this.freezeT = 0;
    this.flash = 0;
    this.shake = 0;
    this.score = 0;
    this.lives = START_LIVES;
    this.combo = 0;
    this.bestCombo = 0;
    this.killed = 0;
    this.bossCount = 0;
    this.keys = 0;
    this.typos = 0;
    this.missed = [];
    this.typed = '';
    this.targetId = -1;
    this.showBanner('Bắt đầu!', level === 'easy' ? 'Gõ romaji dưới mỗi bé fumo' : level === 'normal' ? 'Đọc chữ — gợi ý romaji hiện khi bé rơi thấp' : 'Kanji khó — chỉ có nghĩa tiếng Việt', LEVELS[level].color);
    this.setState('playing');
  }

  pause(): void {
    if (this.state === 'playing') this.setState('paused');
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.last = 0;
    this.setState('playing');
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.onHidden);
  }

  /**
   * Nhận nội dung ô gõ. Trả về:
   * 'done' — gõ đúng trọn một từ (trang xoá ô gõ) · 'ok' — đang đúng hướng · 'typo' — không khớp từ nào · 'empty'.
   */
  type(text: string): 'done' | 'ok' | 'typo' | 'empty' {
    if (this.state !== 'playing') return 'empty';
    const grew = text.length > this.typed.length;
    this.typed = text;
    if (!text.trim()) {
      this.targetId = -1;
      return 'empty';
    }
    if (grew) this.keys++;

    // Gõ trọn một từ → ưu tiên mục tiêu đang khoá, rồi tới vật thấp nhất (nguy hiểm nhất).
    const live = this.candidates();
    const done = live.filter((c) => isMatch(c.word, text)).sort((a, b) => (a.id === this.targetId ? -1 : b.id === this.targetId ? 1 : b.y - a.y))[0];
    if (done) {
      this.resolve(done);
      this.typed = '';
      this.targetId = -1;
      return 'done';
    }
    const prefix = live.filter((c) => isPrefix(c.word, text)).sort((a, b) => b.y - a.y);
    if (prefix.length) {
      this.targetId = prefix.some((p) => p.id === this.targetId) ? this.targetId : prefix[0].id;
      if (grew) sfx.play('key');
      return 'ok';
    }
    this.targetId = -1;
    if (grew) {
      this.typos++;
      this.combo = 0;
      sfx.play('typo');
    }
    return 'typo';
  }

  // ================= Vòng lặp =================
  private readonly loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.last) this.last = now;
    this.acc += Math.min(100, now - this.last);
    this.last = now;
    let n = 0;
    while (this.acc >= STEP && n < 5) {
      this.update(STEP / 1000);
      this.acc -= STEP;
      n++;
    }
    if (n === 5) this.acc = 0;
    this.render();
  };

  private update(dt: number): void {
    // Hiệu ứng vẫn chạy cả khi dừng / thua để màn hình không "đứng hình".
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 260 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const p of this.popups) {
      p.y -= 40 * dt;
      p.life -= dt;
    }
    this.popups = this.popups.filter((p) => p.life > 0);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.shake = Math.max(0, this.shake - dt * 30);
    if (this.banner && (this.banner.t -= dt) <= 0) this.banner = null;
    for (const f of this.fallers) if (f.dying) f.dying = f.dying - dt || -1;
    this.fallers = this.fallers.filter((f) => !(f.dying < 0));
    if (this.state !== 'playing') return;

    const cfg = LEVELS[this.level];
    this.time += dt;
    this.freezeT = Math.max(0, this.freezeT - dt);
    const slow = this.freezeT > 0 ? 0.3 : 1;
    const speedMul = Math.min(3.2, 1 + this.time * cfg.accel);

    // ----- Sinh fumo -----
    this.nextSpawn -= dt * slow;
    const maxOnScreen = Math.min(10, 4 + Math.floor(this.time / 35));
    if (this.nextSpawn <= 0 && this.fallers.filter((f) => !f.dying).length < maxOnScreen) {
      this.spawn();
      this.nextSpawn = (cfg.spawn / Math.sqrt(speedMul)) * (this.boss ? 2.2 : 1) * rand(0.8, 1.2);
    }

    // ----- Boss -----
    if (!this.boss) {
      this.sinceBoss += dt;
      if (this.sinceBoss >= cfg.bossEvery) this.summonBoss();
    } else {
      this.updateBoss(dt, slow, speedMul);
    }

    // ----- Fumo rơi -----
    for (const f of this.fallers) {
      f.t += dt;
      if (f.dying) continue;
      f.y += cfg.fall * speedMul * f.sp * slow * dt;
      f.x += Math.sin(f.t * 1.3 + f.id) * 12 * dt;
      if (f.y >= GROUND - 8) this.groundHit(f);
    }
    this.fallers = this.fallers.filter((f) => f.y < H + 50);

    // ----- Chiêu của boss -----
    for (const s of this.shots) {
      s.t += dt;
      if (s.back) {
        const b = this.boss;
        if (!b) {
          s.y = -999;
          continue;
        }
        const dx = b.x - s.x;
        const dy = b.y - s.y;
        const d = Math.hypot(dx, dy) || 1;
        s.x += (dx / d) * 820 * dt;
        s.y += (dy / d) * 820 * dt;
        if (d < 50) {
          s.y = -999;
          this.hitBoss();
        }
        continue;
      }
      s.x += s.vx * slow * dt;
      s.y += s.vy * slow * dt;
      if (s.kind === 'orb') s.x += Math.sin(s.t * 3) * 70 * dt * slow;
      if (s.x < 30 || s.x > W - 30) s.vx *= -1;
      if (s.y >= GROUND - 6) {
        s.y = -999;
        this.loseLife(s.word, s.x, GROUND - 10, s.color);
      }
    }
    this.shots = this.shots.filter((s) => s.y > -500);
    if (this.targetId >= 0 && !this.candidates().some((c) => c.id === this.targetId)) this.targetId = -1;
  }

  // ================= Logic =================
  private candidates(): { id: number; word: JpWord; y: number }[] {
    return [
      ...this.fallers.filter((f) => !f.dying).map((f) => ({ id: f.id, word: f.word, y: f.y })),
      ...this.shots.filter((s) => !s.back).map((s) => ({ id: s.id, word: s.word, y: s.y })),
    ];
  }

  /** Chọn từ chưa có trên màn hình. */
  private pickWord(maxLen = 99): JpWord {
    const onScreen = new Set(this.candidates().map((c) => c.word.jp));
    const pool = WORDS[this.level].filter((w) => !onScreen.has(w.jp) && w.ro.length <= maxLen);
    return pick(pool.length ? pool : WORDS[this.level]);
  }

  private spawn(): void {
    let special: Special | undefined;
    const r = Math.random();
    if (this.time > 8 && r < 0.13) {
      special = r < 0.045 && this.lives < MAX_LIVES ? 'heart' : r < 0.09 ? 'bomb' : 'freeze';
    }
    const size = special ? 74 : rand(62, 92);
    this.fallers.push({
      id: ++this.seq,
      word: this.pickWord(),
      img: special ? SPECIALS[special].img : pick(NORMAL_IMGS),
      special,
      x: rand(90, W - 90),
      y: -40,
      sp: special ? 1.15 : 1.3 - (size - 62) / 100,
      size,
      t: 0,
      dying: 0,
    });
  }

  private resolve(c: { id: number }): void {
    const cfg = LEVELS[this.level];
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const comboMul = 1 + Math.min(this.combo, 30) / 15;

    const shot = this.shots.find((s) => s.id === c.id);
    if (shot) {
      // Ném ngược chiêu về boss.
      shot.back = true;
      shot.color = '#fff';
      this.score += Math.round(60 * cfg.mult * comboMul);
      this.popups.push({ x: shot.x, y: shot.y - 20, text: 'PHẢN ĐÒN!', color: '#fff', life: 0.9 });
      this.burst(shot.x, shot.y, '#ffffff', 14, true);
      sfx.play('reflect');
      return;
    }

    const f = this.fallers.find((x) => x.id === c.id);
    if (!f) return;
    f.dying = 0.35;
    this.killed++;
    const pts = Math.round((10 + f.word.ro.length * 6) * cfg.mult * comboMul);
    this.score += pts;
    this.popups.push({ x: f.x, y: f.y - f.size / 2, text: `+${pts}${this.combo >= 5 ? ` · combo ${this.combo}` : ''}`, color: cfg.color, life: 0.9 });
    this.burst(f.x, f.y, f.special ? SPECIALS[f.special].color : '#ffd6ec', 18, true);
    sfx.play('kill');
    if (f.special) this.trigger(f.special, f);
  }

  private trigger(kind: Special, f: Faller): void {
    const info = SPECIALS[kind];
    this.popups.push({ x: f.x, y: f.y - f.size, text: info.label, color: info.color, life: 1.3 });
    if (kind === 'heart') {
      this.lives = Math.min(MAX_LIVES, this.lives + 1);
      sfx.play('heal');
    } else if (kind === 'freeze') {
      this.freezeT = 5;
      this.flash = 0.6;
      this.flashColor = '#bfefff';
      sfx.play('freeze');
    } else {
      // Bom: nổ tung mọi fumo trên màn hình + phá chiêu của boss.
      this.flash = 1;
      this.flashColor = '#ffd2a6';
      this.shake = 14;
      sfx.play('bomb');
      for (const o of this.fallers) {
        if (o.dying || o === f) continue;
        o.dying = 0.35;
        this.killed++;
        this.score += Math.round(15 * LEVELS[this.level].mult);
        this.burst(o.x, o.y, '#ff9a3c', 14, false);
      }
      for (const s of this.shots) if (!s.back) {
        this.burst(s.x, s.y, s.color, 8, false);
        s.y = -999;
      }
    }
  }

  private groundHit(f: Faller): void {
    f.dying = 0.3;
    if (f.special === 'bomb' || f.special === 'freeze' || f.special === 'heart') {
      // Fumo đặc biệt rơi mất chỉ mất phần thưởng, không mất tim.
      this.burst(f.x, GROUND - 10, '#aaa', 8, false);
      sfx.play('miss');
      return;
    }
    this.loseLife(f.word, f.x, GROUND - 10, '#ff5d73');
  }

  private loseLife(word: JpWord, x: number, y: number, color: string): void {
    this.lives--;
    this.combo = 0;
    this.shake = 12;
    this.flash = 0.7;
    this.flashColor = '#ff3b4e';
    this.burst(x, y, color, 16, false);
    this.popups.push({ x, y: y - 30, text: `${word.jp} = ${word.ro}`, color: '#ffb3bf', life: 1.6 });
    if (!this.missed.some((m) => m.jp === word.jp)) this.missed.push(word);
    sfx.play('miss');
    if (this.lives <= 0) this.gameOver();
  }

  private summonBoss(): void {
    const def = BOSSES[this.bossCount % BOSSES.length];
    const cfg = LEVELS[this.level];
    const hp = cfg.bossHp + this.bossCount * 2;
    this.boss = { def, x: W / 2, y: -150, hp, max: hp, t: 0, nextAtk: 2.4, flash: 0, dying: 0 };
    this.showBanner(`BOSS · ${def.name}`, def.spell, def.color);
    this.shake = 8;
    sfx.play('bossIn');
  }

  private updateBoss(dt: number, slow: number, speedMul: number): void {
    const b = this.boss!;
    const cfg = LEVELS[this.level];
    b.t += dt;
    b.flash = Math.max(0, b.flash - dt * 3);
    if (b.dying) {
      b.dying -= dt;
      b.y -= 60 * dt;
      if (Math.random() < 0.5) this.burst(b.x + rand(-60, 60), b.y + rand(-60, 60), b.def.color, 4, true);
      if (b.dying <= 0) {
        this.boss = null;
        this.sinceBoss = 0;
      }
      return;
    }
    // Bay vào rồi lượn qua lại.
    const ty = 110;
    b.y += (ty - b.y) * Math.min(1, dt * 2);
    b.x = W / 2 + Math.sin(b.t * 0.7) * (W / 2 - 150);
    b.nextAtk -= dt * slow;
    if (b.nextAtk <= 0 && b.y > ty - 20) {
      this.bossAttack(b, speedMul);
      b.nextAtk = cfg.atkEvery * rand(0.85, 1.15) / Math.sqrt(speedMul);
    }
  }

  private bossAttack(b: Boss, speedMul: number): void {
    const cfg = LEVELS[this.level];
    const v = cfg.fall * 1.25 * Math.sqrt(speedMul);
    const mk = (vx: number, vy: number, dx = 0) =>
      this.shots.push({ id: ++this.seq, word: this.pickWord(9), kind: b.def.atk, x: b.x + dx, y: b.y + 50, vx, vy, t: 0, back: false, color: b.def.color });
    if (b.def.atk === 'icicle') mk(0, v * 1.1);
    else if (b.def.atk === 'orb') {
      mk(-25, v, -30);
      if (this.level !== 'easy') mk(25, v * 0.9, 30);
    } else {
      const n = this.level === 'hard' ? 3 : 2;
      for (let i = 0; i < n; i++) mk((i - (n - 1) / 2) * 55, v * 0.95, (i - (n - 1) / 2) * 40);
    }
    sfx.play('launch');
  }

  private hitBoss(): void {
    const b = this.boss;
    if (!b || b.dying) return;
    b.hp--;
    b.flash = 1;
    this.shake = 6;
    this.burst(b.x, b.y + 30, b.def.color, 20, true);
    sfx.play('bossHit');
    if (b.hp > 0) return;
    // Hạ boss!
    this.bossCount++;
    const bonus = Math.round(800 * LEVELS[this.level].mult * this.bossCount);
    this.score += bonus;
    b.dying = 1.6;
    this.lives = Math.min(MAX_LIVES, this.lives + 1);
    for (const s of this.shots) if (!s.back) s.y = -999;
    this.flash = 1;
    this.flashColor = '#fff6c2';
    this.showBanner(`Hạ gục ${b.def.name}!`, `+${bonus.toLocaleString('vi-VN')} điểm · +1 tim`, '#ffd23f');
    for (let i = 0; i < 4; i++) this.burst(b.x + rand(-80, 80), b.y + rand(-60, 80), i % 2 ? '#ffd23f' : b.def.color, 22, true);
    sfx.play('win');
  }

  private gameOver(): void {
    const key = `fumo.jptype.best.${this.level}`;
    const prev = JpTypingGame.best(this.level);
    const newBest = this.score > prev;
    if (newBest) {
      try {
        localStorage.setItem(key, String(this.score));
      } catch {
        /* bỏ qua */
      }
    }
    // Mọi thứ trên màn hình nổ tan để màn kết thúc gọn gàng.
    for (const f of this.fallers) if (!f.dying) {
      f.dying = 0.35;
      this.burst(f.x, f.y, '#ffd6ec', 6, false);
    }
    this.shots = [];
    this.targetId = -1;
    sfx.play('gameover');
    this.setState('over', {
      score: this.score,
      killed: this.killed,
      bosses: this.bossCount,
      bestCombo: this.bestCombo,
      accuracy: this.keys ? Math.max(0, Math.round((1 - this.typos / this.keys) * 100)) : 100,
      time: Math.round(this.time),
      newBest,
      missed: this.missed.slice(-10),
    });
  }

  private burst(x: number, y: number, color: string, n: number, star: boolean): void {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(80, 320);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: rand(0.4, 0.9), max: 0.9, color, size: rand(3, 7), star: star && Math.random() < 0.5 });
    }
  }

  private showBanner(title: string, sub: string, color: string): void {
    this.banner = { title, sub, t: 2.6, color };
  }

  private setState(s: JpState, r?: JpResult): void {
    this.state = s;
    this.onState(s, r);
  }

  private readonly onHidden = () => {
    if (document.hidden) this.pause();
  };

  // ================= Vẽ =================
  private readonly resize = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    const scale = (rect.width || W) / W;
    this.canvas.width = Math.round(W * scale * dpr);
    this.canvas.height = Math.round(H * scale * dpr);
    this.ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  };

  private render(): void {
    const g = this.ctx;
    g.save();
    if (this.shake) g.translate(rand(-this.shake, this.shake) * 0.5, rand(-this.shake, this.shake) * 0.5);
    this.drawScene(g);
    if (this.boss) this.drawBoss(g, this.boss);
    for (const f of this.fallers) this.drawFaller(g, f);
    for (const s of this.shots) this.drawShot(g, s);
    this.drawParticles(g);
    for (const p of this.popups) {
      g.globalAlpha = Math.min(1, p.life * 2);
      g.font = `bold 20px ${TEXT_FONT}`;
      g.textAlign = 'center';
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(0,0,0,.55)';
      g.strokeText(p.text, p.x, p.y);
      g.fillStyle = p.color;
      g.fillText(p.text, p.x, p.y);
    }
    g.globalAlpha = 1;
    if (this.freezeT > 0) {
      g.fillStyle = `rgba(150, 220, 255, ${0.12 + Math.sin(this.time * 6) * 0.03})`;
      g.fillRect(0, 0, W, H);
    }
    if (this.flash) {
      g.globalAlpha = this.flash * 0.35;
      g.fillStyle = this.flashColor;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
    g.restore();
    if (this.state !== 'title') this.drawHud(g);
    if (this.banner) this.drawBanner(g, this.banner);
  }

  private drawScene(g: CanvasRenderingContext2D): void {
    const sky = g.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#120c2e');
    sky.addColorStop(0.55, '#3b1d5c');
    sky.addColorStop(1, '#a8467a');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    const t = performance.now() / 1000;
    for (const s of this.stars) {
      g.globalAlpha = 0.4 + Math.sin(t * 2 + s.p) * 0.35;
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    // Trăng
    const moon = g.createRadialGradient(760, 90, 10, 760, 90, 90);
    moon.addColorStop(0, 'rgba(255,240,210,.95)');
    moon.addColorStop(0.45, 'rgba(255,220,170,.35)');
    moon.addColorStop(1, 'rgba(255,220,170,0)');
    g.fillStyle = moon;
    g.fillRect(660, 0, 200, 190);
    g.fillStyle = '#fff3d6';
    g.beginPath();
    g.arc(760, 90, 34, 0, Math.PI * 2);
    g.fill();
    // Cổng torii
    g.fillStyle = 'rgba(40, 8, 24, .55)';
    const tx = W / 2;
    g.fillRect(tx - 130, GROUND - 190, 18, 190);
    g.fillRect(tx + 112, GROUND - 190, 18, 190);
    g.fillRect(tx - 170, GROUND - 205, 340, 20);
    g.fillRect(tx - 150, GROUND - 160, 300, 12);
    // Mặt đất
    const ground = g.createLinearGradient(0, GROUND, 0, H);
    ground.addColorStop(0, '#3e8a4f');
    ground.addColorStop(1, '#1d4428');
    g.fillStyle = ground;
    g.fillRect(0, GROUND, W, H - GROUND);
    g.fillStyle = '#5fbf6e';
    g.fillRect(0, GROUND, W, 4);
  }

  /** Mức gợi ý theo độ khó và độ cao của vật (càng gần đất càng lộ romaji). */
  private hints(word: JpWord, y: number): { kana: boolean; ro: boolean; vi: boolean } {
    const p = y / GROUND;
    if (this.level === 'easy') return { kana: !!word.kana, ro: true, vi: false };
    if (this.level === 'normal') return { kana: !!word.kana, ro: p > 0.55, vi: true };
    return { kana: !!word.kana && p > 0.5, ro: p > 0.75, vi: true };
  }

  private drawLabel(g: CanvasRenderingContext2D, word: JpWord, x: number, y: number, targeted: boolean, accent: string): void {
    const h = this.hints(word, y);
    const jpSize = word.jp.length > 4 ? 22 : 26;
    g.font = `bold ${jpSize}px ${JP_FONT}`;
    const wJp = g.measureText(word.jp).width;
    g.font = `600 13px ${TEXT_FONT}`;
    const sub = [h.kana ? word.kana : '', h.vi ? word.vi : ''].filter(Boolean).join(' · ');
    const wSub = sub ? g.measureText(sub).width : 0;
    const bw = Math.max(wJp, wSub) + 24;
    const bh = jpSize + 14 + (sub ? 16 : 0);
    const bx = x - bw / 2;
    const by = y - bh;

    g.save();
    if (targeted) {
      g.shadowColor = accent;
      g.shadowBlur = 16;
    }
    g.fillStyle = targeted ? '#fffbe8' : 'rgba(255,255,255,.93)';
    g.strokeStyle = targeted ? accent : 'rgba(43,33,64,.25)';
    g.lineWidth = targeted ? 3 : 1.5;
    g.beginPath();
    g.roundRect(bx, by, bw, bh, 10);
    g.fill();
    g.stroke();
    g.restore();

    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.fillStyle = '#2b2140';
    g.font = `bold ${jpSize}px ${JP_FONT}`;
    g.fillText(word.jp, x, by + 6);
    if (sub) {
      g.font = `600 13px ${TEXT_FONT}`;
      g.fillStyle = '#6b5d86';
      g.fillText(sub, x, by + jpSize + 9);
    }
    // Dòng romaji / phần đã gõ
    const showTyped = targeted && this.typed && !/[^\x00-\x7f]/.test(this.typed);
    if (h.ro || showTyped) {
      g.font = `bold 15px ui-monospace, Consolas, monospace`;
      const ro = h.ro ? word.ro : this.typed.toLowerCase();
      const wRo = g.measureText(ro).width + 14;
      g.fillStyle = 'rgba(20, 12, 40, .78)';
      g.beginPath();
      g.roundRect(x - wRo / 2, by + bh + 3, wRo, 22, 6);
      g.fill();
      if (showTyped && h.ro) {
        // Tô phần đã gõ đúng
        const typed = this.typed.toLowerCase();
        const n = word.ro.toLowerCase().startsWith(typed) ? typed.length : 0;
        const left = x - (wRo - 14) / 2;
        g.textAlign = 'left';
        g.fillStyle = accent;
        g.fillText(ro.slice(0, n), left, by + bh + 7);
        g.fillStyle = '#fff';
        g.fillText(ro.slice(n), left + g.measureText(ro.slice(0, n)).width, by + bh + 7);
        g.textAlign = 'center';
      } else {
        g.fillStyle = showTyped ? accent : '#fff';
        g.fillText(ro, x, by + bh + 7);
      }
    }
    g.textBaseline = 'alphabetic';
  }

  private drawFaller(g: CanvasRenderingContext2D, f: Faller): void {
    const img = this.images.get(f.img);
    const dying = f.dying > 0;
    const k = dying ? Math.max(0, f.dying / 0.35) : 1;
    const size = f.size * (dying ? 1 + (1 - k) * 0.6 : 1);
    g.save();
    g.globalAlpha = k;
    g.translate(f.x, f.y);
    g.rotate(Math.sin(f.t * 2 + f.id) * 0.12 + (dying ? (1 - k) * 2 : 0));
    if (f.special) {
      const c = SPECIALS[f.special].color;
      const halo = g.createRadialGradient(0, 0, 4, 0, 0, size * 0.85);
      halo.addColorStop(0, c + 'aa');
      halo.addColorStop(1, c + '00');
      g.fillStyle = halo;
      g.beginPath();
      g.arc(0, 0, size * 0.85, 0, Math.PI * 2);
      g.fill();
    }
    if (img?.complete && img.naturalWidth) {
      const r = img.naturalWidth / img.naturalHeight;
      const h = size;
      const w = h * r;
      g.shadowColor = 'rgba(0,0,0,.4)';
      g.shadowBlur = 10;
      g.shadowOffsetY = 6;
      g.drawImage(img, -w / 2, -h / 2, w, h);
    } else {
      g.fillStyle = '#ffd6ec';
      g.beginPath();
      g.arc(0, 0, size / 2, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    if (f.special && !dying) {
      g.font = `bold 22px ${TEXT_FONT}`;
      g.textAlign = 'center';
      g.fillText(SPECIALS[f.special].icon, f.x + f.size * 0.42, f.y + f.size * 0.4);
    }
    if (!dying) this.drawLabel(g, f.word, f.x, f.y - f.size / 2 - 6, f.id === this.targetId, LEVELS[this.level].color);
  }

  private drawShot(g: CanvasRenderingContext2D, s: Shot): void {
    g.save();
    g.translate(s.x, s.y);
    g.shadowColor = s.color;
    g.shadowBlur = 18;
    if (s.kind === 'icicle') {
      g.rotate(s.back ? Math.PI : 0);
      g.fillStyle = '#d8f6ff';
      g.beginPath();
      g.moveTo(-14, -26);
      g.lineTo(14, -26);
      g.lineTo(0, 26);
      g.closePath();
      g.fill();
      g.strokeStyle = '#6fd6ff';
      g.lineWidth = 2;
      g.stroke();
    } else if (s.kind === 'orb') {
      // Âm dương ngọc
      g.rotate(s.t * 5);
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(0, 0, 20, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#d6243a';
      g.beginPath();
      g.arc(0, 0, 20, Math.PI / 2, -Math.PI / 2);
      g.arc(0, -10, 10, -Math.PI / 2, Math.PI / 2, true);
      g.arc(0, 10, 10, -Math.PI / 2, Math.PI / 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(0, 10, 3.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#d6243a';
      g.beginPath();
      g.arc(0, -10, 3.5, 0, Math.PI * 2);
      g.fill();
    } else {
      // Lá bùa
      g.rotate(Math.sin(s.t * 6) * 0.3 + (s.back ? Math.PI : 0));
      g.fillStyle = '#fff4e0';
      g.fillRect(-11, -24, 22, 48);
      g.strokeStyle = s.color;
      g.lineWidth = 3;
      g.strokeRect(-11, -24, 22, 48);
      g.fillStyle = s.color;
      g.font = `bold 16px ${JP_FONT}`;
      g.textAlign = 'center';
      g.fillText('封', 0, 6);
    }
    g.restore();
    if (!s.back) this.drawLabel(g, s.word, s.x, s.y - 34, s.id === this.targetId, '#ff5d73');
  }

  private drawBoss(g: CanvasRenderingContext2D, b: Boss): void {
    const img = this.images.get(b.def.img);
    const h = 190;
    g.save();
    g.globalAlpha = b.dying ? Math.max(0, b.dying / 1.6) : 1;
    g.translate(b.x, b.y);
    // Hào quang
    const aura = g.createRadialGradient(0, 10, 20, 0, 10, 150);
    aura.addColorStop(0, b.def.color + '88');
    aura.addColorStop(1, b.def.color + '00');
    g.fillStyle = aura;
    g.beginPath();
    g.arc(0, 10, 150, 0, Math.PI * 2);
    g.fill();
    if (img?.complete && img.naturalWidth) {
      const w = (h * img.naturalWidth) / img.naturalHeight;
      g.shadowColor = b.flash ? '#fff' : b.def.color;
      g.shadowBlur = b.flash ? 40 : 18;
      g.drawImage(img, -w / 2, -h / 2, w, h);
      if (b.flash) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha *= b.flash * 0.6;
        g.drawImage(img, -w / 2, -h / 2, w, h);
      }
    }
    g.restore();
    if (b.dying) return;
    // Thanh máu
    const bw = 360;
    const x = W / 2 - bw / 2;
    g.fillStyle = 'rgba(0,0,0,.55)';
    g.beginPath();
    g.roundRect(x - 4, 52, bw + 8, 18, 9);
    g.fill();
    const hpGrad = g.createLinearGradient(x, 0, x + bw, 0);
    hpGrad.addColorStop(0, b.def.color);
    hpGrad.addColorStop(1, '#ffd23f');
    g.fillStyle = hpGrad;
    g.beginPath();
    g.roundRect(x, 56, (bw * b.hp) / b.max, 10, 5);
    g.fill();
    g.font = `bold 13px ${TEXT_FONT}`;
    g.textAlign = 'center';
    g.fillStyle = '#fff';
    g.fillText(`${b.def.name} · ${b.def.spell}`, W / 2, 46);
  }

  private drawParticles(g: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      g.globalAlpha = Math.max(0, p.life / p.max);
      g.fillStyle = p.color;
      if (p.star) {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.life * 8);
        g.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
          g.lineTo(Math.cos(a) * p.size * 1.6, Math.sin(a) * p.size * 1.6);
        }
        g.closePath();
        g.fill();
        g.restore();
      } else {
        g.beginPath();
        g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  }

  private drawHud(g: CanvasRenderingContext2D): void {
    g.textBaseline = 'top';
    g.textAlign = 'left';
    g.font = `bold 22px ${TEXT_FONT}`;
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(0,0,0,.5)';
    const score = `${this.score.toLocaleString('vi-VN')} điểm`;
    g.strokeText(score, 14, 12);
    g.fillStyle = '#fff';
    g.fillText(score, 14, 12);
    g.font = `600 14px ${TEXT_FONT}`;
    g.fillStyle = 'rgba(255,255,255,.8)';
    const m = Math.floor(this.time / 60);
    const s = Math.floor(this.time % 60).toString().padStart(2, '0');
    g.fillText(`⏱ ${m}:${s} · đã diệt ${this.killed}${this.combo >= 3 ? ` · combo x${this.combo}` : ''}`, 14, 40);
    // Tim
    g.textAlign = 'right';
    g.font = `22px ${TEXT_FONT}`;
    let hearts = '';
    for (let i = 0; i < MAX_LIVES; i++) hearts += i < this.lives ? '♥' : i < START_LIVES ? '♡' : '';
    g.strokeText(hearts, W - 14, 12);
    g.fillStyle = '#ff5d8f';
    g.fillText(hearts, W - 14, 12);
    if (!this.boss) {
      const left = Math.max(0, Math.ceil(LEVELS[this.level].bossEvery - this.sinceBoss));
      g.font = `600 13px ${TEXT_FONT}`;
      g.fillStyle = 'rgba(255,255,255,.75)';
      g.fillText(left <= 10 ? `⚠ Boss tới sau ${left}s` : `Boss sau ${left}s`, W - 14, 40);
    }
    if (this.freezeT > 0) {
      g.textAlign = 'center';
      g.font = `bold 16px ${TEXT_FONT}`;
      g.fillStyle = '#bfefff';
      g.fillText(`❄ Đóng băng ${this.freezeT.toFixed(1)}s`, W / 2, GROUND + 14);
    }
    g.textBaseline = 'alphabetic';
  }

  private drawBanner(g: CanvasRenderingContext2D, b: { title: string; sub: string; t: number; color: string }): void {
    const a = Math.min(1, b.t * 2, (2.6 - b.t) * 4);
    g.save();
    g.globalAlpha = a;
    g.fillStyle = 'rgba(10, 6, 24, .62)';
    g.fillRect(0, H / 2 - 62, W, 104);
    g.textAlign = 'center';
    g.font = `900 40px ${TEXT_FONT}`;
    g.shadowColor = b.color;
    g.shadowBlur = 20;
    g.fillStyle = '#fff';
    g.fillText(b.title, W / 2, H / 2 - 8);
    g.shadowBlur = 0;
    g.font = `600 18px ${TEXT_FONT}`;
    g.fillStyle = b.color;
    g.fillText(b.sub, W / 2, H / 2 + 26);
    g.restore();
  }
}

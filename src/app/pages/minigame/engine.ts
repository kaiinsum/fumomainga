/**
 * "Đại chiến Mọt Vải" — game bắn đạn màn hình dọc (danmaku) chạy trên canvas.
 * Bé thú bông tự động bắn, né đạn, hạ các đợt mọt vải rồi đánh boss Nữ hoàng Mọt (3 giai đoạn).
 * Lõi game độc lập với Angular: component chỉ tạo, điều khiển và nhận sự kiện đổi trạng thái.
 */

import { playBaka, sfx } from '../../shared/sfx';

export const W = 480;
/** Font chữ trong game (giống font web, hiển thị dấu tiếng Việt chuẩn). */
const GAME_FONT = 'Montserrat, "Segoe UI", Roboto, Arial, sans-serif';
export const H = 640;
const STEP = 1000 / 60;

export type GameState = 'title' | 'playing' | 'paused' | 'over' | 'win';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface GameResult {
  score: number;
  hi: number;
  newHi: boolean;
}

interface Player {
  x: number;
  y: number;
  power: number;
  invuln: number;
  fireCd: number;
}

interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dead?: boolean;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  rice?: boolean;
  accel?: number;
  turn?: number;
  delay?: number;
  grazed?: boolean;
  dead?: boolean;
}

interface Enemy {
  x: number;
  y: number;
  hp: number;
  r: number;
  kind: 'moth' | 'fluff' | 'big';
  t: number;
  score: number;
  move: (e: Enemy) => void;
  shoot: (e: Enemy) => void;
  flash: number;
  dead?: boolean;
}

interface Item {
  x: number;
  y: number;
  vy: number;
  kind: 'power' | 'point' | 'bomb' | 'life';
  dead?: boolean;
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

interface BossPhase {
  name: string;
  hp: number;
  time: number;
  pattern: (b: Boss, g: DanmakuGame) => void;
}

interface Boss {
  x: number;
  y: number;
  tx: number;
  ty: number;
  hp: number;
  maxHp: number;
  phase: number;
  t: number;
  timeLeft: number;
  flash: number;
  entering: boolean;
  missed: boolean;
}

const COLORS = {
  red: '#ff4d6d',
  pink: '#ff7ac6',
  blue: '#4dabff',
  cyan: '#39e1ff',
  purple: '#b06bff',
  yellow: '#ffd23f',
  green: '#3ddc97',
  white: '#ffffff',
};

const HI_KEY = 'fumo.game.hi';
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;

export class DanmakuGame {
  state: GameState = 'title';
  private readonly ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private readonly keys = new Set<string>();
  private readonly sprites = new Map<string, HTMLCanvasElement>();

  // Thế giới
  private diff: Difficulty = 'normal';
  private frame = 0;
  private stageT = 0;
  private script: { at: number; run: () => void; done?: boolean }[] = [];
  private player!: Player;
  private shots: Shot[] = [];
  private bullets: Bullet[] = [];
  private enemies: Enemy[] = [];
  private items: Item[] = [];
  private particles: Particle[] = [];
  private boss: Boss | null = null;
  private bossDefeatedAt = 0;
  private score = 0;
  private hi = 0;
  /** Thông số admin chỉnh (xem models/game-params.ts). */
  params: Record<string, number> = {};
  private lives = 3;
  private bombs = 3;
  private graze = 0;
  private bombFx = 0;
  private banner: { text: string; sub: string; t: number } | null = null;
  private shake = 0;
  private stars: { x: number; y: number; s: number; v: number }[] = [];

  // Điều khiển cảm ứng (kéo để di chuyển)
  private touchId: number | null = null;
  private touchLast = { x: 0, y: 0 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onState: (s: GameState, r?: GameResult) => void,
  ) {
    this.ctx = canvas.getContext('2d')!;
    try {
      this.hi = Number(localStorage.getItem(HI_KEY)) || 0;
    } catch {
      this.hi = 0;
    }
    this.stars = Array.from({ length: 70 }, () => ({ x: rand(0, W), y: rand(0, H), s: rand(0.6, 2), v: rand(0.4, 2.2) }));
    this.resize();
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    addEventListener('resize', this.resize);
    addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    addEventListener('pointermove', this.onPointerMove);
    addEventListener('pointerup', this.onPointerUp);
    addEventListener('pointercancel', this.onPointerUp);
    this.raf = requestAnimationFrame(this.loop);
  }

  get highScore(): number {
    return this.hi;
  }

  // ================= Điều khiển từ bên ngoài =================
  start(diff: Difficulty): void {
    this.diff = diff;
    this.frame = 0;
    this.stageT = 0;
    this.player = { x: W / 2, y: H - 80, power: 1, invuln: 120, fireCd: 0 };
    this.shots = [];
    this.bullets = [];
    this.enemies = [];
    this.items = [];
    this.particles = [];
    this.boss = null;
    this.bossDefeatedAt = 0;
    this.score = 0;
    this.lives = this.pick(5, 3, 2) + Math.round(this.params['lives'] ?? 0);
    this.bombs = this.pick(3, 3, 2) + Math.round(this.params['bombs'] ?? 0);
    this.graze = 0;
    this.bombFx = 0;
    this.script = this.buildScript();
    this.showBanner('Màn 1', 'Bảo vệ tiệm thú bông!');
    this.setState('playing');
  }

  pause(): void {
    if (this.state === 'playing') this.setState('paused');
  }

  resume(): void {
    if (this.state === 'paused') {
      this.last = performance.now();
      this.setState('playing');
    }
  }

  bomb(): void {
    if (this.state !== 'playing' || this.bombs <= 0 || this.bombFx > 0) return;
    this.bombs--;
    this.bombFx = 70;
    sfx.play('bomb');
    this.player.invuln = Math.max(this.player.invuln, 120);
    this.shake = 14;
    for (const b of this.bullets) {
      this.score += 20;
      this.burst(b.x, b.y, b.color, 2, 1.5);
      b.dead = true;
    }
    for (const e of this.enemies) this.hitEnemy(e, 25);
    if (this.boss && !this.boss.entering) this.hitBoss(80, true);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this.onKeyDown);
    removeEventListener('keyup', this.onKeyUp);
    removeEventListener('resize', this.resize);
    removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    removeEventListener('pointermove', this.onPointerMove);
    removeEventListener('pointerup', this.onPointerUp);
    removeEventListener('pointercancel', this.onPointerUp);
  }

  // ================= Vòng lặp =================
  private readonly loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.last) this.last = now;
    this.acc += Math.min(100, now - this.last);
    this.last = now;
    let steps = 0;
    while (this.acc >= STEP && steps < 5) {
      if (this.state === 'playing') this.update();
      else this.updateIdle();
      this.acc -= STEP;
      steps++;
    }
    if (steps === 5) this.acc = 0;
    this.render();
  };

  private setState(s: GameState, r?: GameResult): void {
    this.state = s;
    this.onState(s, r);
  }

  private finish(win: boolean): void {
    const newHi = this.score > this.hi;
    sfx.play(win ? 'win' : 'gameover');
    if (newHi) {
      this.hi = this.score;
      try {
        localStorage.setItem(HI_KEY, String(this.hi));
      } catch {
        /* bỏ qua */
      }
    }
    if (!win) playBaka();
    this.setState(win ? 'win' : 'over', { score: this.score, hi: this.hi, newHi });
  }

  private updateIdle(): void {
    this.frame++;
    for (const s of this.stars) s.y = (s.y + s.v * 0.4) % H;
    this.particles = this.particles.filter((p) => ++p.life < p.max);
  }

  // ================= Kịch bản màn chơi =================
  private buildScript() {
    const s: { at: number; run: () => void }[] = [];
    const add = (at: number, run: () => void) => s.push({ at, run });
    // Đợt 1: mọt bay vòng từ hai bên, bắn đạn ngắm.
    for (let i = 0; i < 6; i++) add(60 + i * 14, () => this.spawnMoth(-20, 80, 1));
    for (let i = 0; i < 6; i++) add(220 + i * 14, () => this.spawnMoth(W + 20, 110, -1));
    // Đợt 2: hàng bông gòn rơi xuống, bắn quạt 3 tia.
    add(430, () => this.showBanner('Đợt 2', 'Bông gòn nổi loạn'));
    for (let i = 0; i < 6; i++) add(470 + i * 10, () => this.spawnFluff(60 + i * 72, -20));
    for (let i = 0; i < 5; i++) add(650 + i * 10, () => this.spawnFluff(96 + i * 72, -20));
    // Đợt 3: cuộn len to, nổ vòng đạn.
    add(860, () => this.showBanner('Đợt 3', 'Cuộn len khổng lồ'));
    add(900, () => this.spawnBig(W * 0.3));
    add(960, () => this.spawnBig(W * 0.7));
    for (let i = 0; i < 5; i++) add(1100 + i * 14, () => this.spawnMoth(-20, 60, 1));
    for (let i = 0; i < 5; i++) add(1100 + i * 14, () => this.spawnMoth(W + 20, 60, -1));
    add(1250, () => this.spawnBig(W / 2));
    return s;
  }

  private spawnMoth(x: number, y: number, dir: 1 | -1): void {
    const baseY = y;
    this.enemies.push({
      x, y, hp: 3, r: 14, kind: 'moth', t: 0, score: 100, flash: 0,
      move: (e) => {
        e.x += dir * 2.6;
        e.y = baseY + Math.sin(e.t / 20) * 30 + e.t * 0.35;
      },
      shoot: (e) => {
        if (e.t % 70 === 30) this.aimed(e.x, e.y, this.spd(2.6), 1, 0, COLORS.pink, 5);
      },
    });
  }

  private spawnFluff(x: number, y: number): void {
    this.enemies.push({
      x, y, hp: 10, r: 16, kind: 'fluff', t: 0, score: 300, flash: 0,
      move: (e) => {
        e.y += e.t < 50 ? 2.2 : e.t < 200 ? 0.15 : 2.4;
      },
      shoot: (e) => {
        if (e.t > 50 && e.t < 200 && e.t % 45 === 0) this.aimed(e.x, e.y, this.spd(2.4), this.pick(3, 5, 7), 0.2, COLORS.blue, 5);
      },
    });
  }

  private spawnBig(x: number): void {
    this.enemies.push({
      x, y: -30, hp: 45, r: 26, kind: 'big', t: 0, score: 1500, flash: 0,
      move: (e) => {
        if (e.t < 70) e.y += 2;
        else if (e.t > 420) e.y += 1.5;
        e.x += Math.sin(e.t / 40) * 0.8;
      },
      shoot: (e) => {
        if (e.t > 70 && e.t < 420 && e.t % 50 === 0) {
          this.ring(e.x, e.y, this.spd(1.9), this.pick(12, 18, 24), e.t / 50 * 0.17, COLORS.purple, 6);
        }
      },
    });
  }

  // ================= Boss =================
  private readonly bossPhases: BossPhase[] = [
    {
      name: 'Bão bông gòn',
      hp: 520,
      time: 45,
      pattern: (b, g) => {
        // Xoắn ốc 3 nhánh + đạn ngắm.
        const arms = g.pick(2, 3, 4);
        if (b.t % 5 === 0) {
          for (let i = 0; i < arms; i++) {
            const a = b.t * 0.045 + (i * Math.PI * 2) / arms;
            g.fire(b.x, b.y, Math.cos(a) * g.spd(2.4), Math.sin(a) * g.spd(2.4), 6, COLORS.cyan);
          }
        }
        if (b.t % 90 === 45) g.aimed(b.x, b.y, g.spd(3.2), 5, 0.12, COLORS.white, 5, true);
      },
    },
    {
      name: 'Mưa kim chỉ',
      hp: 620,
      time: 45,
      pattern: (b, g) => {
        // Kim rơi từ trên xuống + vòng đạn từ boss.
        const every = g.pick(7, 4, 3);
        if (b.t % every === 0) {
          g.bullets.push({ x: rand(0, W), y: -10, vx: rand(-0.3, 0.3), vy: g.spd(rand(2.2, 3.4)), r: 4, color: COLORS.yellow, rice: true });
        }
        if (b.t % 70 === 0) g.ring(b.x, b.y, g.spd(2), g.pick(16, 24, 30), rand(0, 1), COLORS.red, 7);
        if (b.t % 140 === 100) b.tx = rand(90, W - 90);
      },
    },
    {
      name: 'Vũ điệu sợi len',
      hp: 820,
      time: 60,
      pattern: (b, g) => {
        // Hoa xoay hai chiều + đạn rẽ hướng + đạn ngắm dày.
        const n = g.pick(10, 14, 18);
        if (b.t % 22 === 0) {
          const off = b.t * 0.03;
          for (let i = 0; i < n; i++) {
            const a = off + (i * Math.PI * 2) / n;
            g.bullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * g.spd(2.2), vy: Math.sin(a) * g.spd(2.2), r: 6, color: COLORS.pink, turn: 0.012 });
            g.bullets.push({ x: b.x, y: b.y, vx: Math.cos(-a) * g.spd(1.7), vy: Math.sin(-a) * g.spd(1.7), r: 6, color: COLORS.purple, turn: -0.012 });
          }
        }
        if (b.t % 60 === 30) g.aimed(b.x, b.y, g.spd(3.6), 3, 0.08, COLORS.white, 5, true);
        if (b.t % 120 === 0) {
          b.tx = rand(100, W - 100);
          b.ty = rand(90, 170);
        }
      },
    },
  ];

  private spawnBoss(): void {
    const p = this.bossPhases[0];
    const hp = this.scaleHp(p.hp);
    this.boss = { x: W / 2, y: -80, tx: W / 2, ty: 130, hp, maxHp: hp, phase: 0, t: 0, timeLeft: p.time * 60, flash: 0, entering: true, missed: false };
    this.showBanner('BOSS', 'Nữ hoàng Mọt Vải');
  }

  private scaleHp(hp: number): number {
    return Math.round(hp * this.pick(0.7, 1, 1.3));
  }

  private updateBoss(): void {
    const b = this.boss!;
    b.x += (b.tx - b.x) * 0.04;
    b.y += (b.ty - b.y) * 0.04;
    if (b.flash > 0) b.flash--;
    if (b.entering) {
      if (Math.abs(b.y - b.ty) < 2) {
        b.entering = false;
        this.showBanner(`Chiêu 1/3`, this.bossPhases[0].name);
      }
      return;
    }
    b.t++;
    b.timeLeft--;
    this.bossPhases[b.phase].pattern(b, this);
    if (b.timeLeft <= 0) this.nextBossPhase(false);
  }

  private hitBoss(dmg: number, fromBomb = false): void {
    const b = this.boss;
    if (!b || b.entering) return;
    b.hp -= dmg;
    b.flash = 3;
    if (!fromBomb) sfx.play('hit');
    if (b.hp <= 0) this.nextBossPhase(true);
  }

  private nextBossPhase(defeated: boolean): void {
    const b = this.boss!;
    sfx.play(b.phase + 1 >= this.bossPhases.length ? 'explode' : 'spell');
    if (defeated) this.score += b.missed ? 5000 : 15000;
    this.burst(b.x, b.y, COLORS.yellow, 40, 5);
    this.shake = 12;
    for (const blt of this.bullets) {
      this.items.push({ x: blt.x, y: blt.y, vy: -1, kind: 'point' });
    }
    this.bullets = [];
    this.items.push({ x: b.x, y: b.y, vy: -2, kind: 'power' }, { x: b.x + 20, y: b.y, vy: -2, kind: 'power' });
    if (b.phase === 0) this.items.push({ x: b.x - 20, y: b.y, vy: -2, kind: 'bomb' });
    if (b.phase === 1) this.items.push({ x: b.x - 20, y: b.y, vy: -2, kind: 'life' });
    b.phase++;
    if (b.phase >= this.bossPhases.length) {
      this.score += this.lives * 10000 + this.bombs * 3000;
      this.burst(b.x, b.y, COLORS.pink, 80, 7);
      this.boss = null;
      this.bossDefeatedAt = this.frame;
      this.showBanner('CHIẾN THẮNG!', 'Tiệm thú bông an toàn rồi');
      return;
    }
    const p = this.bossPhases[b.phase];
    b.hp = b.maxHp = this.scaleHp(p.hp);
    b.t = -60;
    b.timeLeft = p.time * 60;
    b.missed = false;
    b.tx = W / 2;
    b.ty = 130;
    this.showBanner(`Chiêu ${b.phase + 1}/3`, p.name);
  }

  // ================= Cập nhật =================
  private update(): void {
    this.frame++;
    this.stageT++;
    if (this.shake > 0) this.shake--;
    if (this.bombFx > 0) this.bombFx--;
    if (this.banner && ++this.banner.t > 150) this.banner = null;
    for (const s of this.stars) s.y = (s.y + s.v) % H;

    // Kịch bản
    for (const ev of this.script) {
      if (!ev.done && this.stageT >= ev.at) {
        ev.done = true;
        ev.run();
      }
    }
    const scriptDone = this.script.every((e) => e.done);
    if (scriptDone && !this.boss && !this.bossDefeatedAt && !this.enemies.length && this.stageT > 1400) this.spawnBoss();
    if (this.bossDefeatedAt && this.frame - this.bossDefeatedAt > 150) return this.finish(true);

    this.updatePlayer();
    if (this.boss) this.updateBoss();

    // Đạn của người chơi
    for (const s of this.shots) {
      s.x += s.vx;
      s.y += s.vy;
      if (s.y < -20 || s.x < -20 || s.x > W + 20) s.dead = true;
      for (const e of this.enemies) {
        if (!e.dead && dist2(s.x, s.y, e.x, e.y) < (e.r + 4) ** 2) {
          s.dead = true;
          this.hitEnemy(e, 1);
          break;
        }
      }
      const b = this.boss;
      if (!s.dead && b && !b.entering && dist2(s.x, s.y, b.x, b.y) < 38 ** 2) {
        s.dead = true;
        this.hitBoss(1);
        if (Math.random() < 0.3) this.burst(s.x, s.y, COLORS.white, 1, 1.5);
      }
    }
    this.shots = this.shots.filter((s) => !s.dead);

    // Quân địch
    for (const e of this.enemies) {
      e.t++;
      if (e.flash > 0) e.flash--;
      e.move(e);
      e.shoot(e);
      if (e.t > 60 && (e.y > H + 40 || e.x < -60 || e.x > W + 60)) e.dead = true;
      if (!e.dead && this.player.invuln <= 0 && dist2(e.x, e.y, this.player.x, this.player.y) < (e.r + 4) ** 2) this.playerHit();
    }
    this.enemies = this.enemies.filter((e) => !e.dead);

    // Đạn địch
    const p = this.player;
    for (const b of this.bullets) {
      if (b.delay && b.delay-- > 0) continue;
      if (b.turn) {
        const c = Math.cos(b.turn);
        const s = Math.sin(b.turn);
        const vx = b.vx * c - b.vy * s;
        b.vy = b.vx * s + b.vy * c;
        b.vx = vx;
      }
      if (b.accel) {
        b.vx *= b.accel;
        b.vy *= b.accel;
      }
      b.x += b.vx;
      b.y += b.vy;
      if (b.x < -30 || b.x > W + 30 || b.y < -40 || b.y > H + 30) {
        b.dead = true;
        continue;
      }
      const d = dist2(b.x, b.y, p.x, p.y);
      if (d < (b.r * 0.7 + 2.5) ** 2) {
        if (p.invuln <= 0) {
          b.dead = true;
          this.playerHit();
        }
      } else if (!b.grazed && d < (b.r + 16) ** 2 && p.invuln <= 0) {
        b.grazed = true;
        this.graze++;
        this.score += 50;
        this.particles.push({ x: p.x, y: p.y, vx: rand(-1, 1), vy: rand(-1.5, -0.5), life: 0, max: 18, color: COLORS.white, size: 2 });
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);

    // Vật phẩm
    const attract = p.y < 170;
    for (const it of this.items) {
      if (attract) {
        const dx = p.x - it.x;
        const dy = p.y - it.y;
        const len = Math.hypot(dx, dy) || 1;
        it.x += (dx / len) * 9;
        it.y += (dy / len) * 9;
      } else {
        it.vy = Math.min(2.4, it.vy + 0.06);
        it.y += it.vy;
      }
      if (it.y > H + 20) it.dead = true;
      if (dist2(it.x, it.y, p.x, p.y) < 26 ** 2) {
        it.dead = true;
        this.collect(it);
      }
    }
    this.items = this.items.filter((i) => !i.dead);

    for (const pt of this.particles) {
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.vx *= 0.96;
      pt.vy *= 0.96;
      pt.life++;
    }
    this.particles = this.particles.filter((pt) => pt.life < pt.max);
  }

  private updatePlayer(): void {
    const p = this.player;
    const focus = this.keys.has('Shift');
    const sp = focus ? 2 : 4.6;
    let dx = 0;
    let dy = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('a')) dx--;
    if (this.keys.has('ArrowRight') || this.keys.has('d')) dx++;
    if (this.keys.has('ArrowUp') || this.keys.has('w')) dy--;
    if (this.keys.has('ArrowDown') || this.keys.has('s')) dy++;
    if (dx && dy) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }
    p.x = Math.max(12, Math.min(W - 12, p.x + dx * sp));
    p.y = Math.max(20, Math.min(H - 16, p.y + dy * sp));
    if (p.invuln > 0) p.invuln--;

    // Tự động bắn; giữ Shift thì đạn tập trung thẳng hơn.
    if (--p.fireCd <= 0) {
      p.fireCd = 5;
      sfx.play('shot');
      const spread = focus ? 0.04 : 0.13;
      const lines = Math.min(4, Math.floor(p.power));
      this.shots.push({ x: p.x - 6, y: p.y - 14, vx: 0, vy: -11 }, { x: p.x + 6, y: p.y - 14, vx: 0, vy: -11 });
      for (let i = 1; i < lines; i++) {
        const a = spread * i;
        this.shots.push(
          { x: p.x, y: p.y - 10, vx: -Math.sin(a) * 10, vy: -Math.cos(a) * 10 },
          { x: p.x, y: p.y - 10, vx: Math.sin(a) * 10, vy: -Math.cos(a) * 10 },
        );
      }
    }
  }

  private hitEnemy(e: Enemy, dmg: number): void {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 3;
    if (e.hp > 0) return sfx.play('hit');
    e.dead = true;
    sfx.play('explode');
    this.score += e.score;
    this.burst(e.x, e.y, e.kind === 'big' ? COLORS.purple : e.kind === 'fluff' ? COLORS.blue : COLORS.pink, e.kind === 'big' ? 30 : 12, e.kind === 'big' ? 4 : 2.5);
    const drops: Item['kind'][] =
      e.kind === 'big' ? ['power', 'power', 'point', 'point', 'point'] : e.kind === 'fluff' ? ['power', 'point'] : Math.random() < 0.5 ? ['point'] : [];
    if (e.kind === 'big' && Math.random() < 0.35) drops.push('bomb');
    for (const k of drops) this.items.push({ x: e.x + rand(-14, 14), y: e.y + rand(-10, 10), vy: -2.2, kind: k });
    // Cuộn len to nổ ra vòng đạn khi bị hạ (chế độ thường).
    if (e.kind === 'big' && this.diff !== 'easy') this.ring(e.x, e.y, this.spd(1.6), this.pick(0, 12, 16), 0, COLORS.purple, 5);
  }

  private collect(it: Item): void {
    sfx.play('pickup');
    if (it.kind === 'power') {
      this.player.power = Math.min(4, this.player.power + 0.25);
      this.score += 50;
    } else if (it.kind === 'point') this.score += 300 + Math.max(0, Math.round((H - this.player.y) / 2));
    else if (it.kind === 'bomb') this.bombs = Math.min(5, this.bombs + 1);
    else if (it.kind === 'life') this.lives = Math.min(8, this.lives + 1);
  }

  private playerHit(): void {
    const p = this.player;
    sfx.play('playerHit');
    this.burst(p.x, p.y, COLORS.white, 40, 5);
    this.shake = 16;
    this.lives--;
    if (this.boss) this.boss.missed = true;
    if (this.lives < 0) {
      this.lives = 0;
      return this.finish(false);
    }
    // Rơi bớt sức mạnh, xoá đạn gần, bất tử tạm thời.
    const lost = Math.min(1, p.power - 1);
    p.power = Math.max(1, p.power - 1);
    for (let i = 0; i < lost * 4; i++) this.items.push({ x: p.x + rand(-40, 40), y: p.y - 60, vy: -3, kind: 'power' });
    for (const b of this.bullets) if (dist2(b.x, b.y, p.x, p.y) < 140 ** 2) b.dead = true;
    this.bombs = Math.max(this.bombs, 2);
    p.x = W / 2;
    p.y = H - 70;
    p.invuln = 180;
  }

  // ================= Mẫu bắn =================
  /** Tốc độ đạn theo độ khó. */
  spd(v: number): number {
    return v * this.pick(0.78, 1, 1.18);
  }

  /** Chọn giá trị theo độ khó: dễ / trung bình / khó. */
  pick<T>(easy: T, normal: T, hard: T): T {
    return this.diff === 'easy' ? easy : this.diff === 'hard' ? hard : normal;
  }

  fire(x: number, y: number, vx: number, vy: number, r: number, color: string, rice = false): void {
    if (this.bullets.length > 1600) return;
    this.bullets.push({ x, y, vx, vy, r, color, rice });
  }

  aimed(x: number, y: number, speed: number, count: number, spread: number, color: string, r: number, rice = false): void {
    const base = Math.atan2(this.player.y - y, this.player.x - x);
    for (let i = 0; i < count; i++) {
      const a = base + (i - (count - 1) / 2) * spread;
      this.fire(x, y, Math.cos(a) * speed, Math.sin(a) * speed, r, color, rice);
    }
  }

  ring(x: number, y: number, speed: number, count: number, offset: number, color: string, r: number): void {
    for (let i = 0; i < count; i++) {
      const a = offset + (i * Math.PI * 2) / count;
      this.fire(x, y, Math.cos(a) * speed, Math.sin(a) * speed, r, color);
    }
  }

  private burst(x: number, y: number, color: string, n: number, speed: number): void {
    for (let i = 0; i < n && this.particles.length < 700; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(0.5, speed);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: rand(20, 45), color, size: rand(1.5, 3.5) });
    }
  }

  private showBanner(text: string, sub: string): void {
    this.banner = { text, sub, t: 0 };
  }

  // ================= Vẽ =================
  /** Hệ số phóng chữ HUD: lớn hơn 1 khi canvas bị thu nhỏ trên điện thoại. */
  private ui = 1;

  private readonly resize = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    const scale = (rect.width || W) / W;
    this.canvas.width = Math.round(W * scale * dpr);
    this.canvas.height = Math.round(H * scale * dpr);
    this.ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    this.ui = Math.min(1.6, Math.max(1, 0.9 / scale));
  };

  private bulletSprite(color: string, r: number, rice: boolean): HTMLCanvasElement {
    const key = `${color}|${r}|${rice}`;
    let c = this.sprites.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    const size = Math.ceil(r * 4);
    c.width = size;
    c.height = size;
    const g = c.getContext('2d')!;
    g.translate(size / 2, size / 2);
    if (rice) g.scale(0.55, 1.25);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, r * 1.6);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.45, '#fff');
    grad.addColorStop(0.55, color);
    grad.addColorStop(1, 'transparent');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, r * 1.6, 0, Math.PI * 2);
    g.fill();
    this.sprites.set(key, c);
    return c;
  }

  private render(): void {
    const g = this.ctx;
    g.save();
    if (this.shake > 0) g.translate(rand(-this.shake, this.shake) * 0.4, rand(-this.shake, this.shake) * 0.4);

    // Nền
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1a0f2e');
    bg.addColorStop(1, '#0b1630');
    g.fillStyle = bg;
    g.fillRect(-20, -20, W + 40, H + 40);
    for (const s of this.stars) {
      g.globalAlpha = 0.35 + s.s * 0.25;
      g.fillStyle = '#fff';
      g.fillRect(s.x, s.y, s.s, s.s * 2);
    }
    g.globalAlpha = 1;

    if (this.state !== 'title') {
      for (const it of this.items) this.drawItem(it);
      for (const e of this.enemies) this.drawEnemy(e);
      if (this.boss) this.drawBoss(this.boss);
      g.fillStyle = 'rgba(255, 210, 63, 0.75)';
      for (const s of this.shots) g.fillRect(s.x - 2, s.y - 8, 4, 14);
      this.drawPlayer();
      for (const b of this.bullets) {
        const spr = this.bulletSprite(b.color, b.r, !!b.rice);
        if (b.rice) {
          g.save();
          g.translate(b.x, b.y);
          g.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);
          g.drawImage(spr, -spr.width / 2, -spr.height / 2);
          g.restore();
        } else g.drawImage(spr, b.x - spr.width / 2, b.y - spr.height / 2);
      }
      for (const pt of this.particles) {
        g.globalAlpha = 1 - pt.life / pt.max;
        g.fillStyle = pt.color;
        g.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
      }
      g.globalAlpha = 1;
      if (this.bombFx > 0) {
        const t = 1 - this.bombFx / 70;
        g.strokeStyle = `rgba(255, 122, 198, ${1 - t})`;
        g.lineWidth = 14 * (1 - t) + 2;
        g.beginPath();
        g.arc(this.player.x, this.player.y, t * 520, 0, Math.PI * 2);
        g.stroke();
      }
      this.drawHud();
      this.drawBanner();
    }
    g.restore();
  }

  private drawPlayer(): void {
    const g = this.ctx;
    const p = this.player;
    if (p.invuln > 0 && Math.floor(p.invuln / 4) % 2 === 0) return;
    g.save();
    g.translate(p.x, p.y);
    // Thân bé thú bông
    g.fillStyle = '#ff9ec4';
    g.beginPath();
    g.ellipse(0, 6, 11, 9, 0, 0, Math.PI * 2);
    g.fill();
    // Đầu
    g.fillStyle = '#ffe2c4';
    g.beginPath();
    g.arc(0, -6, 11, 0, Math.PI * 2);
    g.fill();
    // Tóc
    g.fillStyle = '#7ec8ff';
    g.beginPath();
    g.arc(0, -9, 11.5, Math.PI, Math.PI * 2);
    g.fill();
    // Nơ
    g.fillStyle = '#ff4d6d';
    g.beginPath();
    g.moveTo(0, -18);
    g.lineTo(-10, -25);
    g.lineTo(-10, -13);
    g.closePath();
    g.moveTo(0, -18);
    g.lineTo(10, -25);
    g.lineTo(10, -13);
    g.closePath();
    g.fill();
    // Mắt
    g.fillStyle = '#2b2140';
    g.fillRect(-5, -6, 2.5, 3.5);
    g.fillRect(3, -6, 2.5, 3.5);
    g.restore();
    // Điểm trúng đạn (luôn hiện khi giữ Shift)
    if (this.keys.has('Shift')) {
      g.fillStyle = '#fff';
      g.strokeStyle = '#ff4d6d';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }

  private drawEnemy(e: Enemy): void {
    const g = this.ctx;
    g.save();
    g.translate(e.x, e.y);
    if (e.flash) g.globalAlpha = 0.55;
    if (e.kind === 'moth') {
      const flap = Math.sin(e.t / 3) * 0.4 + 0.8;
      g.fillStyle = '#c9a7ff';
      g.beginPath();
      g.ellipse(-9, 0, 9 * flap, 7, -0.4, 0, Math.PI * 2);
      g.ellipse(9, 0, 9 * flap, 7, 0.4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#5b3d8a';
      g.beginPath();
      g.ellipse(0, 0, 3.5, 9, 0, 0, Math.PI * 2);
      g.fill();
    } else if (e.kind === 'fluff') {
      g.fillStyle = '#e8f4ff';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + e.t / 30;
        g.beginPath();
        g.arc(Math.cos(a) * 8, Math.sin(a) * 8, 8, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#2b2140';
      g.fillRect(-5, -2, 3, 3);
      g.fillRect(3, -2, 3, 3);
    } else {
      g.rotate(e.t / 25);
      g.fillStyle = '#b06bff';
      g.beginPath();
      g.arc(0, 0, e.r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#e3c8ff';
      g.lineWidth = 2;
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.ellipse(0, 0, e.r * 0.9, Math.abs(i) * 6 + 3, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
    g.restore();
  }

  private drawBoss(b: Boss): void {
    const g = this.ctx;
    g.save();
    g.translate(b.x, b.y);
    const flap = Math.sin(this.frame / 6) * 0.25 + 1;
    // Hào quang
    const aura = g.createRadialGradient(0, 0, 10, 0, 0, 80);
    aura.addColorStop(0, 'rgba(255, 122, 198, 0.35)');
    aura.addColorStop(1, 'transparent');
    g.fillStyle = aura;
    g.fillRect(-90, -90, 180, 180);
    if (b.flash) g.globalAlpha = 0.6;
    // Cánh
    g.fillStyle = '#a77bff';
    g.beginPath();
    g.ellipse(-34, -8, 32 * flap, 22, -0.5, 0, Math.PI * 2);
    g.ellipse(34, -8, 32 * flap, 22, 0.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ff9ed1';
    g.beginPath();
    g.ellipse(-26, 18, 20 * flap, 14, 0.5, 0, Math.PI * 2);
    g.ellipse(26, 18, 20 * flap, 14, -0.5, 0, Math.PI * 2);
    g.fill();
    // Thân
    g.fillStyle = '#4a2c7a';
    g.beginPath();
    g.ellipse(0, 4, 11, 26, 0, 0, Math.PI * 2);
    g.fill();
    // Vương miện
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.moveTo(-10, -22);
    g.lineTo(-6, -34);
    g.lineTo(0, -24);
    g.lineTo(6, -34);
    g.lineTo(10, -22);
    g.closePath();
    g.fill();
    g.fillStyle = '#fff';
    g.fillRect(-6, -12, 3, 4);
    g.fillRect(3, -12, 3, 4);
    g.restore();
  }

  private drawItem(it: Item): void {
    const g = this.ctx;
    const color = it.kind === 'power' ? COLORS.red : it.kind === 'point' ? COLORS.blue : it.kind === 'bomb' ? COLORS.green : COLORS.pink;
    g.fillStyle = color;
    g.fillRect(it.x - 6, it.y - 6, 12, 12);
    g.fillStyle = '#fff';
    g.font = `bold 9px ${GAME_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(it.kind === 'power' ? 'P' : it.kind === 'point' ? '+' : it.kind === 'bomb' ? 'B' : '♥', it.x, it.y + 0.5);
  }

  private drawHud(): void {
    const g = this.ctx;
    const u = this.ui;
    g.textBaseline = 'top';
    // Góc trái: điểm, kỷ lục
    g.save();
    g.scale(u, u);
    g.textAlign = 'left';
    g.fillStyle = '#fff';
    g.font = `800 15px ${GAME_FONT}`;
    g.fillText(`Điểm ${this.score.toLocaleString('vi-VN')}`, 10, 10);
    g.font = `600 12px ${GAME_FONT}`;
    g.fillStyle = 'rgba(255,255,255,.75)';
    g.fillText(`Kỷ lục ${Math.max(this.hi, this.score).toLocaleString('vi-VN')} · Sượt ${this.graze}`, 10, 30);
    g.restore();
    // Góc phải: tim, bom, thanh sức mạnh
    g.save();
    g.translate(W, 0);
    g.scale(u, u);
    g.textAlign = 'right';
    g.font = `15px ${GAME_FONT}`;
    g.fillStyle = COLORS.pink;
    g.fillText('♥'.repeat(Math.min(this.lives, 8)), -10, 10);
    g.fillStyle = COLORS.green;
    g.fillText('★'.repeat(this.bombs), -10, 30);
    g.fillStyle = 'rgba(255,255,255,.18)';
    g.fillRect(-90, 52, 80, 5);
    g.fillStyle = COLORS.red;
    g.fillRect(-90, 52, 80 * ((this.player.power - 1) / 3), 5);
    g.restore();

    const b = this.boss;
    if (b && !b.entering) {
      const top = 52 * u + (u - 1) * 14;
      g.fillStyle = 'rgba(255,255,255,.2)';
      g.fillRect(10, top, W - 120 * u, 6);
      g.fillStyle = '#ff7ac6';
      g.fillRect(10, top, (W - 120 * u) * Math.max(0, b.hp / b.maxHp), 6);
      g.save();
      g.translate(10, top + 10);
      g.scale(u, u);
      g.textAlign = 'left';
      g.font = `700 11px ${GAME_FONT}`;
      g.fillStyle = '#fff';
      g.fillText(`${this.bossPhases[b.phase].name} · ${Math.ceil(b.timeLeft / 60)}s · còn ${this.bossPhases.length - b.phase} chiêu`, 0, 0, (W - 20) / u);
      g.restore();
    }
  }

  private drawBanner(): void {
    const bn = this.banner;
    if (!bn) return;
    const g = this.ctx;
    const u = this.ui;
    const a = bn.t < 20 ? bn.t / 20 : bn.t > 120 ? (150 - bn.t) / 30 : 1;
    g.globalAlpha = Math.max(0, a);
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(0, H / 2 - 50 * u, W, 100 * u);
    g.save();
    g.translate(W / 2, H / 2);
    g.scale(u, u);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.font = `900 34px ${GAME_FONT}`;
    g.fillText(bn.text, 0, -12, (W - 20) / u);
    g.font = `600 16px ${GAME_FONT}`;
    g.fillStyle = '#ffd6ec';
    g.fillText(bn.sub, 0, 22, (W - 20) / u);
    g.restore();
    g.globalAlpha = 1;
  }

  // ================= Bàn phím / cảm ứng =================
  private static readonly GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Shift', 'x', 'X', 'z', 'Z']);

  private readonly onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (this.state === 'playing' || this.state === 'paused') {
      if (DanmakuGame.GAME_KEYS.has(e.key) || 'wasd'.includes(k)) e.preventDefault();
      if (k === 'escape' || k === 'p' || e.key === 'Escape') return this.state === 'playing' ? this.pause() : this.resume();
      if (k === 'x' && !e.repeat) this.bomb();
    }
    this.keys.add(k);
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  };

  private readonly onBlur = () => {
    this.keys.clear();
    this.pause();
  };

  private readonly onVisibility = () => {
    if (document.hidden) this.pause();
  };

  private readonly onPointerDown = (e: PointerEvent) => {
    if (this.state !== 'playing' || e.pointerType === 'mouse') return;
    this.touchId = e.pointerId;
    this.touchLast = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== this.touchId || this.state !== 'playing') return;
    const rect = this.canvas.getBoundingClientRect();
    const k = W / rect.width;
    const p = this.player;
    // Kéo tương đối: ngón tay không che bé thú bông.
    p.x = Math.max(12, Math.min(W - 12, p.x + (e.clientX - this.touchLast.x) * k * 1.25));
    p.y = Math.max(20, Math.min(H - 16, p.y + (e.clientY - this.touchLast.y) * k * 1.25));
    this.touchLast = { x: e.clientX, y: e.clientY };
  };

  private readonly onPointerUp = (e: PointerEvent) => {
    if (e.pointerId === this.touchId) this.touchId = null;
  };
}

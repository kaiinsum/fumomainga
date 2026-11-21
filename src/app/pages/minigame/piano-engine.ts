/**
 * Anime Piano Tiles - engine vẽ canvas.
 * Thời gian lấy từ trình phát YouTube (time()), nên ô nhạc luôn khớp với bài đang phát (kể cả khi video bị khựng / buffer).
 * Ô được sinh theo nhịp (BPM) và "chữ ký" riêng của từng bài (mã video) → cùng bài, cùng độ khó luôn ra cùng một bản nhạc ô.
 */

export const W = 400;
export const H = 640;
export const LANES = 4;
const HIT_Y = H - 110;
export const KEYS = ['d', 'f', 'j', 'k'];

export type PianoState = 'title' | 'playing' | 'paused' | 'over' | 'clear' | 'record';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Judge = 'perfect' | 'great' | 'good' | 'miss';

export interface Note {
  t: number;
  lane: number;
  hit?: Judge;
  /** Thời điểm bị chấm (để vẽ hiệu ứng tan). */
  at?: number;
}

export interface PianoResult {
  score: number;
  maxCombo: number;
  perfect: number;
  great: number;
  good: number;
  miss: number;
  total: number;
  cleared: boolean;
  newBest: boolean;
  /** % chính xác. */
  acc: number;
  /** Lệch trung bình khi gõ trúng (ms): dương = hay gõ trễ, âm = hay gõ sớm. */
  avgErr: number;
  /** Số lần gõ trúng dùng để tính lệch. */
  errN: number;
}

const LANE_COLORS = ['#ff7ac6', '#7af0ff', '#ffe066', '#b18cff'];

/** Số ngẫu nhiên cố định theo chuỗi. */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/**
 * Sinh bản nhạc ô theo nhịp: mỗi phách 1 ô, chia câu 8 phách (có phách nghỉ, đoạn chạy nốt móc đơn, nốt đôi ở độ khó cao).
 * Ô không lặp lại cùng làn liên tiếp quá 2 lần để tay không bị mỏi.
 * `phase` = thời điểm một phách mạnh thật của bài (đo bằng cách gõ theo nhạc) → mọi ô rơi đúng phách;
 * `offset` = ô bắt đầu từ giây này (bỏ qua đoạn dạo đầu).
 */
export function makeChart(videoId: string, bpm: number, offset: number, duration: number, diff: Difficulty, phase = offset): Note[] {
  const rnd = seeded(`${videoId}|${bpm}|${diff}`);
  const beat = 60 / bpm;
  // Phách đầu tiên (thuộc lưới phách của bài) không sớm hơn thời điểm bắt đầu; câu 8 phách tính từ phách gốc.
  const k0 = Math.ceil((offset - phase) / beat - 1e-6);
  const first = phase + k0 * beat;
  const bar0 = ((k0 % 8) + 8) % 8;
  const eighth = diff === 'easy' ? 0.05 : diff === 'normal' ? 0.28 : 0.55;
  const doubles = diff === 'hard' ? 0.14 : diff === 'normal' ? 0.04 : 0;
  const rest = diff === 'easy' ? 0.22 : 0.1;
  const notes: Note[] = [];
  const end = Math.max(offset + 8, duration - 2.5);
  let last = -1;
  let same = 0;
  const pickLane = (avoid = -1) => {
    let l = Math.floor(rnd() * LANES);
    for (let k = 0; k < 6 && (l === avoid || (l === last && same >= 1)); k++) l = Math.floor(rnd() * LANES);
    same = l === last ? same + 1 : 0;
    last = l;
    return l;
  };
  // Mỗi câu 8 phách có "kiểu" riêng: đi lên, đi xuống, nhảy, ngẫu nhiên.
  let pattern = Math.floor(rnd() * 4);
  for (let j = 0, t = first; t < end; j++, t = first + j * beat) {
    const i = j + bar0;
    if (i % 8 === 0) pattern = Math.floor(rnd() * 4);
    // Phách cuối câu hay nghỉ cho dễ thở.
    if (rnd() < rest * (i % 8 === 7 ? 2.5 : 1)) continue;
    let lane: number;
    if (pattern === 0) lane = i % LANES;
    else if (pattern === 1) lane = LANES - 1 - (i % LANES);
    else if (pattern === 2) lane = i % 2 ? pickLane() : (last + 2) % LANES;
    else lane = pickLane();
    last = lane;
    notes.push({ t, lane });
    if (rnd() < doubles) notes.push({ t, lane: (lane + 1 + Math.floor(rnd() * (LANES - 1))) % LANES });
    if (rnd() < eighth && t + beat / 2 < end) notes.push({ t: t + beat / 2, lane: pickLane(lane) });
  }
  return notes.sort((a, b) => a.t - b.t);
}

/**
 * Bản nhạc ô từ nhịp người chơi tự ghi. Dễ: bỏ bớt ô sát nhau; Khó: giữ nguyên;
 * Thường: bỏ ô cách nhau quá sát (< 0.12s cùng làn).
 */
export function chartFromRecord(rec: Note[], diff: Difficulty): Note[] {
  const gap = diff === 'easy' ? 0.32 : diff === 'normal' ? 0.12 : 0;
  const out: Note[] = [];
  const lastAt = [-9, -9, -9, -9];
  let prev = -9;
  for (const n of [...rec].sort((a, b) => a.t - b.t)) {
    if (diff === 'easy' && n.t - prev < gap) continue;
    if (n.t - lastAt[n.lane] < Math.max(gap, 0.08)) continue;
    out.push({ t: n.t, lane: n.lane });
    lastAt[n.lane] = n.t;
    prev = n.t;
  }
  return out;
}

export class PianoGame {
  private readonly ctx: CanvasRenderingContext2D;
  private raf = 0;
  state: PianoState = 'title';
  notes: Note[] = [];
  /** Thông số admin chỉnh. */
  params: Record<string, number> = {};
  /** Thời gian bài hát (giây) - trang game nối vào trình phát YouTube. */
  time: () => number = () => 0;
  duration = 0;
  diff: Difficulty = 'normal';

  score = 0;
  combo = 0;
  maxCombo = 0;
  perfectStreak = 0;
  counts = { perfect: 0, great: 0, good: 0, miss: 0 };
  hp = 10;
  private maxHp = 10;
  private next = 0;
  private flashes: { lane: number; at: number; judge: Judge }[] = [];
  private judgeText: { text: string; color: string; at: number } | null = null;
  private pressed = [0, 0, 0, 0];
  private petals = Array.from({ length: 18 }, (_, i) => ({ x: (i * 97) % W, y: (i * 131) % H, s: 4 + (i % 4) * 2, v: 18 + (i % 5) * 9, r: i }));
  private lastFrame = 0;
  private bestKey = 'fumo.piano.best';
  private errSum = 0;
  private errN = 0;
  /** Nhịp đang ghi (chế độ tự soạn nhịp). */
  recorded: Note[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onState: (s: PianoState, r?: PianoResult) => void,
    /** Fumo khen: combo / perfect liên tiếp. */
    private readonly onCheer: (kind: 'combo' | 'perfect', n: number) => void,
  ) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas.addEventListener('pointerdown', this.onPointer);
    addEventListener('keydown', this.onKey);
    this.draw(0);
  }

  get bestScore(): number {
    try {
      return Number(localStorage.getItem(this.bestKey)) || 0;
    } catch {
      return 0;
    }
  }

  private p(k: string, d: number): number {
    const v = this.params[k];
    return Number.isFinite(v) ? v : d;
  }

  /** Thời gian ô rơi từ trên xuống vạch (giây). */
  private get lead(): number {
    const base = this.diff === 'easy' ? 1.9 : this.diff === 'normal' ? 1.45 : 1.1;
    return base / (this.p('speed', 100) / 100);
  }

  start(notes: Note[], duration: number, diff: Difficulty): void {
    this.notes = notes.map((n) => ({ ...n }));
    this.duration = duration;
    this.diff = diff;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.perfectStreak = 0;
    this.counts = { perfect: 0, great: 0, good: 0, miss: 0 };
    this.maxHp = this.hp = Math.round(this.p('lives', 10));
    this.next = 0;
    this.errSum = 0;
    this.errN = 0;
    this.flashes = [];
    this.judgeText = null;
    this.state = 'playing';
    this.onState('playing');
    this.loop();
  }

  /** Chế độ tự ghi nhịp: nhạc chạy, người chơi gõ D F J K / chạm làn theo nhạc → mỗi lần gõ thành một ô. */
  startRecord(duration: number): void {
    this.recorded = [];
    this.notes = [];
    this.duration = duration;
    this.score = 0;
    this.combo = 0;
    this.flashes = [];
    this.judgeText = null;
    this.state = 'record';
    this.onState('record');
    this.loop();
  }

  /** Dừng ghi, trả về các ô đã ghi. */
  stopRecord(): Note[] {
    if (this.state !== 'record') return [];
    this.state = 'title';
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    return this.recorded.map((n) => ({ t: n.t, lane: n.lane }));
  }

  pause(): void {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.onState('paused');
    }
  }

  resume(): void {
    if (this.state === 'paused') {
      this.state = 'playing';
      this.onState('playing');
      this.loop();
    }
  }

  /** Bài hát kết thúc. */
  finish(): void {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    // Ô còn lại chưa chấm → tính trượt.
    for (const n of this.notes) if (!n.hit) this.judge(n, 'miss', this.time(), false);
    this.end(true);
  }

  private end(cleared: boolean): void {
    this.state = cleared ? 'clear' : 'over';
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    const best = this.bestScore;
    const newBest = this.score > best;
    if (newBest) {
      try {
        localStorage.setItem(this.bestKey, String(this.score));
      } catch {
        /* bỏ qua */
      }
    }
    const total = this.notes.length;
    const c = this.counts;
    const acc = total ? Math.round(((c.perfect + c.great * 0.7 + c.good * 0.4) / total) * 1000) / 10 : 0;
    const avgErr = this.errN ? Math.round((this.errSum / this.errN) * 1000) : 0;
    this.draw(this.time());
    this.onState(this.state, { score: this.score, maxCombo: this.maxCombo, ...c, total, cleared, newBest, acc, avgErr, errN: this.errN });
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointerdown', this.onPointer);
    removeEventListener('keydown', this.onKey);
  }

  // ---------- Điều khiển ----------
  private readonly onPointer = (e: PointerEvent) => {
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    const lane = Math.floor(((e.clientX - r.left) / r.width) * LANES);
    this.tap(Math.max(0, Math.min(LANES - 1, lane)));
  };

  private readonly onKey = (e: KeyboardEvent) => {
    if (e.repeat || (e.target as HTMLElement)?.closest?.('input, textarea')) return;
    const lane = KEYS.indexOf(e.key.toLowerCase());
    if (lane >= 0 && (this.state === 'playing' || this.state === 'record')) {
      e.preventDefault();
      this.tap(lane);
    }
  };

  private tap(lane: number): void {
    if (this.state === 'record') {
      const t = this.time();
      this.pressed[lane] = performance.now();
      if (t >= 0) {
        this.recorded.push({ t, lane, at: performance.now() });
        this.flashes.push({ lane, at: performance.now(), judge: 'perfect' });
      }
      return;
    }
    if (this.state !== 'playing') return;
    const t = this.time();
    this.pressed[lane] = performance.now();
    const good = 0.18;
    // Ô gần nhất chưa chấm trong làn này.
    let best: Note | null = null;
    for (let i = this.next; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t - t > good) break;
      if (n.hit || n.lane !== lane) continue;
      if (Math.abs(n.t - t) <= good && (!best || Math.abs(n.t - t) < Math.abs(best.t - t))) best = n;
    }
    if (!best) {
      // Gõ hụt (không có ô) → mất combo.
      this.combo = 0;
      this.perfectStreak = 0;
      this.judgeText = { text: 'Hụt', color: '#9aa4b2', at: performance.now() };
      return;
    }
    const d = Math.abs(best.t - t);
    // Ghi lại lệch sớm / trễ để gợi ý tự căn nhịp cho riêng người chơi.
    this.errSum += t - best.t;
    this.errN++;
    const pw = this.p('window', 60) / 1000;
    this.judge(best, d <= pw ? 'perfect' : d <= pw * 2 ? 'great' : 'good', t, true);
  }

  private judge(n: Note, j: Judge, t: number, show: boolean): void {
    n.hit = j;
    n.at = performance.now();
    this.counts[j]++;
    if (j === 'miss') {
      this.combo = 0;
      this.perfectStreak = 0;
      this.hp -= 1;
    } else {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      const mult = 1 + Math.min(3, Math.floor(this.combo / 25) * 0.5);
      this.score += Math.round((j === 'perfect' ? 300 : j === 'great' ? 200 : 100) * mult);
      this.perfectStreak = j === 'perfect' ? this.perfectStreak + 1 : 0;
      const every = Math.round(this.p('cheerEvery', 20));
      if (this.combo % every === 0) this.onCheer('combo', this.combo);
      else if (this.perfectStreak > 0 && this.perfectStreak % 10 === 0) this.onCheer('perfect', this.perfectStreak);
    }
    if (show || j === 'miss') {
      const meta = { perfect: ['PERFECT!', '#ffe066'], great: ['GREAT', '#7af0ff'], good: ['GOOD', '#9be7c4'], miss: ['MISS', '#ff5a6e'] }[j];
      this.judgeText = { text: meta[0], color: meta[1], at: performance.now() };
      this.flashes.push({ lane: n.lane, at: performance.now(), judge: j });
    }
    void t;
  }

  // ---------- Vòng lặp ----------
  private loop(): void {
    if (this.raf) return;
    const step = (now: number) => {
      this.raf = 0;
      if (this.state === 'record') {
        this.drawRecord(this.time(), now);
        this.raf = requestAnimationFrame(step);
        return;
      }
      if (this.state !== 'playing') return;
      const t = this.time();
      // Ô đã qua vạch quá lâu → trượt.
      while (this.next < this.notes.length) {
        const n = this.notes[this.next];
        if (n.hit) {
          this.next++;
          continue;
        }
        if (t - n.t > 0.18) {
          this.judge(n, 'miss', t, false);
          this.next++;
          if (this.hp <= 0) return this.end(false);
          continue;
        }
        break;
      }
      this.draw(t, now);
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  // ---------- Vẽ ----------
  draw(t: number, now = performance.now()): void {
    const x = this.ctx;
    const dt = this.lastFrame ? Math.min(0.05, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    const lw = W / LANES;

    // Nền: trời đêm anime + hoa anh đào rơi
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1b0b3a');
    g.addColorStop(0.55, '#3d1f6e');
    g.addColorStop(1, '#ff7ac6');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(255, 190, 220, .55)';
    for (const p of this.petals) {
      p.y += p.v * dt;
      p.x += Math.sin((now / 1000 + p.r) * 1.3) * 12 * dt;
      if (p.y > H + 10) {
        p.y = -10;
        p.x = Math.random() * W;
      }
      x.beginPath();
      x.ellipse(p.x, p.y, p.s, p.s * 0.6, p.r + now / 900, 0, Math.PI * 2);
      x.fill();
    }

    // Làn + phím vừa bấm sáng lên
    for (let i = 0; i < LANES; i++) {
      const since = now - this.pressed[i];
      if (since < 160) {
        const lg = x.createLinearGradient(0, 0, 0, HIT_Y);
        lg.addColorStop(0, 'transparent');
        lg.addColorStop(1, LANE_COLORS[i] + '55');
        x.fillStyle = lg;
        x.fillRect(i * lw, 0, lw, HIT_Y);
      }
      x.fillStyle = 'rgba(255,255,255,.12)';
      if (i) x.fillRect(i * lw - 0.5, 0, 1, H);
    }

    // Vạch chấm
    x.save();
    x.shadowColor = '#fff';
    x.shadowBlur = 12;
    x.fillStyle = 'rgba(255,255,255,.85)';
    x.fillRect(0, HIT_Y - 1.5, W, 3);
    x.restore();

    // Ô nhạc
    const lead = this.lead;
    const pxPerSec = HIT_Y / lead;
    const tileH = 74;
    for (let i = this.next > 3 ? this.next - 3 : 0; i < this.notes.length; i++) {
      const n = this.notes[i];
      const dtn = n.t - t;
      if (dtn > lead + 0.3) break;
      const y = HIT_Y - dtn * pxPerSec;
      const col = LANE_COLORS[n.lane];
      if (n.hit && n.hit !== 'miss') {
        // Bấm trúng: ô tan ra
        const k = Math.min(1, (now - (n.at ?? now)) / 220);
        if (k >= 1) continue;
        x.globalAlpha = 1 - k;
        x.fillStyle = col;
        const grow = 1 + k * 0.4;
        x.fillRect(n.lane * lw + lw * (1 - grow) / 2 + 4, HIT_Y - tileH / 2 * grow, lw * grow - 8, tileH * grow);
        x.globalAlpha = 1;
        continue;
      }
      x.save();
      if (n.hit === 'miss') x.globalAlpha = 0.35;
      const tx = n.lane * lw + 5;
      const ty = y - tileH;
      const tg = x.createLinearGradient(0, ty, 0, ty + tileH);
      tg.addColorStop(0, '#16121f');
      tg.addColorStop(1, '#2e2840');
      x.fillStyle = tg;
      x.shadowColor = col;
      x.shadowBlur = 12;
      this.round(tx, ty, lw - 10, tileH, 10);
      x.fill();
      x.shadowBlur = 0;
      x.strokeStyle = col;
      x.lineWidth = 2.5;
      x.stroke();
      // nốt nhạc nhỏ trên ô
      x.fillStyle = col;
      x.font = '700 20px system-ui, sans-serif';
      x.textAlign = 'center';
      x.fillText('♪', tx + (lw - 10) / 2, ty + tileH / 2 + 7);
      x.restore();
    }

    // Vòng sáng ở vạch khi chấm
    this.flashes = this.flashes.filter((f) => now - f.at < 300);
    for (const f of this.flashes) {
      const k = (now - f.at) / 300;
      x.strokeStyle = f.judge === 'miss' ? '#ff5a6e' : LANE_COLORS[f.lane];
      x.globalAlpha = 1 - k;
      x.lineWidth = 3;
      x.beginPath();
      x.arc(f.lane * lw + lw / 2, HIT_Y, 16 + k * 34, 0, Math.PI * 2);
      x.stroke();
      x.globalAlpha = 1;
    }

    // Phím (D F J K)
    for (let i = 0; i < LANES; i++) {
      const on = now - this.pressed[i] < 120;
      x.fillStyle = on ? LANE_COLORS[i] : 'rgba(255,255,255,.14)';
      this.round(i * lw + 8, HIT_Y + 18, lw - 16, 46, 12);
      x.fill();
      x.fillStyle = on ? '#1b0b3a' : 'rgba(255,255,255,.75)';
      x.font = '800 18px system-ui, sans-serif';
      x.textAlign = 'center';
      x.fillText(KEYS[i].toUpperCase(), i * lw + lw / 2, HIT_Y + 48);
    }

    // Chữ chấm điểm
    if (this.judgeText && now - this.judgeText.at < 500) {
      const k = (now - this.judgeText.at) / 500;
      x.save();
      x.globalAlpha = 1 - k * k;
      x.fillStyle = this.judgeText.color;
      x.shadowColor = this.judgeText.color;
      x.shadowBlur = 14;
      x.font = `900 italic ${34 + (1 - k) * 8}px system-ui, sans-serif`;
      x.textAlign = 'center';
      x.fillText(this.judgeText.text, W / 2, HIT_Y - 150 - k * 20);
      x.restore();
    }

    // HUD: điểm, combo, máu, tiến độ bài
    x.fillStyle = '#fff';
    x.textAlign = 'left';
    x.font = '800 20px system-ui, sans-serif';
    x.fillText(this.score.toLocaleString('vi-VN'), 12, 30);
    if (this.combo >= 5) {
      x.textAlign = 'center';
      x.font = '900 46px system-ui, sans-serif';
      x.fillStyle = 'rgba(255,255,255,.9)';
      x.fillText(String(this.combo), W / 2, 120);
      x.font = '800 14px system-ui, sans-serif';
      x.fillText('COMBO', W / 2, 140);
    }
    const hpW = 110;
    x.fillStyle = 'rgba(255,255,255,.2)';
    this.round(W - hpW - 12, 16, hpW, 12, 6);
    x.fill();
    x.fillStyle = this.hp / this.maxHp > 0.3 ? '#7dffb0' : '#ff5a6e';
    this.round(W - hpW - 12, 16, Math.max(0, (hpW * this.hp) / this.maxHp), 12, 6);
    x.fill();
    if (this.duration > 0) {
      x.fillStyle = 'rgba(255,255,255,.25)';
      x.fillRect(0, 0, W, 4);
      x.fillStyle = '#ffe066';
      x.fillRect(0, 0, W * Math.min(1, Math.max(0, t / this.duration)), 4);
    }
  }

  /** Màn hình khi đang tự ghi nhịp: ô vừa gõ bay ngược lên trên. */
  private drawRecord(t: number, now: number): void {
    const saved = { notes: this.notes, combo: this.combo, score: this.score };
    // Vẽ nền / làn / phím bằng hàm vẽ chung (không có ô rơi).
    this.notes = [];
    this.combo = 0;
    this.draw(t, now);
    this.notes = saved.notes;
    const x = this.ctx;
    const lw = W / LANES;
    for (let i = this.recorded.length - 1; i >= 0; i--) {
      const n = this.recorded[i];
      const age = (now - (n.at ?? now)) / 1000;
      if (age > 1.6) break;
      const y = HIT_Y - age * 380;
      x.globalAlpha = Math.max(0, 1 - age / 1.6);
      x.fillStyle = LANE_COLORS[n.lane];
      this.round(n.lane * lw + 8, y - 30, lw - 16, 30, 8);
      x.fill();
      x.globalAlpha = 1;
    }
    x.save();
    x.fillStyle = '#ff5a6e';
    x.beginPath();
    x.arc(22, 58, 7 + Math.sin(now / 200) * 1.5, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#fff';
    x.textAlign = 'left';
    x.font = '800 15px system-ui, sans-serif';
    x.fillText(`ĐANG GHI NHỊP · ${this.recorded.length} ô`, 36, 63);
    x.font = '600 13px system-ui, sans-serif';
    x.fillStyle = 'rgba(255,255,255,.8)';
    x.textAlign = 'center';
    x.fillText('Gõ D F J K (hoặc chạm làn) theo nhạc', W / 2, 180);
    x.restore();
  }

  private round(x0: number, y0: number, w: number, h: number, r: number): void {
    const x = this.ctx;
    x.beginPath();
    x.roundRect(x0, y0, w, h, r);
  }
}

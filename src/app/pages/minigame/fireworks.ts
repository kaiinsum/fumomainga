/**
 * Pháo hoa toàn màn hình trên canvas: bắn vài quả từ dưới lên, nổ thành chùm tia nhiều màu.
 * Gọi start() → trả về hàm dừng. onDone chạy khi màn pháo hoa kết thúc.
 */
interface Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetY: number;
  hue: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  hue: number;
  size: number;
}

export function startFireworks(canvas: HTMLCanvasElement, durationMs: number, onDone: () => void): () => void {
  const ctx = canvas.getContext('2d')!;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = (canvas.width = Math.round(innerWidth * dpr));
  const h = (canvas.height = Math.round(innerHeight * dpr));
  const rockets: Rocket[] = [];
  const sparks: Spark[] = [];
  const hues = [330, 280, 200, 45, 160, 10];
  const start = performance.now();
  let lastLaunch = -1000;
  let raf = 0;
  let stopped = false;

  const launch = () => {
    rockets.push({
      x: w * (0.15 + Math.random() * 0.7),
      y: h + 10,
      vx: (Math.random() - 0.5) * 2 * dpr,
      vy: -(h / 55) * (0.9 + Math.random() * 0.25),
      targetY: h * (0.15 + Math.random() * 0.35),
      hue: hues[Math.floor(Math.random() * hues.length)],
    });
  };

  const explode = (r: Rocket) => {
    const n = 70 + Math.floor(Math.random() * 40);
    const power = (2.5 + Math.random() * 2.5) * dpr;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.1;
      const s = power * (0.4 + Math.random() * 0.8);
      sparks.push({
        x: r.x,
        y: r.y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0,
        max: 55 + Math.random() * 35,
        hue: Math.random() < 0.2 ? r.hue + 40 : r.hue,
        size: (1.5 + Math.random() * 1.8) * dpr,
      });
    }
  };

  const frame = (now: number) => {
    if (stopped) return;
    const t = now - start;
    // Lớp nền mờ dần tạo vệt đuôi.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    if (t < durationMs - 900 && now - lastLaunch > 230) {
      launch();
      if (Math.random() < 0.5) launch();
      lastLaunch = now;
    }

    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.x += r.vx;
      r.y += r.vy;
      r.vy *= 0.985;
      ctx.fillStyle = `hsl(${r.hue}, 100%, 75%)`;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 2.4 * dpr, 0, Math.PI * 2);
      ctx.fill();
      if (r.y <= r.targetY || r.vy > -1) {
        explode(r);
        rockets.splice(i, 1);
      }
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vx *= 0.97;
      s.vy = s.vy * 0.97 + 0.05 * dpr;
      s.life++;
      const k = 1 - s.life / s.max;
      if (k <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      ctx.fillStyle = `hsla(${s.hue}, 100%, ${55 + 25 * k}%, ${k})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * (0.6 + k * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }

    if (t > durationMs && !sparks.length && !rockets.length) {
      stop();
      onDone();
      return;
    }
    if (t > durationMs + 1500) {
      stop();
      onDone();
      return;
    }
    raf = requestAnimationFrame(frame);
  };

  const stop = () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };

  raf = requestAnimationFrame(frame);
  return stop;
}

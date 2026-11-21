import { Component, ElementRef, computed, effect, inject, untracked, viewChild } from '@angular/core';
import { GuideService, guideStage } from './guide.service';

/**
 * Người hướng dẫn (Cirno ở giao diện sáng / Reimu ở giao diện tối) bay từ ảnh nền ra phía trước rồi nói chuyện.
 * Nội dung & thời gian chỉnh trong Admin → Marketing & tương tác → Người hướng dẫn.
 */
@Component({
  selector: 'app-guide',
  template: `
    @let st = guide.step();
    @if (st === 'intro') {
      <div class="veil" (click)="toCorner()" aria-hidden="true"></div>
    }
    @if (summonShown()) {
      <button class="summon" [class.dark]="guide.dark()" type="button" (click)="guide.summon()" [title]="'Gọi ' + guide.name()" [attr.aria-label]="'Gọi người hướng dẫn ' + guide.name()">
        <img [src]="guide.image()" alt="" draggable="false" /><i aria-hidden="true">✦</i>
      </button>
    }
    @if (st !== 'hidden') {
      <div #box class="guide" [class.hub]="st === 'hub'" [class.intro]="st === 'intro'" [class.flying]="st === 'fly'" [class.dark]="guide.dark()" role="dialog" [attr.aria-label]="guide.name() + ' nói'">
        <img #fig class="fig" [src]="guide.image()" [alt]="guide.name()" draggable="false" />
        <div class="bubble" aria-live="polite">
          <button class="x" type="button" (click)="close()" aria-label="Đóng">✕</button>
          <b class="nm">{{ guide.name() }}</b>
          <p>{{ text() }}</p>
          @switch (st) {
            @case ('ask') {
              <div class="acts">
                <button class="b yes" type="button" (click)="guide.answer(true)">{{ guide.cfg().yesLabel }}</button>
                <button class="b no" type="button" (click)="guide.answer(false)">{{ guide.cfg().noLabel }}</button>
              </div>
            }
            @case ('yes') {
              <div class="acts"><button class="b yes" type="button" (click)="go()">{{ guide.cfg().okLabel }}</button></div>
            }
            @case ('no') {
              <div class="acts"><button class="b no" type="button" (click)="close()">Ừm!</button></div>
            }
            @case ('perf') {
              <div class="acts">
                <button class="b yes" type="button" (click)="guide.answerPerf(true)">⚡ Có, bật lên!</button>
                <button class="b no" type="button" (click)="guide.answerPerf(false)">Không, giữ nhẹ</button>
              </div>
            }
            @case ('perfOff') {
              <div class="acts">
                <button class="b yes" type="button" (click)="guide.answerPerfOff(true)">🍃 Có, tắt đi</button>
                <button class="b no" type="button" (click)="guide.answerPerfOff(false)">Không</button>
              </div>
            }
            @case ('menu') {
              <div class="acts col">
                <button class="b yes" type="button" (click)="guide.menuPick('play')">🎮 Chơi minigame</button>
                <button class="b no" type="button" (click)="guide.menuPick('perf')">{{ guide.lite() ? '⚡ Bật cấu hình cao' : '🍃 Tắt cấu hình cao (chế độ nhẹ)' }}</button>
                <button class="b no" type="button" (click)="close()">Không có gì, tạm biệt!</button>
              </div>
            }
            @case ('slash') {
              <div class="acts">
                <button class="b yes" type="button" (click)="guide.answerNinja(true)">🗡️ Chơi luôn!</button>
                <button class="b no" type="button" (click)="guide.answerNinja(false)">Để sau</button>
              </div>
            }
            @case ('intro') {
              <div class="acts"><button class="b yes" type="button" (click)="toCorner()">Bắt đầu chọn game ›</button></div>
            }
          }
        </div>
      </div>
    }
  `,
  styles: `
    .guide { position: fixed; left: 14px; bottom: 14px; z-index: 990; display: flex; align-items: flex-end; gap: 0; pointer-events: none;
      max-width: min(520px, calc(100vw - 28px)); }
    .fig { height: 230px; width: auto; flex: none; pointer-events: auto; transform-origin: 0 0;
      filter: drop-shadow(0 10px 18px rgba(0, 0, 0, .25)); animation: bob 3s ease-in-out 1s infinite; user-select: none; }
    .bubble { position: relative; pointer-events: auto; margin: 0 0 120px -18px; padding: 14px 16px 14px; border-radius: 18px;
      background: var(--surface); color: var(--text); border: 2px solid var(--primary); min-width: 200px; max-width: 300px;
      box-shadow: 0 14px 34px -10px color-mix(in srgb, var(--primary) 55%, transparent);
      animation: pop .45s cubic-bezier(.2, 1.4, .4, 1) .75s both; }
    /* Đuôi bong bóng chỉ về nhân vật */
    .bubble::before { content: ''; position: absolute; left: -11px; bottom: 22px; width: 18px; height: 18px; background: var(--surface);
      border-left: 2px solid var(--primary); border-bottom: 2px solid var(--primary); transform: rotate(45deg); }
    .nm { display: block; font-size: .78rem; color: var(--primary-dark); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 2px; }
    p { margin: 0; font-weight: 700; line-height: 1.45; font-size: .95rem; }
    .x { position: absolute; top: 6px; right: 8px; border: 0; background: none; color: var(--muted); cursor: pointer; font-size: .85rem; padding: 2px 4px; }
    .acts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .acts.col { flex-direction: column; align-items: stretch; }
    .acts.col .b { text-align: left; }
    /* Nút triệu hồi bên trái */
    .summon { position: fixed; left: 14px; bottom: calc(18px + env(safe-area-inset-bottom, 0px)); z-index: 985; width: 54px; height: 54px; padding: 0; border-radius: 50%; cursor: pointer;
      border: 2px solid var(--primary); background: var(--surface); overflow: visible; box-shadow: 0 8px 20px -6px color-mix(in srgb, var(--primary) 70%, transparent);
      animation: summon-in .5s cubic-bezier(.2, 1.4, .4, 1) both; }
    .summon img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 12%; border-radius: 50%; display: block; pointer-events: none; }
    .summon i { position: absolute; right: -4px; top: -4px; font-style: normal; font-size: .8rem; color: #ffd23f; text-shadow: 0 0 6px #ffd23f;
      animation: twinkle 1.6s ease-in-out infinite; }
    .summon:hover { transform: translateY(-2px) scale(1.05); }
    .summon.dark { border-color: #ff2d55; background: #0b0f14; box-shadow: 0 0 16px rgba(255, 45, 85, .45); }
    @keyframes summon-in { from { opacity: 0; transform: scale(.4); } }
    @keyframes twinkle { 50% { opacity: .35; transform: scale(.75); } }
    .b { font: inherit; font-weight: 800; font-size: .88rem; padding: 8px 14px; border-radius: 999px; cursor: pointer; border: 2px solid var(--primary); }
    .b.yes { background: var(--primary); color: var(--on-primary); }
    .b.no { background: var(--surface); color: var(--primary-dark); }
    .b:hover { transform: translateY(-1px); }
    /* Giao diện tối: viền neon */
    .guide.dark .bubble { background: color-mix(in srgb, #ff2d55 6%, #0b0f14); border-color: #ff2d55;
      box-shadow: 0 0 22px rgba(255, 45, 85, .45); }
    .guide.dark .bubble::before { background: color-mix(in srgb, #ff2d55 6%, #0b0f14); border-color: #ff2d55; }
    /* Đang bay vòng dẫn đường: ẩn bong bóng */
    .guide.flying .bubble { display: none; }
    .guide.flying .fig { animation: none; }
    /* Vừa tới trang Mini game: đứng giữa màn hình giới thiệu */
    .veil { position: fixed; inset: 0; z-index: 989; background: rgba(10, 14, 30, .35); backdrop-filter: blur(2px); animation: veil .4s ease both; }
    .guide.intro { left: 50%; bottom: 50%; transform: translate(-50%, 50%); max-width: min(720px, calc(100vw - 24px)); align-items: center; }
    .guide.intro .fig { height: min(340px, 46vh); }
    .guide.intro .bubble { margin: 0 0 0 -24px; max-width: 340px; animation-delay: .1s; }
    .guide.intro .bubble p { font-size: 1.05rem; }
    @keyframes veil { from { opacity: 0; } }
    /* Trang Mini game: nhỏ gọn hơn */
    .guide.hub .fig { height: 170px; }
    .guide.hub .bubble { margin-bottom: 80px; }
    @keyframes pop { from { opacity: 0; transform: scale(.6) translateY(14px); } to { opacity: 1; transform: none; } }
    @keyframes bob { 50% { translate: 0 -6px; } }
    @media (max-width: 600px) {
      .summon { left: 10px; bottom: calc(14px + env(safe-area-inset-bottom, 0px)); width: 46px; height: 46px; }
      .guide { left: 6px; bottom: calc(6px + env(safe-area-inset-bottom, 0px)); }
      .fig { height: 150px; }
      .guide.hub .fig { height: 110px; }
      .bubble { margin: 0 0 70px -14px; min-width: 0; max-width: calc(100vw - 130px); padding: 11px 12px; }
      .guide.hub .bubble { margin-bottom: 50px; }
      .guide.intro { flex-direction: column; align-items: center; }
      .guide.intro .fig { height: min(220px, 34vh); order: 2; }
      .guide.intro .bubble { margin: 0 0 -6px; max-width: calc(100vw - 40px); order: 1; }
      .guide.intro .bubble::before { left: 50%; bottom: -11px; transform: translateX(-50%) rotate(-45deg); }
      p { font-size: .84rem; }
      .b { font-size: .8rem; padding: 6px 11px; }
    }
    @media (prefers-reduced-motion: reduce) { .fig, .bubble { animation: none; } }
  `,
})
export class GuideComponent {
  readonly guide = inject(GuideService);
  private readonly fig = viewChild<ElementRef<HTMLImageElement>>('fig');
  private readonly box = viewChild<ElementRef<HTMLElement>>('box');
  private introTimer?: ReturnType<typeof setTimeout>;
  private shown = false;

  /** Đang ở màn chơi game → không hiện nút triệu hồi (tránh che nút điều khiển). */
  readonly inGame = computed(() => /^\/mini-game\/./.test(this.guide.route()));
  /** Nút triệu hồi đang hiện? (thông báo góc trái né ra) */
  readonly summonShown = computed(() => this.guide.step() === 'hidden' && this.guide.cfg().enabled && this.guide.cfg().summonEnabled && !this.inGame());

  readonly text = computed(() => {
    const c = this.guide.cfg();
    switch (this.guide.step()) {
      case 'ask':
        return c.askText;
      case 'yes':
        return c.yesReply;
      case 'no':
        return c.noReply;
      case 'hub':
        return this.guide.hubLine() || c.hubWelcome;
      case 'intro':
        return c.hubIntro;
      case 'slash':
        return c.slashAsk;
      case 'perf':
        return c.perfAsk;
      case 'perfOff':
        return c.perfOffAsk;
      case 'menu':
        return c.menuText;
      case 'say':
        return this.guide.sayText();
      default:
        return '';
    }
  });

  constructor() {
    this.guide.start();
    effect(() => document.documentElement.classList.toggle('has-summon', this.summonShown()));
    // Vừa hiện → bay từ chỗ nhân vật trên ảnh nền ra góc màn hình.
    effect(() => {
      const visible = this.guide.step() !== 'hidden';
      const el = this.fig()?.nativeElement;
      untracked(() => {
        if (visible && el && !this.shown) {
          this.shown = true;
          guideStage.out = true;
          this.flyIn(el);
        } else if (!visible && this.shown) {
          this.shown = false;
          guideStage.out = false;
        }
      });
    });
    // Bấm OK → bay 1 vòng quanh màn hình rồi dẫn sang trang Mini game; tới nơi thì giới thiệu, lát sau tự thu về góc.
    effect(() => {
      const st = this.guide.step();
      untracked(() => {
        clearTimeout(this.introTimer);
        if (st === 'fly') requestAnimationFrame(() => this.flyLoop());
        if (st === 'intro') this.introTimer = setTimeout(() => this.guide.step() === 'intro' && this.toCorner(), 7000);
      });
    });
    // Câu "Không" tự ẩn sau vài giây. Trang Mini game trên điện thoại: chào xong tự thu lại để không che thẻ game.
    effect(() => {
      const st = this.guide.step();
      if (st === 'no') setTimeout(() => this.guide.step() === 'no' && this.guide.close(), 5000);
      if (st === 'say') {
        const text = this.guide.sayText();
        setTimeout(() => this.guide.step() === 'say' && this.guide.sayText() === text && this.guide.close(), 5000);
      }
      if (st === 'hub' && innerWidth < 700) setTimeout(() => this.guide.step() === 'hub' && this.guide.step.set('hidden'), 6000);
    });
  }

  private flyIn(el: HTMLImageElement): void {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const run = () => {
      const end = el.getBoundingClientRect();
      if (!end.height) return;
      // Vị trí nhân vật trên ảnh nền (sky-bg báo), không có thì đoán theo bố cục nền.
      const b = guideStage.box ?? { x: innerWidth * 0.1 - end.width * 1.2, y: innerHeight * 0.44 - end.height * 1.2, w: end.width * 2.4, h: end.height * 2.4 };
      const s = b.h / end.height;
      el.animate(
        [
          { transform: `translate(${b.x - end.left}px, ${b.y - end.top}px) scale(${s})`, opacity: 0.18, filter: 'blur(2px) drop-shadow(0 0 0 transparent)' },
          { opacity: 0.7, offset: 0.5 },
          { transform: 'translate(0, 0) scale(1)', opacity: 1, filter: 'blur(0) drop-shadow(0 10px 18px rgba(0,0,0,.25))' },
        ],
        { duration: 900, easing: 'cubic-bezier(.2, .9, .25, 1.15)' },
      );
    };
    if (el.complete) run();
    else el.addEventListener('load', run, { once: true });
  }

  go(): void {
    this.guide.goPlay();
  }

  /** Bay 1 vòng quanh giữa màn hình, kết thúc ở giữa (chỗ sẽ đứng giới thiệu). */
  private flyLoop(): void {
    const el = this.box()?.nativeElement;
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return this.guide.arrive();
    const r = el.getBoundingClientRect();
    // Vị trí hiện tại so với tâm màn hình.
    const sx = r.left + r.width / 2 - innerWidth / 2;
    const sy = r.top + r.height / 2 - innerHeight / 2;
    // Bay theo đường xoắn ốc mượt quanh tâm màn hình: xuất phát đúng chỗ đang đứng, vòng lên trên,
    // lượn hơn một vòng rồi thu dần vào giữa. Tính theo toạ độ chuẩn hoá để vòng bay luôn nằm gọn trong màn hình.
    const ax = Math.max(120, Math.min(innerWidth * 0.36, 460));
    const ay = Math.max(110, Math.min(innerHeight * 0.3, 260));
    const nx = sx / ax;
    const ny = sy / ay;
    const m0 = Math.hypot(nx, ny) || 1;
    const a0 = Math.atan2(ny, nx);
    const smooth = (t: number) => t * t * (3 - 2 * t);
    const easeInOut = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;
    const RING = 0.9;
    const TURNS = 1.2;
    const N = 72;
    const pts: { x: number; y: number }[] = [];
    for (let k = 0; k <= N; k++) {
      const u = k / N;
      // Bán kính: từ chỗ đứng hoà vào vòng tròn, rồi xoáy dần vào tâm.
      const m = u < 0.32 ? m0 + (RING - m0) * smooth(u / 0.32) : RING * (1 - smooth((u - 0.32) / 0.68));
      const a = a0 - easeInOut(u) * Math.PI * 2 * TURNS;
      // Nhấp nhô nhẹ như đang vỗ cánh.
      const bob = Math.sin(u * Math.PI * 7) * 10 * (1 - u);
      pts.push({ x: Math.cos(a) * m * ax, y: Math.sin(a) * m * ay + bob });
    }
    const frames: Keyframe[] = pts.map((p, k) => {
      const u = k / N;
      const prev = pts[Math.max(0, k - 1)];
      const next = pts[Math.min(N, k + 1)];
      // Nghiêng người theo hướng bay (ngang), tắt dần khi tới nơi.
      const tilt = Math.max(-20, Math.min(20, (next.x - prev.x) * 0.55)) * (1 - smooth(Math.max(0, (u - 0.8) / 0.2)));
      const scale = 1 + 0.18 * smooth(u) + Math.sin(u * Math.PI * 4) * 0.04 * (1 - u);
      return { transform: `translate(${p.x - sx}px, ${p.y - sy}px) rotate(${tilt.toFixed(2)}deg) scale(${scale.toFixed(3)})`, offset: u };
    });
    const DURATION = 2400;
    el.style.filter = 'drop-shadow(0 0 14px rgba(255, 230, 140, .85))';
    const anim = el.animate(frames, { duration: DURATION, easing: 'linear', fill: 'forwards' });
    this.sparkleTrail(pts, DURATION);
    anim.onfinish = () => {
      el.style.filter = '';
      this.guide.arrive();
      // Đợi giao diện "giới thiệu" vẽ xong rồi mới bỏ hiệu ứng (tránh nháy về góc).
      requestAnimationFrame(() => requestAnimationFrame(() => anim.cancel()));
    };
  }

  /** Vệt lấp lánh rơi lại phía sau đường bay. */
  private sparkleTrail(pts: { x: number; y: number }[], duration: number): void {
    const layer = document.createElement('div');
    layer.setAttribute('aria-hidden', 'true');
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9998;overflow:hidden';
    document.body.appendChild(layer);
    const colors = ['#ffe066', '#ff9ad5', '#9be7ff', '#fff'];
    const N = pts.length - 1;
    for (let k = 3; k < N - 2; k += 3) {
      const p = pts[k];
      const s = document.createElement('span');
      s.textContent = k % 2 ? '✦' : '✧';
      const size = 10 + ((k * 7) % 9);
      s.style.cssText = `position:absolute;left:${innerWidth / 2 + p.x}px;top:${innerHeight / 2 + p.y}px;font-size:${size}px;color:${colors[k % colors.length]};opacity:0;text-shadow:0 0 6px currentColor;transform:translate(-50%,-50%)`;
      layer.appendChild(s);
      s.animate(
        [
          { opacity: 0, transform: 'translate(-50%,-50%) scale(.3)' },
          { opacity: 1, transform: 'translate(-50%,-50%) scale(1.1)', offset: 0.15 },
          { opacity: 0, transform: `translate(calc(-50% + ${((k * 13) % 21) - 10}px), calc(-50% + 26px)) scale(.4) rotate(90deg)` },
        ],
        { duration: 750, delay: (k / N) * duration, easing: 'ease-out', fill: 'both' },
      );
    }
    setTimeout(() => layer.remove(), duration + 900);
  }

  /** Giới thiệu xong: thu nhỏ và bay xuống góc cũ (FLIP: đo vị trí trước / sau rồi nội suy). */
  toCorner(): void {
    if (this.guide.step() !== 'intro') return;
    clearTimeout(this.introTimer);
    const el = this.fig()?.nativeElement;
    const from = el?.getBoundingClientRect();
    this.guide.settle();
    if (!el || !from || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    requestAnimationFrame(() => {
      const to = el.getBoundingClientRect();
      if (!to.height) return;
      const s = from.height / to.height;
      el.animate(
        [
          { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${s})` },
          { transform: `translate(${(from.left - to.left) * 0.4}px, ${(from.top - to.top) * 0.4 - 60}px) scale(${1 + (s - 1) * 0.4}) rotate(-8deg)`, offset: 0.55 },
          { transform: 'translate(0, 0) scale(1)' },
        ],
        { duration: 850, easing: 'cubic-bezier(.3, .8, .3, 1)' },
      );
    });
  }

  close(): void {
    if (this.guide.step() === 'intro') return this.toCorner();
    this.guide.close();
  }
}

import { PriceTagComponent } from '../../shared/price-tag';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameSuggestComponent } from './game-suggest';
import { SoundToggleComponent } from '../../shared/sound-toggle';
import { Product } from '../../models/product';
import { CartService } from '../../services/cart.service';
import { ProductService } from '../../services/product.service';
import { flyToCart } from '../../shared/fly-to-cart';
import { sfx } from '../../shared/sfx';

type RarityKey = 'common' | 'rare' | 'epic' | 'legendary';

interface Rarity {
  key: RarityKey;
  label: string;
  color: string;
  /** Trọng số mỗi sản phẩm thuộc độ hiếm này (càng thấp càng khó ra). */
  weight: number;
}

const RARITIES: Rarity[] = [
  { key: 'common', label: 'Phổ thông', color: '#4b69ff', weight: 10 },
  { key: 'rare', label: 'Hiếm', color: '#8847ff', weight: 5 },
  { key: 'epic', label: 'Sử thi', color: '#d32ce6', weight: 2.5 },
  { key: 'legendary', label: 'Huyền thoại', color: '#ffb800', weight: 1 },
];

interface PoolItem {
  product: Product;
  rarity: Rarity;
  chance: number;
}

/** Kích thước 1 ô trên dải quay (px) — phải khớp CSS .cell (150px) và .strip gap (8px). */
const CELL = 150;
const GAP = 8;
const STRIP_LEN = 64;
const WIN_INDEX = 54;

@Component({
  selector: 'app-gacha',
  imports: [RouterLink, SoundToggleComponent, PriceTagComponent, GameSuggestComponent],
  template: `
    <div class="container wrap">
      <nav class="crumbs"><a routerLink="/mini-game">← Chọn game khác</a><app-sound-toggle /></nav>
      <header class="head">
        <span class="chip">🎁 Gacha</span>
        <h1>Túi mù <span class="hl">may mắn</span></h1>
        <p class="muted">Bóc một túi mù để xem hôm nay số phận chọn bé nào cho bạn. Chỉ gồm các sản phẩm đang còn hàng.</p>
      </header>

      @if (!pool().length) {
        <div class="empty card-surface">
          <span>📦</span>
          <h2>Tạm thời chưa có sản phẩm còn hàng</h2>
          <a class="btn primary" routerLink="/san-pham">Xem sản phẩm</a>
        </div>
      } @else {
        <section class="machine">
          @if (!strip().length) {
            <button class="bag-btn" type="button" [class.shaking]="opening()" (click)="open()" [disabled]="opening()">
              <span class="ray" aria-hidden="true"></span>
              <span class="bag" aria-hidden="true"><b>?</b></span>
              <span class="label">{{ opening() ? 'Đang bóc...' : 'Bấm để bóc túi' }}</span>
            </button>
          } @else {
            <div class="reel" [class.done]="!!result()">
              <span class="marker" aria-hidden="true"></span>
              <div
                class="strip"
                [style.transform]="'translateX(' + offset() + 'px)'"
                [style.transition]="animating() ? 'transform ' + duration + 'ms cubic-bezier(0.06, 0.55, 0.12, 1)' : 'none'"
                (transitionend)="onStop()"
              >
                @for (it of strip(); track $index; let i = $index) {
                  <div class="cell" [class.win]="result() && i === winIndex" [style.--rc]="it.rarity.color">
                    <img [src]="it.product.images[0]" [alt]="it.product.name" loading="eager" />
                    <span class="name">{{ it.product.name }}</span>
                  </div>
                }
              </div>
            </div>
            @if (!result()) { <p class="spin-hint">🎰 Đang quay...</p> }
          }
        </section>

        @if (result(); as r) {
          <section class="result card-surface" [style.--rc]="r.rarity.color">
            <span class="burst" aria-hidden="true"></span>
            <div class="res-img"><img [src]="r.product.images[0]" [alt]="r.product.name" /></div>
            <div class="res-info">
              <span class="rarity">{{ r.rarity.label }} · {{ (r.chance * 100).toFixed(1) }}%</span>
              <small class="muted">Hôm nay bạn nên mua</small>
              <h2>{{ r.product.name }}</h2>
              <app-price-tag class="price" [product]="r.product" />
              <p class="muted">{{ r.product.description }}</p>
              <div class="row">
                <button class="btn primary" type="button" (click)="addToCart(r.product)">{{ added() ? '✓ Đã thêm vào giỏ' : '🛒 Thêm vào giỏ' }}</button>
                <a class="btn ghost" [routerLink]="['/san-pham', r.product.slug || r.product.id]">Xem chi tiết</a>
                <button class="btn ghost" type="button" (click)="reset()">🔁 Bóc túi khác</button>
              </div>
            </div>
          </section>
        }

        <div class="bottom">
          <section class="odds card-surface">
            <h2>Tỉ lệ ra đồ</h2>
            <ul>
              @for (it of pool(); track it.product.id) {
                <li [style.--rc]="it.rarity.color">
                  <i></i><span>{{ it.product.name }}</span><small>{{ it.rarity.label }}</small><b>{{ (it.chance * 100).toFixed(1) }}%</b>
                </li>
              }
            </ul>
            <p class="muted small">Độ hiếm dựa theo giá: món càng đắt càng khó ra. Chỉ để giải trí — không phải giảm giá hay quà tặng.</p>
          </section>
          @if (history().length) {
            <section class="history card-surface">
              <h2>Đã bóc gần đây</h2>
              <ul>
                @for (h of history(); track $index) {
                  <li [style.--rc]="h.rarity.color"><i></i><a [routerLink]="['/san-pham', h.product.slug || h.product.id]">{{ h.product.name }}</a></li>
                }
              </ul>
            </section>
          }
        </div>
      }
    </div>
    <app-game-suggest current="gacha" />
  `,
  styles: `
    .wrap { padding: 24px 0 64px; }
    .crumbs { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
    .crumbs a { color: var(--muted); font-weight: 700; }
    .crumbs a:hover { color: var(--primary); }
    .head { text-align: center; margin: 8px 0 24px; }
    .head h1 { margin: 8px 0 6px; font-size: clamp(1.8rem, 4vw, 2.6rem); }
    .hl { color: var(--primary); }
    .muted { color: var(--muted); }
    .small { font-size: .82rem; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; }
    .empty { text-align: center; padding: 48px 16px; }
    .empty span { font-size: 3rem; }

    .machine { display: flex; flex-direction: column; align-items: center; min-height: 300px; justify-content: center; margin-bottom: 24px; }
    .bag-btn { position: relative; display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 40px 60px; border: none; background: none; cursor: pointer; font: inherit; color: inherit; }
    .ray { position: absolute; top: 50%; left: 50%; width: 420px; height: 420px; margin: -230px 0 0 -210px; border-radius: 50%;
      background: repeating-conic-gradient(color-mix(in srgb, #ffd23f 30%, transparent) 0 8deg, transparent 8deg 16deg);
      mask: radial-gradient(circle, #000 20%, transparent 65%); animation: spin 14s linear infinite; pointer-events: none; }
    .bag { position: relative; width: 150px; height: 175px; border-radius: 22px 22px 36px 36px; display: grid; place-items: center;
      background: linear-gradient(145deg, #ff7ac6, #b06bff); box-shadow: 0 20px 40px rgba(0,0,0,.35), inset 0 -14px 26px rgba(0,0,0,.2); transition: transform .2s; }
    .bag::before { content: ''; position: absolute; top: -20px; width: 80px; height: 32px; border: 8px solid #ffd23f; border-bottom: none; border-radius: 40px 40px 0 0; }
    .bag b { font-size: 4.6rem; color: #fff; text-shadow: 0 0 20px #ffd23f; }
    .bag-btn:hover .bag { transform: translateY(-6px) rotate(-3deg); }
    .shaking .bag { animation: shake .5s ease-in-out infinite; }
    .label { position: relative; font-weight: 800; padding: 10px 22px; border-radius: 999px; background: var(--primary); color: var(--on-primary); box-shadow: 0 8px 20px color-mix(in srgb, var(--primary) 40%, transparent); }

    /* Dải quay kiểu mở hòm: các ô chạy ngang, vạch giữa là ô trúng. */
    .reel { position: relative; width: 100%; max-width: 1000px; overflow: hidden; padding: 14px 0; border-radius: 16px;
      background: linear-gradient(#141020, #1e1730); box-shadow: inset 0 0 40px rgba(0,0,0,.6);
      mask: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent); }
    .strip { display: flex; gap: 8px; width: max-content; will-change: transform; }
    .cell { position: relative; flex: 0 0 150px; height: 170px; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column;
      background: linear-gradient(180deg, #2a2440 40%, color-mix(in srgb, var(--rc) 35%, #2a2440)); border-bottom: 5px solid var(--rc); }
    .cell img { width: 100%; height: 120px; object-fit: cover; }
    .cell .name { padding: 6px 8px; font-size: .75rem; font-weight: 700; color: #fff; line-height: 1.25; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .cell.win { box-shadow: 0 0 0 3px var(--rc), 0 0 30px var(--rc); }
    .marker { position: absolute; z-index: 2; top: 0; bottom: 0; left: 50%; width: 3px; margin-left: -1.5px; background: #ffd23f; box-shadow: 0 0 12px #ffd23f; }
    .marker::before, .marker::after { content: ''; position: absolute; left: 50%; margin-left: -9px; border: 9px solid transparent; }
    .marker::before { top: 0; border-top-color: #ffd23f; }
    .marker::after { bottom: 0; border-bottom-color: #ffd23f; }
    .reel.done .cell:not(.win) { opacity: .35; transition: opacity .4s; }
    .spin-hint { margin: 12px 0 0; font-weight: 800; color: var(--primary-dark); animation: blink 1s ease-in-out infinite; }

    .result { position: relative; overflow: hidden; display: grid; grid-template-columns: 260px 1fr; gap: 24px; padding: 24px; margin-bottom: 24px;
      border: 2px solid var(--rc); box-shadow: 0 0 40px color-mix(in srgb, var(--rc) 45%, transparent); animation: pop .5s cubic-bezier(.2,1.4,.4,1); }
    .burst { position: absolute; inset: -40%; pointer-events: none; background: radial-gradient(circle, color-mix(in srgb, var(--rc) 30%, transparent), transparent 55%); animation: pulse 2.4s ease-in-out infinite; }
    .res-img { position: relative; border-radius: 16px; overflow: hidden; aspect-ratio: 1; }
    .res-img img { width: 100%; height: 100%; object-fit: cover; }
    .res-info { position: relative; display: flex; flex-direction: column; gap: 6px; }
    .res-info h2 { margin: 0; font-size: clamp(1.4rem, 3vw, 2rem); }
    .rarity { align-self: flex-start; padding: 4px 12px; border-radius: 999px; font-weight: 800; font-size: .8rem; color: #fff; background: var(--rc); }
    .price { font-size: 1.4rem; color: var(--primary-dark); }

    .bottom { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; align-items: start; }
    .odds, .history { padding: 18px 20px; }
    .odds h2, .history h2 { margin: 0 0 10px; font-size: 1.1rem; }
    ul { list-style: none; margin: 0 0 8px; padding: 0; display: grid; gap: 6px; }
    li { display: grid; grid-template-columns: 10px 1fr auto auto; gap: 10px; align-items: center; font-size: .9rem; }
    .history li { grid-template-columns: 10px 1fr; }
    li i { width: 10px; height: 10px; border-radius: 3px; background: var(--rc); box-shadow: 0 0 6px var(--rc); }
    li small { color: var(--muted); }
    li b { min-width: 48px; text-align: right; }

    @keyframes spin { to { transform: rotate(1turn); } }
    @keyframes shake { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-9deg) scale(1.03); } 75% { transform: rotate(9deg) scale(1.03); } }
    @keyframes pop { from { opacity: 0; transform: scale(.9); } }
    @keyframes pulse { 50% { opacity: .5; transform: scale(1.1); } }
    @keyframes blink { 50% { opacity: .4; } }
    @media (max-width: 760px) {
      .result { grid-template-columns: 1fr; }
      .res-img { max-width: 260px; }
      .bottom { grid-template-columns: 1fr; }
    }
    @media (prefers-reduced-motion: reduce) { .ray, .shaking .bag, .burst, .spin-hint { animation: none; } }
  `,
})
export class GachaPage {
  private readonly products = inject(ProductService).products;
  private readonly cart = inject(CartService);

  readonly winIndex = WIN_INDEX;
  readonly duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1200 : 6500;
  readonly opening = signal(false);
  readonly animating = signal(false);
  readonly strip = signal<PoolItem[]>([]);
  readonly offset = signal(0);
  readonly result = signal<PoolItem | null>(null);
  readonly history = signal<PoolItem[]>([]);
  readonly added = signal(false);

  /** Sản phẩm còn hàng + độ hiếm theo thứ hạng giá: rẻ → phổ thông, hiếm, sử thi; ~10% đắt nhất → huyền thoại. */
  readonly pool = computed<PoolItem[]>(() => {
    const list = this.products()
      .filter((p) => p.inStock)
      .sort((a, b) => a.price - b.price);
    const n = list.length;
    const items = list.map((product, i) => {
      const rank = n === 1 ? 0 : i / (n - 1);
      const rarity = rank >= 0.9 && n >= 4 ? RARITIES[3] : rank >= 0.65 && n >= 3 ? RARITIES[2] : rank >= 0.35 && n >= 2 ? RARITIES[1] : RARITIES[0];
      return { product, rarity, chance: 0 };
    });
    const total = items.reduce((s, it) => s + it.rarity.weight, 0);
    for (const it of items) it.chance = it.rarity.weight / total;
    return items.sort((a, b) => b.chance - a.chance || a.product.price - b.product.price);
  });

  open(): void {
    const pool = this.pool();
    if (!pool.length || this.opening()) return;
    this.opening.set(true);
    this.added.set(false);
    sfx.play('shake');
    // Rung túi một chút rồi mới mở dải quay.
    setTimeout(() => {
      const winner = this.pick(pool);
      const strip = Array.from({ length: STRIP_LEN }, (_, i) => (i === WIN_INDEX ? winner : this.pick(pool)));
      this.animating.set(false);
      this.offset.set(0);
      this.strip.set(strip);
      this.opening.set(false);
      // Hai khung hình: để trình duyệt vẽ vị trí 0 trước khi bật transition.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const reel = document.querySelector('.reel') as HTMLElement | null;
          const width = reel?.clientWidth ?? 800;
          const jitter = (Math.random() - 0.5) * (CELL - 30);
          this.animating.set(true);
          this.offset.set(-(WIN_INDEX * (CELL + GAP) + CELL / 2 - width / 2 + jitter));
          this.pendingWinner = winner;
          this.tickWhileSpinning(width);
        }),
      );
    }, 700);
  }

  private pendingWinner: PoolItem | null = null;

  /** Tiếng "tách" mỗi khi một ô đi qua vạch giữa (đọc vị trí thật của dải đang chạy). */
  private tickWhileSpinning(width: number): void {
    const strip = document.querySelector<HTMLElement>('.reel .strip');
    let lastIndex = -1;
    const step = () => {
      if (!strip || this.result() || !this.strip().length) return;
      const x = new DOMMatrixReadOnly(getComputedStyle(strip).transform).m41;
      const idx = Math.floor((width / 2 - x) / (CELL + GAP));
      if (idx !== lastIndex) {
        if (lastIndex !== -1) sfx.play('tick');
        lastIndex = idx;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  onStop(): void {
    const w = this.pendingWinner;
    if (!w || this.result()) return;
    this.result.set(w);
    this.history.update((h) => [w, ...h].slice(0, 6));
    sfx.play(`reveal-${w.rarity.key}`);
  }

  reset(): void {
    this.result.set(null);
    this.strip.set([]);
    this.pendingWinner = null;
    // Bóc túi khác → cuộn lên đầu trang gacha để thấy túi đang quay.
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    this.open();
  }

  addToCart(p: Product): void {
    if (this.added()) return;
    this.added.set(true);
    flyToCart(document.querySelector('.res-img img'), p.images[0], 1, () => this.cart.add(p.id, 1));
  }

  private pick(pool: PoolItem[]): PoolItem {
    let r = Math.random();
    for (const it of pool) {
      r -= it.chance;
      if (r <= 0) return it;
    }
    return pool[pool.length - 1];
  }
}

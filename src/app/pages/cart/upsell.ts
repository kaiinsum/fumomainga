import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { resolveGames } from '../../models/minigames';
import { Product, productPath, variantsOf } from '../../models/product';
import { CartService } from '../../services/cart.service';
import { ProductService } from '../../services/product.service';
import { SettingsService } from '../../services/settings.service';
import { PriceTagComponent } from '../../shared/price-tag';

/** Mua từ bao nhiêu bé (tổng số lượng) thì được miễn phí ship. */
export const FREE_SHIP_QTY = 2;

/**
 * Giỏ hàng: nút "Mua thêm đi mà" (mua 2 bé trở lên được freeship) → popup chọn
 * "Tự chọn sản phẩm" (thêm nhanh ngay trong popup) hoặc "Thử vận may" (minigame Túi mù).
 */
@Component({
  selector: 'app-upsell',
  imports: [RouterLink, PriceTagComponent],
  template: `
    @if (left() > 0) {
      <button type="button" class="nudge" (click)="openPopup()">
        <span class="nudge-ico" aria-hidden="true">🥺</span>
        <span class="nudge-txt">
          <b>Mua thêm đi mà!</b>
          <small>Mua {{ freeQty }} bé trở lên được <strong>freeship</strong> đó - chỉ còn {{ left() }} bé nữa thôi 🚚</small>
        </span>
        <span class="nudge-go" aria-hidden="true">›</span>
      </button>
    } @else {
      <div class="freeship">
        <span aria-hidden="true">🎉</span>
        <span><b>Đơn của bạn được freeship!</b> <small>Mua từ {{ freeQty }} bé trở lên miễn phí vận chuyển.</small></span>
        <button type="button" class="more" (click)="openPopup()">Mua thêm</button>
      </div>
    }

    @if (open()) {
      <div class="backdrop" (click)="close()">
        <div class="pop card-surface" role="dialog" aria-modal="true" aria-labelledby="upsell-title" (click)="$event.stopPropagation()">
          <button type="button" class="x" (click)="close()" aria-label="Đóng">✕</button>

          @if (view() === 'choose') {
            <div class="hero-ico" aria-hidden="true">🧸💨</div>
            <h2 id="upsell-title">
              @if (left() > 0) { Thêm {{ left() }} bé nữa là <span>freeship</span>! } @else { Rước thêm bé nữa nhé? }
            </h2>
            <p class="muted">Bạn muốn tự chọn hay để vận may quyết định?</p>
            <div class="choices">
              <button type="button" class="choice pick" (click)="view.set('pick')">
                <span class="c-ico">🛍️</span>
                <b>Tự chọn sản phẩm</b>
                <small>Chọn nhanh bé bạn thích ngay tại đây</small>
              </button>
              @if (gacha(); as g) {
                <button type="button" class="choice luck" [disabled]="g.status !== 'open'" (click)="tryLuck(g.path)">
                  <span class="c-ico">🎁</span>
                  <b>Thử vận may</b>
                  <small>{{ g.status === 'open' ? 'Bóc túi mù - số phận chọn bé cho bạn!' : g.lockMsg }}</small>
                </button>
              }
            </div>
            @if (checkout) {
              <button type="button" class="skip" (click)="proceed()">Không, thanh toán luôn →</button>
            }
          } @else {
            <div class="pick-head">
              <button type="button" class="back" (click)="view.set('choose')">← Quay lại</button>
              <h2 id="upsell-title">Tự chọn sản phẩm</h2>
            </div>
            <p class="progress" [class.done]="left() === 0">
              @if (left() > 0) { 🚚 Còn {{ left() }} bé nữa là được freeship } @else { 🎉 Đã đủ freeship rồi! }
            </p>
            <ul class="plist">
              @for (p of suggestions(); track p.id) {
                <li>
                  <a [routerLink]="link(p)" (click)="close()"><img [src]="p.images[0]" [alt]="p.name" loading="lazy" /></a>
                  <div class="pinfo">
                    <a class="pname" [routerLink]="link(p)" (click)="close()">{{ p.name }}</a>
                    <app-price-tag [product]="p" [badge]="false" />
                    @if (variants(p).length) {
                      <select [attr.aria-label]="'Chọn loại ' + p.name" (change)="pickVariant(p.id, $any($event.target).value)">
                        @for (v of variants(p); track v.id) { <option [value]="v.id">{{ v.name }}</option> }
                      </select>
                    }
                  </div>
                  <button type="button" class="add" [class.ok]="justAdded() === p.id" (click)="add(p)">
                    {{ justAdded() === p.id ? '✓ Đã thêm' : inCart(p.id) ? '+ Thêm nữa' : '+ Thêm' }}
                  </button>
                </li>
              } @empty {
                <li class="none">Hiện chưa có sản phẩm nào còn hàng.</li>
              }
            </ul>
            <div class="pick-foot">
              <a routerLink="/san-pham" (click)="close()">Xem tất cả sản phẩm →</a>
              @if (checkout) {
                <button type="button" class="btn primary small" (click)="proceed()">Thanh toán →</button>
              } @else {
                <button type="button" class="btn primary small" (click)="close()">Xong, về giỏ hàng</button>
              }
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: `
    :host { display: block; margin-top: 14px; }
    .nudge {
      width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer; text-align: left; font: inherit; color: var(--text);
      border-radius: 16px; border: 2px dashed var(--primary);
      background: linear-gradient(110deg, var(--primary-100), color-mix(in srgb, #ff8fab 16%, var(--surface)));
      transition: transform .2s, box-shadow .2s;
    }
    .nudge:hover { transform: translateY(-2px); box-shadow: 0 10px 24px color-mix(in srgb, var(--primary) 25%, transparent); }
    .nudge-ico { font-size: 2rem; animation: beg 1.8s ease-in-out infinite; }
    .nudge-txt { display: flex; flex-direction: column; flex: 1; min-width: 0; line-height: 1.35; }
    .nudge-txt b { font-size: 1.05rem; color: var(--primary-dark); }
    .nudge-txt small { color: var(--muted); }
    .nudge-txt strong { color: var(--primary-dark); }
    .nudge-go { font-size: 1.8rem; color: var(--primary); font-weight: 800; }
    @keyframes beg { 0%, 100% { transform: rotate(0) scale(1); } 30% { transform: rotate(-10deg) scale(1.08); } 60% { transform: rotate(8deg) scale(1.05); } }
    .freeship {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 12px 16px; border-radius: 16px;
      background: color-mix(in srgb, #3fcf74 14%, var(--surface)); border: 1px solid color-mix(in srgb, #3fcf74 45%, transparent);
    }
    .freeship > span:first-child { font-size: 1.5rem; }
    .freeship > span:nth-child(2) { flex: 1; min-width: 180px; }
    .freeship small { display: block; margin-top: 2px; color: var(--muted); }
    .more { border: 1px solid var(--border); background: var(--surface); color: var(--primary-dark); font: inherit; font-weight: 700; font-size: .85rem; padding: 6px 14px; border-radius: 999px; cursor: pointer; }
    .more:hover { border-color: var(--primary); }

    .backdrop { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,.45); display: grid; place-items: center; padding: 16px; animation: fade .2s ease; }
    .pop { position: relative; width: min(560px, 100%); max-height: calc(100dvh - 32px); overflow-y: auto; padding: 26px 22px 20px; text-align: center; animation: pop .35s cubic-bezier(.2,1.4,.4,1); }
    .x { position: absolute; top: 10px; right: 10px; width: 34px; height: 34px; border: 0; border-radius: 10px; background: var(--surface-2); color: var(--muted); cursor: pointer; font-size: 1rem; }
    .hero-ico { font-size: 2.6rem; }
    h2 { margin: 4px 0 6px; font-size: 1.35rem; }
    h2 span { color: var(--primary); }
    .muted { color: var(--muted); margin: 0 0 16px; }
    .choices { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .choice {
      display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 20px 14px; cursor: pointer; font: inherit; color: var(--text);
      border-radius: 18px; border: 2px solid var(--border); background: var(--surface); transition: transform .2s, border-color .2s, box-shadow .2s;
    }
    .choice:hover:not(:disabled) { transform: translateY(-4px); border-color: var(--primary); box-shadow: 0 12px 26px color-mix(in srgb, var(--primary) 25%, transparent); }
    .choice.luck { background: linear-gradient(160deg, color-mix(in srgb, #b06bff 14%, var(--surface)), color-mix(in srgb, #ff8fab 14%, var(--surface))); }
    .choice.luck:hover:not(:disabled) { border-color: #b06bff; box-shadow: 0 12px 26px rgba(176,107,255,.3); }
    .choice:disabled { opacity: .55; cursor: not-allowed; }
    .skip { margin-top: 14px; border: 0; background: none; font: inherit; font-weight: 700; color: var(--muted); cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
    .skip:hover { color: var(--primary-dark); }
    .c-ico { font-size: 2.4rem; }
    .choice:hover:not(:disabled) .c-ico { animation: beg .8s ease; }
    .choice b { font-size: 1.05rem; }
    .choice small { color: var(--muted); font-size: .82rem; line-height: 1.35; }

    .pick-head { display: flex; align-items: center; gap: 10px; padding-right: 36px; }
    .pick-head h2 { margin: 0; font-size: 1.2rem; }
    .back { border: 0; background: none; color: var(--primary-dark); font: inherit; font-weight: 700; cursor: pointer; padding: 4px 0; white-space: nowrap; }
    .progress { margin: 10px 0; padding: 8px 12px; border-radius: 12px; background: var(--primary-100); color: var(--primary-dark); font-weight: 700; font-size: .9rem; }
    .progress.done { background: color-mix(in srgb, #3fcf74 16%, var(--surface)); color: #1f8a4c; }
    .plist { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; text-align: left; }
    .plist li { display: flex; align-items: center; gap: 12px; padding: 8px; border-radius: 14px; border: 1px solid var(--border); background: var(--surface); }
    .plist img { width: 60px; height: 60px; border-radius: 12px; object-fit: cover; flex: none; background: var(--surface-2); }
    .pinfo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; font-size: .9rem; }
    .pname { font-weight: 800; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pname:hover { color: var(--primary); }
    select { align-self: flex-start; max-width: 100%; font: inherit; font-size: .8rem; padding: 2px 6px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); }
    .add { flex: none; border: 0; border-radius: 999px; padding: 8px 14px; font: inherit; font-weight: 800; font-size: .85rem; cursor: pointer; background: var(--primary); color: var(--on-primary); transition: transform .15s; }
    .add:hover { transform: scale(1.05); }
    .add.ok { background: #3fcf74; color: #fff; }
    .none { justify-content: center; color: var(--muted); }
    .pick-foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
    .pick-foot a { color: var(--primary-dark); font-weight: 700; }
    @keyframes fade { from { opacity: 0; } }
    @keyframes pop { from { opacity: 0; transform: scale(.9) translateY(10px); } }
    @media (max-width: 520px) {
      .choices { grid-template-columns: 1fr; }
      .choice { flex-direction: row; text-align: left; padding: 14px; gap: 12px; }
      .choice .c-ico { font-size: 2rem; }
      .choice b, .choice small { display: block; }
      .plist img { width: 48px; height: 48px; }
      .pick-foot { justify-content: center; }
    }
    @media (prefers-reduced-motion: reduce) { .nudge-ico, .pop, .backdrop { animation: none; } }
  `,
})
export class UpsellComponent {
  private readonly cart = inject(CartService);
  private readonly products = inject(ProductService);
  private readonly settings = inject(SettingsService).settings;
  private readonly router = inject(Router);

  readonly freeQty = FREE_SHIP_QTY;
  readonly open = signal(false);
  readonly view = signal<'choose' | 'pick'>('choose');
  readonly justAdded = signal<string | null>(null);
  private readonly chosenVariant = new Map<string, string>();
  private addedTimer?: ReturnType<typeof setTimeout>;

  readonly left = computed(() => Math.max(0, FREE_SHIP_QTY - this.cart.count()));
  /** Minigame Túi mù (ẩn hẳn nếu admin ẩn game). */
  readonly gacha = computed(() => {
    const g = resolveGames(this.settings().minigames).find((x) => x.id === 'gacha');
    return g && g.status !== 'hidden' ? g : null;
  });
  private readonly cartIds = computed(() => new Set(this.cart.items().map((l) => l.product.id)));
  /** Còn hàng; chưa có trong giỏ lên trước, rồi tới sản phẩm nổi bật, mới nhất. */
  readonly suggestions = computed(() => {
    const ids = this.cartIds();
    return this.products
      .shop()
      .filter((p) => p.inStock)
      .sort((a, b) => +ids.has(a.id) - +ids.has(b.id) || +b.featured - +a.featured || b.createdAt - a.createdAt)
      .slice(0, 12);
  });

  /** Đặt khi popup mở từ nút thanh toán: bấm "thanh toán luôn" sẽ gọi hàm này. */
  checkout: (() => void) | null = null;

  /** Mở popup. Truyền `onCheckout` khi mở từ nút thanh toán (hiện thêm lựa chọn "thanh toán luôn"). */
  openPopup(onCheckout?: () => void): void {
    this.checkout = onCheckout ?? null;
    this.view.set('choose');
    this.open.set(true);
  }

  close(): void {
    this.open.set(false);
    this.checkout = null;
  }

  /** Bỏ qua mua thêm → tiếp tục thanh toán. */
  proceed(): void {
    const go = this.checkout;
    this.close();
    go?.();
  }

  tryLuck(path: string): void {
    this.close();
    void this.router.navigateByUrl(path);
  }

  variants(p: Product) {
    return variantsOf(p);
  }

  pickVariant(id: string, variantId: string): void {
    this.chosenVariant.set(id, variantId);
  }

  inCart(id: string): boolean {
    return this.cartIds().has(id);
  }

  link(p: Product): string {
    return productPath(p);
  }

  add(p: Product): void {
    this.cart.add(p.id, 1, this.chosenVariant.get(p.id));
    this.justAdded.set(p.id);
    clearTimeout(this.addedTimer);
    this.addedTimer = setTimeout(() => this.justAdded.set(null), 1400);
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.close();
  }
}

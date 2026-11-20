import { AfterViewInit, Component, ElementRef, OnDestroy, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnimatableObject, AnimatableProperty, animate, createAnimatable, spring } from 'animejs';
import { Product, discountPercent, onSale } from '../../models/product';
import { PriceTagComponent } from '../../shared/price-tag';
import { perf } from '../../core/perf';

/** Độ nghiêng tối đa (độ) và độ lệch ảnh (px) khi rê chuột. */
const TILT = 9;
const PARALLAX = 10;

/** Animatable có khai báo sẵn tên thuộc tính (để TypeScript strict kiểm tra được). */
type Anim<K extends string> = AnimatableObject & Record<K, AnimatableProperty>;

@Component({
  selector: 'app-product-card',
  imports: [RouterLink, PriceTagComponent],
  template: `
    @let p = product();
    <a class="card" [class.feat]="p.featured && p.inStock" [class.out]="!p.inStock" [routerLink]="['/san-pham', p.slug || p.id]">
      <div class="thumb">
        <img [src]="p.images[0]" [alt]="p.name" loading="lazy" />
        @if (!p.inStock) {
          <span class="badge out">Hết hàng</span>
        } @else if (onSale(p)) {
          <span class="badge sale">Giảm {{ discountPercent(p) }}%</span>
        } @else if (p.featured) {
          <span class="badge feat-badge">★ Nổi bật</span>
        }
        @if (p.featured && p.inStock && onSale(p)) {
          <span class="star" title="Nổi bật" aria-label="Nổi bật">★</span>
        }
      </div>
      <div class="info">
        <span class="cat">{{ p.category }}</span>
        <h3>{{ p.name }}</h3>
        <div class="bottom">
          <app-price-tag class="pt" [product]="p" [badge]="false" />
          <span class="go" aria-hidden="true">→</span>
        </div>
      </div>
      <span class="glare" aria-hidden="true"></span>
    </a>
  `,
  styles: `
    :host { display: block; perspective: 900px; }
    .card {
      position: relative; display: flex; flex-direction: column; height: 100%;
      background: var(--surface); border-radius: var(--radius); overflow: hidden;
      border: 1px solid var(--border);
      box-shadow: 0 4px 14px color-mix(in srgb, var(--primary) 12%, transparent);
      transform-style: preserve-3d; will-change: transform;
      transition: box-shadow .45s ease, border-color .45s ease;
      outline: none;
    }
    .card.lift {
      border-color: var(--primary-300);
      box-shadow: 0 22px 44px -8px color-mix(in srgb, var(--primary) 38%, transparent);
    }
    .card:focus-visible { box-shadow: 0 0 0 3px var(--primary); }

    /* Sản phẩm nổi bật: viền gradient chạy vòng + phát sáng */
    .card.feat {
      border: 3px solid transparent;
      background:
        linear-gradient(var(--surface), var(--surface)) padding-box,
        conic-gradient(from var(--feat-ang, 0deg), var(--primary), #ffc94d, #ff7eb3, #8f7bff, var(--primary)) border-box;
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 25%, transparent),
        0 10px 28px -6px color-mix(in srgb, #ffb020 40%, transparent),
        0 6px 22px color-mix(in srgb, var(--primary) 28%, transparent);
      animation: feat-spin 5s linear infinite;
    }
    .card.feat.lift {
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 30%, transparent),
        0 24px 48px -8px color-mix(in srgb, #ffb020 45%, transparent);
    }
    @keyframes feat-spin { to { --feat-ang: 360deg; } }
    :host-context(html.lite) .card.feat { animation: none; }
    .feat-badge { background: linear-gradient(135deg, #ffb020, #ff6fa5); color: #fff; box-shadow: 0 3px 10px rgba(255, 140, 60, .35); }
    .star { position: absolute; top: 10px; right: 10px; z-index: 1; width: 28px; height: 28px; display: grid; place-items: center;
      border-radius: 50%; background: linear-gradient(135deg, #ffb020, #ff6fa5); color: #fff; font-size: .9rem;
      box-shadow: 0 3px 10px rgba(255, 140, 60, .35); }

    /* Hết hàng: ảnh trắng đen + mờ */
    .card.out .thumb img { filter: grayscale(1) contrast(.9); opacity: .55; transition: filter .45s ease, opacity .45s ease; }
    .card.out.lift .thumb img { filter: grayscale(.6); opacity: .8; }
    .card.out .info { opacity: .65; }
    .card.out { box-shadow: none; }
    .card.out .badge.out { background: rgba(30, 30, 30, .78); color: #fff; border-color: transparent; }

    .thumb { position: relative; aspect-ratio: 1; overflow: hidden; background: var(--surface-2); }
    .thumb img { width: 100%; height: 100%; object-fit: cover; will-change: transform; }
    .thumb::after {
      /* Lớp phủ sắc xanh rất nhẹ khi hover */
      content: ''; position: absolute; inset: 0; pointer-events: none;
      background: linear-gradient(to top, color-mix(in srgb, var(--primary) 22%, transparent), transparent 55%);
      opacity: 0; transition: opacity .45s ease;
    }
    .card.lift .thumb::after { opacity: 1; }

    .badge { position: absolute; top: 12px; left: 12px; z-index: 1; background: var(--primary); color: var(--on-primary);
      font-size: .75rem; font-weight: 800; padding: 4px 10px; border-radius: 999px; }
    .badge.sale { background: #e53935; color: #fff; }
    .pt { font-size: 1.1rem; font-weight: 800; }
    .badge.out { background: var(--surface); color: var(--muted); border: 1.5px solid var(--border); }

    .info { padding: 14px 16px 16px; display: flex; flex-direction: column; flex: 1; }
    .cat { font-size: .78rem; color: var(--muted); font-weight: 700; }
    h3 { font-size: 1.05rem; margin: 4px 0 10px; transition: color .3s ease;
      /* Tên dài → tối đa 2 dòng để các thẻ cao bằng nhau */
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .card.lift h3 { color: var(--primary-dark); }
    .bottom { margin-top: auto; display: flex; justify-content: space-between; align-items: center; }
    strong { color: var(--primary-dark); font-size: 1.1rem; }
    .go {
      width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%;
      background: var(--surface-2); color: var(--primary-dark); font-weight: 900;
      transition: background .35s ease, color .35s ease;
    }
    .card.lift .go { background: var(--primary); color: var(--on-primary); }

    .glare {
      /* Vệt sáng trắng chạy theo con trỏ */
      position: absolute; inset: 0; pointer-events: none; z-index: 2; opacity: 0;
      background: radial-gradient(circle at var(--gx, 50%) var(--gy, 0%), rgba(255, 255, 255, .55), transparent 55%);
      mix-blend-mode: soft-light;
    }

    /* Điện thoại: thẻ nhỏ gọn để xếp 2 cột */
    @media (max-width: 600px) {
      .card { border-radius: 14px; }
      .badge { top: 7px; left: 7px; font-size: .62rem; padding: 2px 7px; }
      .star { top: 6px; right: 6px; width: 22px; height: 22px; font-size: .72rem; }
      .card.feat { border-width: 2px; }
      .info { padding: 8px 10px 10px; }
      .cat { font-size: .66rem; }
      h3 { font-size: .86rem; line-height: 1.3; margin: 2px 0 6px; }
      .pt { font-size: .86rem; }
      strong { font-size: .86rem; }
      .go { width: 24px; height: 24px; font-size: .75rem; }
    }

    /* Thẻ nhỏ (vd. sản phẩm liên quan trên điện thoại: 3 thẻ / hàng) */
    @media (max-width: 600px) {
      :host(.compact) .info { padding: 6px 7px 8px; }
      :host(.compact) .cat { display: none; }
      :host(.compact) h3 { font-size: .74rem; margin: 0 0 4px; }
      :host(.compact) .pt, :host(.compact) strong { font-size: .74rem; }
      :host(.compact) .go { display: none; }
      :host(.compact) .badge { font-size: .55rem; padding: 1px 5px; top: 5px; left: 5px; }
      :host(.compact) .star { display: none; }
      :host(.compact) .card { border-radius: 10px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .card, .thumb::after, .go, h3 { transition: none; }
      .card.feat { animation: none; }
    }
  `,
})
export class ProductCardComponent implements AfterViewInit, OnDestroy {
  protected readonly onSale = onSale;
  protected readonly discountPercent = discountPercent;
  readonly product = input.required<Product>();
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  private card!: HTMLElement;
  private glare!: HTMLElement;
  private cardAnim?: Anim<'rotateX' | 'rotateY' | 'translateY' | 'scale'>;
  private imgAnim?: Anim<'translateX' | 'translateY' | 'scale'>;
  private glareAnim?: Anim<'opacity'>;
  private readonly cleanup: (() => void)[] = [];

  ngAfterViewInit(): void {
    this.card = this.host.querySelector('.card')!;
    this.glare = this.host.querySelector('.glare')!;
    const img = this.host.querySelector<HTMLElement>('.thumb img')!;

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;

    // Animatable: mỗi lần gọi setter sẽ chuyển mượt tới giá trị mới, tự huỷ chuyển động cũ -> không giật.
    this.cardAnim = <typeof this.cardAnim>createAnimatable(this.card, {
      rotateX: { unit: 'deg', duration: 500 },
      rotateY: { unit: 'deg', duration: 500 },
      translateY: { unit: 'px', duration: 600 },
      scale: 600,
      ease: 'out(4)',
    });
    this.imgAnim = <typeof this.imgAnim>createAnimatable(img, {
      translateX: { unit: 'px', duration: 700 },
      translateY: { unit: 'px', duration: 700 },
      scale: 900,
      ease: 'out(3)',
    });
    this.glareAnim = <typeof this.glareAnim>createAnimatable(this.glare, { opacity: 400, ease: 'out(2)' });

    const on = (type: string, fn: (e: PointerEvent) => void) => {
      const handler = fn as EventListener;
      this.card.addEventListener(type, handler);
      this.cleanup.push(() => this.card.removeEventListener(type, handler));
    };

    // Lắng nghe trực tiếp (không qua Angular) để không chạy change detection mỗi lần di chuột.
    on('pointerenter', (e) => e.pointerType === 'mouse' && this.enter());
    on('pointerleave', (e) => e.pointerType === 'mouse' && this.leave());
    if (canHover && !reduced && !perf.lite) on('pointermove', (e) => this.move(e));
    this.card.addEventListener('focus', this.focusIn);
    this.card.addEventListener('blur', this.focusOut);
    this.cleanup.push(() => {
      this.card.removeEventListener('focus', this.focusIn);
      this.card.removeEventListener('blur', this.focusOut);
    });
  }

  private readonly focusIn = () => this.enter();
  private readonly focusOut = () => this.leave();

  private enter(): void {
    this.card.classList.add('lift');
    const c = this.cardAnim;
    c?.translateY(-10);
    c?.scale(1.02);
    this.imgAnim?.scale(1.09);
    this.glareAnim?.opacity(1);

    // Mũi tên & nhãn: nảy nhẹ bằng spring.
    animate(this.host.querySelector('.go')!, {
      translateX: [0, 5],
      rotate: [0, -12, 0],
      scale: [1, 1.18, 1.08],
      ease: spring({ bounce: 0.55, duration: 600 }),
    });
    const badge = this.host.querySelector('.badge');
    if (badge) animate(badge, { scale: [1, 1.12, 1], duration: 500, ease: 'out(3)' });
  }

  private move(e: PointerEvent): void {
    const r = this.card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5; // -0.5 .. 0.5
    const y = (e.clientY - r.top) / r.height - 0.5;

    this.cardAnim?.rotateY(x * TILT * 2);
    this.cardAnim?.rotateX(-y * TILT * 2);
    // Ảnh lệch ngược chiều chuột -> cảm giác có chiều sâu.
    this.imgAnim?.translateX(-x * PARALLAX * 2);
    this.imgAnim?.translateY(-y * PARALLAX * 2);
    this.glare.style.setProperty('--gx', `${(x + 0.5) * 100}%`);
    this.glare.style.setProperty('--gy', `${(y + 0.5) * 100}%`);
  }

  private leave(): void {
    this.card.classList.remove('lift');
    // Trở về vị trí cũ với độ nảy mềm.
    const c = this.cardAnim;
    c?.rotateX(0, 900, 'outElastic(1, .6)');
    c?.rotateY(0, 900, 'outElastic(1, .6)');
    c?.translateY(0);
    c?.scale(1);
    const i = this.imgAnim;
    i?.translateX(0);
    i?.translateY(0);
    i?.scale(1);
    this.glareAnim?.opacity(0);
    animate(this.host.querySelector('.go')!, { translateX: 0, rotate: 0, scale: 1, duration: 450, ease: 'out(3)' });
  }

  ngOnDestroy(): void {
    this.cleanup.forEach((fn) => fn());
    this.cardAnim?.revert();
    this.imgAnim?.revert();
    this.glareAnim?.revert();
  }
}

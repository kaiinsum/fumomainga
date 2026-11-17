/**
 * Hiệu ứng "thêm vào giỏ": ảnh sản phẩm thu nhỏ bay theo đường cong vào biểu tượng giỏ trên thanh menu,
 * rồi giỏ nảy lên kèm chữ "+1". Gọi onLand() khi ảnh chạm giỏ (thường là lúc cộng vào giỏ thật).
 */
export function flyToCart(source: Element | null, imgSrc: string, qty: number, onLand: () => void): void {
  const cart = document.querySelector<HTMLElement>('.cart-btn');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!source || !cart || reduced || !cart.getClientRects().length) {
    onLand();
    if (cart) bump(cart, qty);
    return;
  }

  const from = source.getBoundingClientRect();
  const to = cart.getBoundingClientRect();
  const size = Math.min(110, Math.max(56, Math.min(from.width, from.height) * 0.5));
  const startX = from.left + from.width / 2 - size / 2;
  const startY = from.top + from.height / 2 - size / 2;
  const dx = to.left + to.width / 2 - size / 2 - startX;
  const dy = to.top + to.height / 2 - size / 2 - startY;

  const img = document.createElement('img');
  img.src = imgSrc;
  img.alt = '';
  Object.assign(img.style, {
    position: 'fixed',
    left: `${startX}px`,
    top: `${startY}px`,
    width: `${size}px`,
    height: `${size}px`,
    objectFit: 'cover',
    borderRadius: '50%',
    zIndex: '9999',
    pointerEvents: 'none',
    boxShadow: '0 10px 30px rgba(0,0,0,.25), 0 0 0 3px #fff',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(img);

  // Đường cong: bay vọt lên rồi chúi xuống giỏ.
  const lift = Math.min(160, Math.abs(dy) * 0.5 + 80);
  const anim = img.animate(
    [
      { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1, offset: 0 },
      { transform: `translate(${dx * 0.15}px, ${-lift * 0.6}px) scale(1.12) rotate(-8deg)`, opacity: 1, offset: 0.25 },
      { transform: `translate(${dx * 0.6}px, ${dy * 0.35 - lift}px) scale(0.7) rotate(8deg)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.18) rotate(20deg)`, opacity: 0.7, offset: 1 },
    ],
    { duration: 850, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'forwards' },
  );
  anim.onfinish = () => {
    img.remove();
    onLand();
    bump(cart, qty);
  };
}

/** Giỏ nảy lên + chữ "+N" bay ra. */
function bump(cart: HTMLElement, qty: number): void {
  cart.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.35) rotate(-10deg)' },
      { transform: 'scale(0.9) rotate(6deg)' },
      { transform: 'scale(1)' },
    ],
    { duration: 500, easing: 'ease-out' },
  );
  const r = cart.getBoundingClientRect();
  const plus = document.createElement('span');
  plus.textContent = `+${qty}`;
  Object.assign(plus.style, {
    position: 'fixed',
    left: `${r.left + r.width / 2 - 14}px`,
    top: `${r.bottom - 4}px`,
    zIndex: '9999',
    pointerEvents: 'none',
    font: '800 14px system-ui, sans-serif',
    color: '#fff',
    background: 'var(--primary, #60b5ff)',
    padding: '2px 8px',
    borderRadius: '999px',
    boxShadow: '0 4px 12px rgba(0,0,0,.2)',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(plus);
  plus
    .animate(
      [
        { transform: 'translateY(0) scale(.6)', opacity: 0 },
        { transform: 'translateY(8px) scale(1.1)', opacity: 1, offset: 0.3 },
        { transform: 'translateY(24px) scale(1)', opacity: 0 },
      ],
      { duration: 900, easing: 'ease-out', fill: 'forwards' },
    )
    .finished.then(() => plus.remove());
}

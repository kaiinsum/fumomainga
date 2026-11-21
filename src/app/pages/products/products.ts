import { richToText } from '../../shared/rich-text';
import { Component, ElementRef, WritableSignal, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { animate, stagger } from 'animejs';
import { SortKey, finalPrice } from '../../models/product';
import { CategoryService } from '../../services/category.service';
import { ProductService } from '../../services/product.service';
import { ProductCardComponent } from '../../components/product-card/product-card';
import { VndPipe } from '../../shared/vnd.pipe';
import { IconComponent } from '../../shared/icon';

const PAGE_SIZE = 12;

/** Ảnh fumo (nền trong suốt, lấy từ minigame) cho dòng "hết sản phẩm rồi". */
const END_FUMOS = ['cirno', 'reimu', 'flandre', 'koishi', 'remilia', 'yuyuko', 'yukari', 'meiling', 'teto'].map((n) => `/fumo-ninja/${n}.webp`);

@Component({
  selector: 'app-products',
  imports: [FormsModule, ProductCardComponent, VndPipe, IconComponent],
  templateUrl: './products.html',
  styleUrl: './products.scss',
})
export class ProductsPage {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly service = inject(ProductService);

  private readonly catSvc = inject(CategoryService);
  readonly categories = this.catSvc.names;
  /** Icon danh mục (emoji hoặc ảnh PNG vuông). */
  catIcon(name: string): string {
    return this.catSvc.find(name)?.icon ?? '';
  }
  readonly allTags = this.service.allTags;

  /** Số sản phẩm đang bán trong từng danh mục (hiện bên phải tên danh mục). */
  private readonly catCounts = computed(() => {
    const m = new Map<string, number>();
    for (const p of this.service.shop()) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return m;
  });

  catCount(name: string): number {
    return this.catCounts().get(name) ?? 0;
  }
  readonly maxPrice = computed(() => Math.ceil(this.service.maxPrice() / 10000) * 10000 || 1000000);

  readonly sortOptions: { value: SortKey; label: string }[] = [
    { value: 'newest', label: 'Mới nhất' },
    { value: 'price-asc', label: 'Giá tăng dần' },
    { value: 'price-desc', label: 'Giá giảm dần' },
    { value: 'name', label: 'Tên A → Z' },
  ];

  // ---- Trạng thái bộ lọc ----
  readonly search = signal('');
  readonly selectedCats = signal<Set<string>>(new Set());
  readonly selectedTags = signal<Set<string>>(new Set());
  readonly priceMax = signal<number | null>(null);
  readonly inStockOnly = signal(false);
  readonly sort = signal<SortKey>('newest');
  readonly view = signal<'grid' | 'list'>('grid');
  /** Trang đang xem (bắt đầu từ 1). */
  readonly page = signal(1);
  readonly filtersOpen = signal(false);

  readonly effectivePriceMax = computed(() => this.priceMax() ?? this.maxPrice());

  readonly filtered = computed(() => {
    const term = this.normalize(this.search().trim());
    const cats = this.selectedCats();
    const tags = this.selectedTags();
    const max = this.effectivePriceMax();
    const stock = this.inStockOnly();

    const list = this.service.shop().filter(
      (p) =>
        (!term || this.normalize(`${p.name} ${richToText(p.description)} ${p.tags.join(' ')}`).includes(term)) &&
        (!cats.size || cats.has(p.category)) &&
        (!tags.size || p.tags.some((t) => tags.has(t))) &&
        finalPrice(p) <= max &&
        (!stock || p.inStock),
    );

    const sorters: Record<SortKey, (a: (typeof list)[0], b: (typeof list)[0]) => number> = {
      newest: (a, b) => b.createdAt - a.createdAt,
      'price-asc': (a, b) => finalPrice(a) - finalPrice(b),
      'price-desc': (a, b) => finalPrice(b) - finalPrice(a),
      name: (a, b) => a.name.localeCompare(b.name, 'vi'),
    };
    return [...list].sort(sorters[this.sort()]);
  });

  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE)));
  /** Trang hợp lệ (bộ lọc làm ít kết quả đi thì không vượt quá trang cuối). */
  readonly current = computed(() => Math.min(this.page(), this.pageCount()));
  readonly shown = computed(() => this.filtered().slice((this.current() - 1) * PAGE_SIZE, this.current() * PAGE_SIZE));
  readonly isLast = computed(() => this.current() === this.pageCount());
  /** Nút số trang: 1 … 4 5 6 … 12 (0 = dấu …). */
  readonly pages = computed(() => {
    const n = this.pageCount();
    const c = this.current();
    if (n <= 7) return Array.from({ length: n }, (_, i) => i + 1);
    const set = [...new Set([1, n, c - 1, c, c + 1, ...(c <= 3 ? [2, 3, 4] : []), ...(c >= n - 2 ? [n - 3, n - 2, n - 1] : [])])]
      .filter((x) => x >= 1 && x <= n)
      .sort((a, b) => a - b);
    const out: number[] = [];
    set.forEach((x, i) => {
      if (i && x - set[i - 1] > 1) out.push(0);
      out.push(x);
    });
    return out;
  });
  /** Fumo ngẫu nhiên ở cuối danh sách. */
  readonly endFumo = END_FUMOS[Math.floor(Math.random() * END_FUMOS.length)];

  readonly activeCount = computed(
    () =>
      this.selectedCats().size +
      this.selectedTags().size +
      (this.priceMax() !== null ? 1 : 0) +
      (this.inStockOnly() ? 1 : 0) +
      (this.search() ? 1 : 0),
  );

  constructor() {
    // Đọc bộ lọc từ URL: /san-pham?danhMuc=Figure&q=mini
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const cat = params.get('danhMuc');
        this.selectedCats.set(new Set(cat ? [cat] : []));
        this.search.set(params.get('q') ?? '');
        this.page.set(1);
      });

    // Đổi bộ lọc / sắp xếp → về trang 1.
    effect(() => {
      this.search();
      this.selectedCats();
      this.selectedTags();
      this.priceMax();
      this.inStockOnly();
      this.sort();
      untracked(() => this.page.set(1));
    });

    // Kết quả lọc / kiểu hiển thị thay đổi → chỉ tạo hiệu ứng cho thẻ MỚI xuất hiện.
    // (Trước đây cả lưới chạy lại hiệu ứng mỗi lần kéo thanh giá → các thẻ nhảy lên xuống liên tục.)
    let lastView = this.view();
    effect(() => {
      this.shown();
      const view = this.view();
      untracked(() =>
        requestAnimationFrame(() => {
          const all = view !== lastView;
          lastView = view;
          this.animateGrid(0, all);
        }),
      );
    });
  }

  /** id các thẻ đang hiện (để biết thẻ nào mới). */
  private shownIds = new Set<string>();

  private animateGrid(from = 0, all = false): void {
    const cards = Array.from(this.host.querySelectorAll<HTMLElement>('.results > *'));
    const ids = new Set(cards.map((c) => c.dataset['id'] ?? ''));
    const items = cards.slice(from).filter((c) => all || !this.shownIds.has(c.dataset['id'] ?? ''));
    this.shownIds = ids;
    if (!items.length) return;
    animate(items, {
      opacity: [0, 1],
      translateY: [24, 0],
      scale: [0.96, 1],
      delay: stagger(55),
      duration: 550,
      ease: 'outCubic',
    });
  }

  toggle<T>(sig: WritableSignal<Set<T>>, value: T): void {
    sig.update((s) => {
      const next = new Set(s);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });
    this.page.set(1);
  }

  setPrice(value: number): void {
    this.priceMax.set(value >= this.maxPrice() ? null : value);
  }

  /** Chuyển trang → cuộn lên đầu danh sách. */
  goPage(n: number): void {
    const next = Math.min(Math.max(1, n), this.pageCount());
    if (next === this.current()) return;
    this.page.set(next);
    const top = this.host.querySelector('.content');
    if (top) {
      const y = top.getBoundingClientRect().top + scrollY - 90;
      if (scrollY > y) scrollTo({ top: Math.max(0, y), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }

  reset(): void {
    this.search.set('');
    this.selectedCats.set(new Set());
    this.selectedTags.set(new Set());
    this.priceMax.set(null);
    this.inStockOnly.set(false);
    this.sort.set('newest');
    this.page.set(1);
  }

  toggleFilters(): void {
    const open = !this.filtersOpen();
    this.filtersOpen.set(open);
    if (open) {
      requestAnimationFrame(() => {
        const panel = this.host.querySelector('.filters');
        if (panel) animate(panel, { opacity: [0, 1], translateX: [-30, 0], duration: 400, ease: 'outCubic' });
      });
    }
  }

  private normalize(s: string): string {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  }
}

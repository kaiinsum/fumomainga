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

const PAGE_SIZE = 8;

@Component({
  selector: 'app-products',
  imports: [FormsModule, ProductCardComponent, VndPipe],
  templateUrl: './products.html',
  styleUrl: './products.scss',
})
export class ProductsPage {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly service = inject(ProductService);

  readonly categories = inject(CategoryService).names;
  readonly allTags = this.service.allTags;
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
  readonly visible = signal(PAGE_SIZE);
  readonly filtersOpen = signal(false);

  readonly effectivePriceMax = computed(() => this.priceMax() ?? this.maxPrice());

  readonly filtered = computed(() => {
    const term = this.normalize(this.search().trim());
    const cats = this.selectedCats();
    const tags = this.selectedTags();
    const max = this.effectivePriceMax();
    const stock = this.inStockOnly();

    const list = this.service.products().filter(
      (p) =>
        (!term || this.normalize(`${p.name} ${p.description} ${p.tags.join(' ')}`).includes(term)) &&
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

  readonly shown = computed(() => this.filtered().slice(0, this.visible()));

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
        this.visible.set(PAGE_SIZE);
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
    this.visible.set(PAGE_SIZE);
  }

  setPrice(value: number): void {
    this.priceMax.set(value >= this.maxPrice() ? null : value);
  }

  loadMore(): void {
    const from = this.visible();
    this.visible.update((v) => v + PAGE_SIZE);
  }

  reset(): void {
    this.search.set('');
    this.selectedCats.set(new Set());
    this.selectedTags.set(new Set());
    this.priceMax.set(null);
    this.inStockOnly.set(false);
    this.sort.set('newest');
    this.visible.set(PAGE_SIZE);
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

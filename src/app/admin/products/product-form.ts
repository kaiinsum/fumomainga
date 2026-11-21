import { Component, ElementRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormControl, FormsModule, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { animate, stagger } from 'animejs';
import { toSignal } from '@angular/core/rxjs-interop';
import { buildProductSchema } from '../../core/seo-meta.service';
import {
  EMPTY_PRODUCT_SEO,
  Product,
  ProductArticleType,
  ProductInput,
  ProductSeo,
  ProductVariant,
  cheapest,
  discountPercent,
  finalPrice,
  onSale,
  productSeoOf,
} from '../../models/product';
import { CategoryService } from '../../services/category.service';
import { SettingsService } from '../../services/settings.service';
import { ProductService } from '../../services/product.service';
import { fileToResizedDataUrl } from '../../shared/image-utils';
import { SEO_LIMITS, SeoReport, analyzeProductSeo, scoreLevel, slugify } from '../../shared/seo';
import { VndPipe } from '../../shared/vnd.pipe';
import { CostService } from '../cost.service';
import { NoteService } from '../note.service';
import { siteSeoOf, splitKeywords } from '../../models/site-seo';
import { autoProductSeo } from '../../shared/seo-auto';
import { AdminToastService } from '../toast.service';

const MAX_IMAGES = 6;
const MAX_VARIANTS = 30;

/** Một dòng biến thể đang sửa: % giảm và giá sau giảm tự tính qua lại. */
interface VariantDraft {
  id: string;
  name: string;
  /** Ảnh riêng của biến thể ('' = dùng ảnh sản phẩm). */
  image: string;
  price: number | null;
  pct: number | null;
  sale: number | null;
}

const empty = (v: unknown) => v === null || v === undefined || String(v) === '';

/** % → giá sau giảm (làm tròn tới 1.000đ khi giá đủ lớn). null nếu % không hợp lệ. */
function saleFromPct(price: number, pctRaw: unknown): number | null {
  if (empty(pctRaw) || Number(pctRaw) <= 0 || !(price > 0)) return null;
  const pct = Math.min(99, Math.max(1, Math.round(Number(pctRaw))));
  let sale = price * (1 - pct / 100);
  sale = price >= 10000 ? Math.round(sale / 1000) * 1000 : Math.round(sale);
  return Math.min(sale, Math.max(0, price - 1));
}

/** Giá sau giảm → %. null nếu không tính được. */
function pctFromSale(price: number, saleRaw: unknown): number | null {
  if (empty(saleRaw)) return null;
  const sale = Number(saleRaw);
  return price > 0 && sale >= 0 && sale < price ? Math.round((1 - sale / price) * 100) : null;
}

@Component({
  selector: 'app-admin-product-form',
  imports: [ReactiveFormsModule, FormsModule, RouterLink, VndPipe, DatePipe],
  templateUrl: './product-form.html',
  styleUrl: './product-form.scss',
})
export class AdminProductForm {
  /** Có id => chế độ sửa (route /admin/san-pham/:id). */
  readonly id = input<string>();

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly service = inject(ProductService);
  private readonly router = inject(Router);
  private readonly toast = inject(AdminToastService);
  /** Giá nhập (chỉ admin) - lưu riêng, không nằm trong dữ liệu sản phẩm công khai. */
  readonly costSvc = inject(CostService);
  /** Bản nháp giá nhập: '' = giá nhập chung, còn lại = id biến thể. */
  readonly costDraft = signal<Record<string, number | null>>({});
  /** Ghi chú nội bộ - CHỈ admin (lưu riêng trên máy chủ, không nằm trong dữ liệu công khai). */
  readonly noteSvc = inject(NoteService);
  readonly noteDraft = signal('');
  readonly noteSaving = signal(false);

  readonly categories = inject(CategoryService).names;
  readonly maxImages = MAX_IMAGES;

  readonly images = signal<string[]>([]);
  readonly dragOver = signal(false);
  readonly processing = signal(false);
  readonly submitted = signal(false);
  readonly imageUrl = signal('');

  readonly editing = computed(() => {
    const id = this.id();
    return id ? this.service.getById(id) : undefined;
  });

  /** Số ngày hiện thông báo "Sản phẩm mới" cho khách (Cài đặt → Thông báo). */
  private readonly settingsSvc = inject(SettingsService);
  readonly notifyDays = inject(SettingsService).settings().notifyDays || 14;

  readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(80)]],
    category: [this.categories()[0] ?? '', Validators.required],
    price: [0, [Validators.required, Validators.min(0)]],
    description: ['', [Validators.required, Validators.minLength(10)]],
    tags: [''],
    inStock: [true],
    featured: [false],
    /** Ẩn khỏi cửa hàng (khách không thấy). */
    hidden: [false],
    /** Ngày ra mắt cho thông báo "Sản phẩm mới" (trống = ngày đăng). */
    releasedAt: [''],
    notice: [''],
  });

  // ---------- SEO (kiểu Rank Math) ----------
  readonly seo = signal<ProductSeo>({ ...EMPTY_PRODUCT_SEO });
  readonly seoTab = signal<'general' | 'advanced' | 'schema'>('general');
  readonly limits = SEO_LIMITS;
  readonly scoreLevel = scoreLevel;
  readonly shopName = inject(SettingsService).settings().shopName;
  readonly articleTypes: { value: ProductArticleType; label: string }[] = [
    { value: 'Article', label: 'Article - bài viết giới thiệu' },
    { value: 'BlogPosting', label: 'BlogPosting - bài blog' },
    { value: 'Review', label: 'Review - bài đánh giá sản phẩm' },
  ];
  private readonly formTick = toSignal(this.form.valueChanges);

  setSeo<K extends keyof ProductSeo>(key: K, value: ProductSeo[K]): void {
    this.seo.update((s) => ({ ...s, [key]: value }));
  }

  readonly report = computed<SeoReport>(() => {
    this.formTick();
    const v = this.form.getRawValue();
    return analyzeProductSeo({
      name: v.name,
      description: v.description,
      images: this.images(),
      tags: v.tags.split(',').map((t) => t.trim()).filter(Boolean),
      slug: slugify(this.slug()) || slugify(v.name),
      seo: this.seo(),
    });
  });

  /** Bản xem trước JSON-LD sẽ chèn vào trang sản phẩm. */
  readonly schemaPreview = computed(() => {
    this.formTick();
    const v = this.form.getRawValue();
    const variants = this.variants().map((x) => this.toVariant(x));
    const cur = this.editing();
    const p: Product = {
      id: cur?.id ?? 'moi',
      createdAt: cur?.createdAt ?? Date.now(),
      name: v.name || 'Tên sản phẩm',
      slug: slugify(this.slug()) || slugify(v.name) || 'san-pham',
      category: v.category,
      price: variants.length ? cheapest({ price: 0, variants }).price : Number(v.price) || 0,
      salePrice: variants.length ? (cheapest({ price: 0, variants }).salePrice ?? null) : this.salePrice.value,
      variants,
      description: v.description,
      images: this.images(),
      tags: v.tags.split(',').map((t) => t.trim()).filter(Boolean),
      inStock: v.inStock,
      featured: v.featured,
      releasedAt: v.releasedAt,
      seo: this.seo(),
    };
    return JSON.stringify(buildProductSchema({ product: p, url: `${this.origin}/san-pham/${p.slug}`, shopName: this.shopName }), null, 2);
  });

  /** Giảm giá: nhập % hoặc giá sau giảm - ô kia tự tính theo. Để trống cả hai = không giảm. */
  readonly salePercent = new FormControl<number | null>(null);
  readonly salePrice = new FormControl<number | null>(null);
  readonly saleError = signal('');

  // ---------- Đường dẫn (slug) ----------
  readonly origin = location.origin;
  readonly siteHost = location.host;
  readonly slug = signal('');
  /** true = admin tự sửa đường dẫn → thôi tự cập nhật theo tên. */
  readonly slugManual = signal(false);

  // ---------- Biến thể ----------
  readonly variants = signal<VariantDraft[]>([]);
  readonly maxVariants = MAX_VARIANTS;
  /** Ô "đặt giá cho mọi biến thể". */
  readonly bulkPrice = signal<number | null>(null);
  readonly bulkPct = signal<number | null>(null);
  /** Giá thấp nhất trong các biến thể (giá hiển thị "Từ ..."). */
  readonly variantMin = computed(() => {
    const list = this.variants().filter((v) => !empty(v.price)).map((v) => this.toVariant(v));
    return list.length ? finalPrice(cheapest({ price: 0, variants: list })) : 0;
  });

  setCost(key: string, raw: string): void {
    const v = raw === '' ? null : Math.max(0, Number(raw));
    this.costDraft.update((d) => ({ ...d, [key]: v === null || Number.isFinite(v) ? v : null }));
  }

  /** Lãi dự kiến 1 đơn vị (giá bán sau giảm − giá nhập). */
  margin(sell: number | null | undefined, key: string): number | null {
    const c = this.costDraft()[key] ?? (key ? this.costDraft()[''] : null) ?? null;
    if (c === null || sell === null || sell === undefined) return null;
    return Number(sell) - c;
  }

  private fillCosts(id: string | undefined, variantIds: string[]): void {
    const c = this.costSvc.costs();
    const d: Record<string, number | null> = { '': id && id in c ? c[id] : null };
    for (const vid of variantIds) d[vid] = id && `${id}::${vid}` in c ? c[`${id}::${vid}`] : null;
    this.costDraft.set(d);
  }

  /** Lưu ghi chú nội bộ theo id sản phẩm. */
  async saveNote(id = this.editing()?.id, quiet = true): Promise<void> {
    if (!id) return;
    this.noteSaving.set(true);
    try {
      await this.noteSvc.save(id, this.noteDraft());
      if (!quiet) this.toast.ok('Đã lưu ghi chú');
    } catch (e) {
      this.toast.err('Chưa lưu được ghi chú: ' + (e instanceof Error ? e.message : ''));
    } finally {
      this.noteSaving.set(false);
    }
  }

  /** Lưu giá nhập theo id sản phẩm (gọi sau khi lưu sản phẩm). */
  private async saveCosts(id: string): Promise<void> {
    const d = this.costDraft();
    const changes: Record<string, number | null> = { [id]: d[''] ?? null };
    const keep = new Set(this.variants().map((v) => v.id));
    for (const vid of keep) changes[`${id}::${vid}`] = d[vid] ?? null;
    // Biến thể đã xoá → bỏ giá nhập cũ.
    for (const k of Object.keys(this.costSvc.costs())) if (k.startsWith(id + '::') && !keep.has(k.slice(id.length + 2))) changes[k] = null;
    try {
      await this.costSvc.save(changes);
    } catch (e) {
      this.toast.err('Chưa lưu được giá nhập: ' + (e instanceof Error ? e.message : ''));
    }
  }

  /** Cắt khoảng trắng, chuẩn hoá trước khi lưu. */
  private cleanSeo(): ProductSeo {
    const s = this.seo();
    return {
      ...s,
      focusKeyword: s.focusKeyword.trim(),
      secondaryKeywords: splitKeywords(s.secondaryKeywords).join(', '),
      title: s.title.trim(),
      description: s.description.trim(),
      canonical: s.canonical.trim(),
      brand: s.brand.trim(),
      sku: s.sku.trim(),
      headline: s.headline.trim(),
      author: s.author.trim(),
      rating: Math.min(5, Math.max(1, Number(s.rating) || 5)),
    };
  }

  constructor() {
    // Mở từ Admin → Khai báo (?seo=1) → cuộn tới khung SEO.
    if (new URLSearchParams(location.search).get('seo')) {
      setTimeout(() => this.host.querySelector<HTMLElement>('.adm-box.seo')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
    }
    void this.costSvc.load().then(() => {
      const p = this.editing();
      this.fillCosts(p?.id, (p?.variants ?? []).map((v) => v.id));
    });
    void this.noteSvc.load().then(() => {
      const id = this.editing()?.id;
      if (id && !this.noteDraft()) this.noteDraft.set(this.noteSvc.noteOf(id)?.text ?? '');
    });
    // Gõ tên → đường dẫn tự cập nhật (khoảng trắng → -, bỏ dấu tiếng Việt).
    this.form.controls.name.valueChanges.subscribe((name) => {
      if (!this.slugManual()) this.slug.set(this.service.suggestSlug(name ?? '', this.editing()?.id));
    });
    // Đổi giá gốc khi đang giảm theo % → tính lại giá sau giảm.
    this.form.controls.price.valueChanges.subscribe(() => {
      if (this.salePercent.value) this.onPercentInput();
      else this.checkSale();
    });
    // Chỉ chạy khi đổi sản phẩm cần sửa (theo id), không chạy lại mỗi khi dữ liệu thay đổi.
    effect(() => {
      const id = this.id();
      untracked(() => {
        const p = id ? this.service.getById(id) : undefined;
        if (p) {
          this.form.reset({
            name: p.name,
            category: p.category,
            price: p.price,
            description: p.description,
            tags: p.tags.join(', '),
            inStock: p.inStock,
            featured: p.featured,
            hidden: !!p.hidden,
            releasedAt: p.releasedAt ?? '',
            notice: p.notice ?? '',
          });
          this.images.set([...p.images]);
          this.seo.set(productSeoOf(p));
          this.noteDraft.set(this.noteSvc.noteOf(p.id)?.text ?? '');
          this.slug.set(p.slug ?? this.service.suggestSlug(p.name, p.id));
          // Đường dẫn đã sửa tay (khác tên) thì giữ nguyên khi đổi tên.
          this.slugManual.set(!!p.slug && slugify(p.name) !== p.slug.replace(/-\d+$/, '') && slugify(p.name) !== p.slug);
          this.salePrice.setValue(onSale(p) ? (p.salePrice as number) : null);
          this.salePercent.setValue(onSale(p) ? discountPercent(p) : null);
          this.fillCosts(p.id, (p.variants ?? []).map((v) => v.id));
          this.variants.set(
            (p.variants ?? []).map((v) => ({
              id: v.id,
              name: v.name,
              image: v.image ?? '',
              price: v.price,
              sale: onSale(v) ? (v.salePrice as number) : null,
              pct: onSale(v) ? discountPercent(v) : null,
            })),
          );
        } else {
          this.variants.set([]);
          this.costDraft.set({});
          this.slug.set('');
          this.slugManual.set(false);
          this.salePrice.setValue(null);
          this.salePercent.setValue(null);
          this.form.reset({ category: this.categories()[0] ?? '' });
          this.images.set([]);
          this.seo.set({ ...EMPTY_PRODUCT_SEO });
          this.noteDraft.set('');
        }
        this.submitted.set(false);
      });
    });
  }

  // ---------- Ảnh ----------
  onFiles(event: Event): void {
    const el = event.target as HTMLInputElement;
    if (el.files) this.addFiles(Array.from(el.files));
    el.value = '';
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    if (event.dataTransfer?.files) this.addFiles(Array.from(event.dataTransfer.files));
  }

  private async addFiles(files: File[]): Promise<void> {
    const room = MAX_IMAGES - this.images().length;
    const valid = files.filter((f) => f.type.startsWith('image/')).slice(0, room);
    if (!valid.length) {
      if (room <= 0) this.toast.err(`Tối đa ${MAX_IMAGES} ảnh cho mỗi sản phẩm.`);
      return;
    }
    this.processing.set(true);
    try {
      const urls = await Promise.all(valid.map((f) => fileToResizedDataUrl(f)));
      const start = this.images().length;
      this.images.update((l) => [...l, ...urls]);
      requestAnimationFrame(() => this.popIn(start));
    } catch {
      this.toast.err('Không đọc được một số ảnh. Hãy thử định dạng JPG/PNG/WebP.');
    } finally {
      this.processing.set(false);
    }
  }

  addImageUrl(): void {
    const url = this.imageUrl().trim();
    if (!/^https?:\/\/\S+$/i.test(url)) return this.toast.err('Link ảnh phải bắt đầu bằng http:// hoặc https://');
    if (this.images().length >= MAX_IMAGES) return this.toast.err(`Tối đa ${MAX_IMAGES} ảnh cho mỗi sản phẩm.`);
    const start = this.images().length;
    this.images.update((l) => [...l, url]);
    this.imageUrl.set('');
    requestAnimationFrame(() => this.popIn(start));
  }

  private popIn(from: number): void {
    const items = Array.from(this.host.querySelectorAll('.previews .preview')).slice(from);
    animate(items, { scale: [0, 1], rotate: [-12, 0], delay: stagger(80), duration: 700, ease: 'outElastic(1, .6)' });
  }

  removeImage(index: number): void {
    const el = this.host.querySelectorAll('.previews .preview')[index];
    const done = () => this.images.update((l) => l.filter((_, i) => i !== index));
    if (!el) return done();
    animate(el, { scale: [1, 0], opacity: [1, 0], duration: 250, ease: 'inBack', onComplete: done });
  }

  makeCover(index: number): void {
    this.images.update((l) => [l[index], ...l.filter((_, i) => i !== index)]);
    requestAnimationFrame(() => {
      const first = this.host.querySelector('.previews .preview');
      if (first) animate(first, { scale: [0.85, 1], duration: 500, ease: 'outBack' });
    });
  }

  // ---------- Lưu ----------
  submit(): void {
    this.submitted.set(true);
    if (this.form.invalid || !this.images().length) {
      this.form.markAllAsTouched();
      animate(this.host.querySelector('.adm-edit')!, { translateX: [0, -12, 10, -8, 6, 0], duration: 500, ease: 'inOutSine' });
      this.toast.err('Vui lòng điền các trường đang tô đỏ.');
      this.focusFirstError();
      return;
    }

    const variantErr = this.variantError();
    if (variantErr) {
      this.toast.err(variantErr);
      return;
    }
    const variants: ProductVariant[] = this.variants().map((v) => this.toVariant(v));
    if (!variants.length && !this.checkSale()) {
      this.toast.err(this.saleError());
      return;
    }
    const v = this.form.getRawValue();
    const data: ProductInput = {
      ...v,
      name: v.name.trim(),
      description: v.description.trim(),
      releasedAt: v.releasedAt.trim(),
      notice: v.notice.trim(),
      // Có biến thể → giá sản phẩm = biến thể rẻ nhất (để lọc / sắp xếp / thẻ sản phẩm dùng chung).
      price: variants.length ? cheapest({ price: 0, variants }).price : Number(v.price),
      salePrice: variants.length ? (cheapest({ price: 0, variants }).salePrice ?? null) : this.validSale(),
      variants,
      slug: slugify(this.slug()) || slugify(v.name),
      tags: [...new Set(v.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))],
      images: this.images(),
      seo: this.cleanSeo(),
    };
    // Khai báo → "Tự động khai báo khi lưu": điền ô SEO còn trống (từ khoá, tiêu đề, mô tả, schema Product).
    const settingsNow = this.settingsSvc.settings();
    if (siteSeoOf(settingsNow).autoFill) {
      const cur = this.editing();
      const filled = autoProductSeo({ ...data, id: cur?.id ?? '', createdAt: cur?.createdAt ?? Date.now() }, { shopName: settingsNow.shopName });
      data.seo = cur ? filled : { ...filled, sku: data.seo?.sku ?? '' };
      this.seo.set(data.seo);
    }

    const current = this.editing();
    if (current) {
      if (this.toast.run(() => this.service.update(current.id, data), 'Đã cập nhật sản phẩm')) {
        void this.saveCosts(current.id);
        void this.saveNote(current.id);
      }
    } else {
      let createdId = '';
      const ok = this.toast.run(() => (createdId = this.service.add(data).id), 'Đã đăng sản phẩm');
      if (ok) {
        const id = createdId;
        void Promise.all([this.saveCosts(id), this.saveNote(id)]).then(() => this.router.navigate(['/admin/san-pham', id]));
      }
    }
  }

  onSlugInput(value: string): void {
    this.slugManual.set(true);
    // Gõ khoảng trắng thì đổi ngay thành dấu -.
    this.slug.set(value.replace(/\s+/g, '-'));
  }

  normalizeSlug(): void {
    const s = slugify(this.slug());
    if (!s) return this.resetSlug();
    this.slug.set(s);
  }

  resetSlug(): void {
    this.slugManual.set(false);
    this.slug.set(this.service.suggestSlug(this.form.controls.name.value, this.editing()?.id));
  }

  // ---------- Biến thể ----------
  addVariant(): void {
    if (this.variants().length >= MAX_VARIANTS) return this.toast.err(`Tối đa ${MAX_VARIANTS} biến thể.`);
    // Biến thể đầu tiên lấy sẵn giá + giảm giá hiện tại của sản phẩm.
    const first = !this.variants().length;
    const price = first ? Number(this.form.controls.price.value) || null : (this.variants().at(-1)?.price ?? null);
    const sale = first ? this.validSale() : null;
    this.variants.update((list) => [
      ...list,
      { id: crypto.randomUUID().slice(0, 8), name: '', image: '', price, sale, pct: price ? pctFromSale(price, sale) : null },
    ]);
    requestAnimationFrame(() => (this.host.querySelector('.var-row:last-child .v-name') as HTMLInputElement | null)?.focus());
  }

  /** Chọn ảnh riêng cho biến thể (thu nhỏ như ảnh sản phẩm). */
  async onVariantImage(i: number, event: Event): Promise<void> {
    const el = event.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const url = await fileToResizedDataUrl(file);
      this.variants.update((list) => list.map((v, j) => (j === i ? { ...v, image: url } : v)));
    } catch {
      this.toast.err('Không đọc được ảnh. Hãy thử định dạng JPG/PNG/WebP.');
    }
  }

  /** Dùng một ảnh sản phẩm có sẵn làm ảnh biến thể. */
  pickVariantImage(i: number, url: string): void {
    this.variants.update((list) => list.map((v, j) => (j === i ? { ...v, image: url } : v)));
    this.imgPicker.set(null);
  }

  clearVariantImage(i: number): void {
    this.variants.update((list) => list.map((v, j) => (j === i ? { ...v, image: '' } : v)));
  }

  /** Biến thể đang mở bảng chọn ảnh có sẵn. */
  readonly imgPicker = signal<number | null>(null);

  removeVariant(i: number): void {
    this.variants.update((list) => list.filter((_, j) => j !== i));
  }

  moveVariant(i: number, dir: -1 | 1): void {
    this.variants.update((list) => {
      const next = [...list];
      const j = i + dir;
      if (j < 0 || j >= next.length) return list;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  /** Sửa 1 ô của 1 biến thể; % và giá giảm tự đồng bộ. */
  setVariant(i: number, field: 'name' | 'price' | 'pct' | 'sale', value: string): void {
    this.variants.update((list) =>
      list.map((v, j) => {
        if (j !== i) return v;
        const d = { ...v };
        if (field === 'name') d.name = value;
        else {
          const n = value === '' ? null : Number(value);
          if (field === 'price') {
            d.price = n;
            if (d.pct) d.sale = saleFromPct(n ?? 0, d.pct);
          } else if (field === 'pct') {
            d.pct = n;
            d.sale = saleFromPct(d.price ?? 0, n);
          } else {
            d.sale = n;
            d.pct = pctFromSale(d.price ?? 0, n);
          }
        }
        return d;
      }),
    );
  }

  /** Nút "Áp dụng cho mọi biến thể": đặt cùng giá và/hoặc cùng % giảm. */
  applyBulk(): void {
    const price = this.bulkPrice();
    const pct = this.bulkPct();
    if (empty(price) && empty(pct)) return this.toast.err('Nhập giá chung và/hoặc % giảm chung trước.');
    if (!empty(price) && Number(price) < 0) return this.toast.err('Giá không được âm.');
    this.variants.update((list) =>
      list.map((v) => {
        const d = { ...v };
        if (!empty(price)) d.price = Math.round(Number(price));
        if (!empty(pct)) d.pct = Number(pct) > 0 ? Number(pct) : null;
        d.sale = d.pct ? saleFromPct(d.price ?? 0, d.pct) : empty(price) ? d.sale : null;
        if (!d.pct) d.sale = d.sale !== null && d.price !== null && d.sale < d.price ? d.sale : null;
        return d;
      }),
    );
    this.toast.ok(`Đã đặt giá cho ${this.variants().length} biến thể`);
  }

  /** Lỗi của 1 dòng biến thể (hiện ngay dưới dòng). */
  rowError(v: VariantDraft): string {
    if (empty(v.price)) return 'Chưa nhập giá.';
    if (Number(v.price) < 0) return 'Giá không được âm.';
    if (!empty(v.sale) && (Number(v.sale) < 0 || Number(v.sale) >= Number(v.price))) return 'Giá sau giảm phải nhỏ hơn giá.';
    return '';
  }

  private variantError(): string {
    const list = this.variants();
    const names = new Set<string>();
    for (const [i, v] of list.entries()) {
      const name = v.name.trim();
      if (!name) return `Biến thể #${i + 1} chưa có tên.`;
      if (names.has(name.toLowerCase())) return `Tên biến thể "${name}" bị trùng.`;
      names.add(name.toLowerCase());
      const err = this.rowError(v);
      if (err) return `Biến thể "${name}": ${err}`;
    }
    return '';
  }

  private toVariant(v: VariantDraft): ProductVariant {
    const price = Math.round(Number(v.price) || 0);
    const sale = empty(v.sale) ? null : Math.round(Number(v.sale));
    return {
      id: v.id,
      name: v.name.trim().slice(0, 60),
      price,
      salePrice: sale !== null && sale >= 0 && sale < price ? sale : null,
      ...(v.image ? { image: v.image } : {}),
    };
  }

  // ---------- Giảm giá ----------
  /** Nhập % → tính giá sau giảm (làm tròn tới 1.000đ khi giá đủ lớn). */
  onPercentInput(): void {
    const price = Number(this.form.controls.price.value) || 0;
    const raw = this.salePercent.value;
    if (raw === null || raw === undefined || String(raw) === '' || Number(raw) <= 0) {
      this.salePrice.setValue(null, { emitEvent: false });
      this.checkSale();
      return;
    }
    const pct = Math.min(99, Math.max(1, Math.round(Number(raw))));
    let sale = price * (1 - pct / 100);
    sale = price >= 10000 ? Math.round(sale / 1000) * 1000 : Math.round(sale);
    this.salePrice.setValue(Math.min(sale, Math.max(0, price - 1)), { emitEvent: false });
    this.checkSale();
  }

  /** Nhập giá sau giảm → tính %. */
  onSalePriceInput(): void {
    const price = Number(this.form.controls.price.value) || 0;
    const raw = this.salePrice.value;
    if (raw === null || raw === undefined || String(raw) === '') {
      this.salePercent.setValue(null, { emitEvent: false });
    } else if (price > 0 && Number(raw) < price && Number(raw) >= 0) {
      this.salePercent.setValue(Math.round((1 - Number(raw) / price) * 100), { emitEvent: false });
    }
    this.checkSale();
  }

  clearSale(): void {
    this.salePercent.setValue(null);
    this.salePrice.setValue(null);
    this.saleError.set('');
  }

  /** Giá sau giảm hợp lệ (nhỏ hơn giá gốc) hoặc null nếu không giảm. */
  private validSale(): number | null {
    const raw = this.salePrice.value;
    if (raw === null || raw === undefined || String(raw) === '') return null;
    return Math.round(Number(raw));
  }

  /** Kiểm tra giá sau giảm; trả về false và ghi lỗi nếu không hợp lệ. */
  checkSale(): boolean {
    const sale = this.validSale();
    const price = Number(this.form.controls.price.value) || 0;
    const err = sale === null ? '' : sale < 0 ? 'Giá sau giảm không được âm.' : sale >= price ? 'Giá sau giảm phải nhỏ hơn giá gốc.' : '';
    this.saleError.set(err);
    return !err;
  }

  remove(): void {
    const p = this.editing();
    if (!p || !confirm(`Xoá sản phẩm "${p.name}"?`)) return;
    if (this.toast.run(() => this.service.remove(p.id), 'Đã xoá sản phẩm')) this.router.navigate(['/admin/san-pham']);
  }

  /** Cuộn tới (và đặt con trỏ vào) trường đang lỗi đầu tiên. */
  private focusFirstError(): void {
    setTimeout(() => {
      const el = this.host.querySelector<HTMLElement>('.ng-invalid[formcontrolname], .invalid-box, .var-row.bad input');
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (el && el.tagName !== 'LABEL') el.focus({ preventScroll: true });
    });
  }

  invalid(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }
}

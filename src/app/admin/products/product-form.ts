import { Component, ElementRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { animate, stagger } from 'animejs';
import { ProductInput, ProductSize, SIZES } from '../../models/product';
import { CategoryService } from '../../services/category.service';
import { ProductService } from '../../services/product.service';
import { fileToResizedDataUrl } from '../../shared/image-utils';
import { VndPipe } from '../../shared/vnd.pipe';
import { AdminToastService } from '../toast.service';

const MAX_IMAGES = 6;

@Component({
  selector: 'app-admin-product-form',
  imports: [ReactiveFormsModule, FormsModule, RouterLink, VndPipe],
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

  readonly categories = inject(CategoryService).names;
  readonly sizes = SIZES;
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

  readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(80)]],
    category: [this.categories()[0] ?? '', Validators.required],
    price: [0, [Validators.required, Validators.min(0)]],
    size: ['M' as ProductSize, Validators.required],
    description: ['', [Validators.required, Validators.minLength(10)]],
    tags: [''],
    inStock: [true],
    featured: [false],
  });

  constructor() {
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
            size: p.size,
            description: p.description,
            tags: p.tags.join(', '),
            inStock: p.inStock,
            featured: p.featured,
          });
          this.images.set([...p.images]);
        } else {
          this.form.reset({ category: this.categories()[0] ?? '' });
          this.images.set([]);
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
      this.toast.err('Vui lòng kiểm tra lại các trường bắt buộc.');
      return;
    }

    const v = this.form.getRawValue();
    const data: ProductInput = {
      ...v,
      name: v.name.trim(),
      description: v.description.trim(),
      price: Number(v.price),
      tags: [...new Set(v.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))],
      images: this.images(),
    };

    const current = this.editing();
    if (current) {
      this.toast.run(() => this.service.update(current.id, data), 'Đã cập nhật sản phẩm');
    } else {
      let createdId = '';
      const ok = this.toast.run(() => (createdId = this.service.add(data).id), 'Đã đăng sản phẩm');
      if (ok) this.router.navigate(['/admin/san-pham', createdId]);
    }
  }

  remove(): void {
    const p = this.editing();
    if (!p || !confirm(`Xoá sản phẩm "${p.name}"?`)) return;
    if (this.toast.run(() => this.service.remove(p.id), 'Đã xoá sản phẩm')) this.router.navigate(['/admin/san-pham']);
  }

  invalid(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }
}

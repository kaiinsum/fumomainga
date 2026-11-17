import { Component, ElementRef, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { animate, stagger } from 'animejs';
import { Product } from '../../models/product';
import { CategoryService } from '../../services/category.service';
import { ProductService } from '../../services/product.service';
import { VndPipe } from '../../shared/vnd.pipe';
import { AdminToastService } from '../toast.service';

type Tab = 'all' | 'in' | 'out' | 'featured';
type Bulk = '' | 'delete' | 'in' | 'out' | 'feature' | 'unfeature';

@Component({
  selector: 'app-admin-products-list',
  imports: [FormsModule, RouterLink, DatePipe, VndPipe],
  template: `
    <div class="adm-head">
      <h1>Sản phẩm</h1>
      <a class="btn primary small" routerLink="/admin/san-pham/moi">+ Thêm mới</a>
      <a class="btn ghost small" routerLink="/admin/san-pham/excel">⇅ Nhập / xuất Excel</a>
    </div>

    <nav class="adm-tabs">
      @for (t of tabs(); track t.key) {
        <button type="button" [class.on]="tab() === t.key" (click)="setTab(t.key)">
          {{ t.label }} <span class="count">({{ t.count }})</span>
        </button>
      }
    </nav>

    <div class="adm-toolbar">
      <select [(ngModel)]="bulk" aria-label="Thao tác hàng loạt">
        <option value="">Thao tác hàng loạt</option>
        <option value="in">Đánh dấu còn hàng</option>
        <option value="out">Đánh dấu hết hàng</option>
        <option value="feature">Đặt nổi bật</option>
        <option value="unfeature">Bỏ nổi bật</option>
        <option value="delete">Xoá</option>
      </select>
      <button class="btn ghost small" type="button" [disabled]="!bulk || !selected().size" (click)="applyBulk()">
        Áp dụng
      </button>
      <select [ngModel]="category()" (ngModelChange)="category.set($event)" aria-label="Lọc danh mục">
        <option value="">Tất cả danh mục</option>
        @for (c of categories(); track c) {
          <option [value]="c">{{ c }}</option>
        }
      </select>
      <span class="spacer"></span>
      <input type="search" placeholder="Tìm sản phẩm..." [ngModel]="search()" (ngModelChange)="search.set($event)" />
    </div>

    <div class="adm-table-wrap">
      <table class="adm-table">
        <thead>
          <tr>
            <th style="width: 32px">
              <input type="checkbox" [checked]="allSelected()" (change)="toggleAll()" aria-label="Chọn tất cả" />
            </th>
            <th style="width: 64px">Ảnh</th>
            <th>Tên</th>
            <th>Danh mục</th>
            <th>Giá</th>
            <th>Kho</th>
            <th title="Nổi bật">★</th>
            <th>Ngày đăng</th>
          </tr>
        </thead>
        <tbody>
          @for (p of rows(); track p.id) {
            <tr [attr.data-row]="p.id">
              <td><input type="checkbox" [checked]="selected().has(p.id)" (change)="toggleOne(p.id)" /></td>
              <td><img class="thumb" [src]="p.images[0]" [alt]="p.name" /></td>
              <td class="title-cell">
                <a [routerLink]="['/admin/san-pham', p.id]">{{ p.name }}</a>
                <div class="row-actions">
                  <a [routerLink]="['/admin/san-pham', p.id]">Sửa</a>
                  <a [href]="'/san-pham/' + p.id" target="_blank" rel="noopener">Xem</a>
                  <button type="button" class="del" (click)="remove(p)">Xoá</button>
                </div>
              </td>
              <td>{{ p.category }}</td>
              <td>{{ p.price | vnd }}</td>
              <td>
                <button type="button" class="status-btn" (click)="toggleStock(p)" title="Bấm để đổi">
                  <span class="status" [class.off]="!p.inStock">{{ p.inStock ? 'Còn hàng' : 'Hết hàng' }}</span>
                </button>
              </td>
              <td>
                <button type="button" class="star-btn" [class.on]="p.featured" (click)="toggleFeatured(p, $event)">★</button>
              </td>
              <td>{{ p.createdAt | date: 'dd/MM/yyyy' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="8" class="empty">Không có sản phẩm nào.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `.status-btn { background: none; border: none; padding: 0; cursor: pointer; }`,
})
export class AdminProductsList {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly service = inject(ProductService);
  private readonly toast = inject(AdminToastService);

  /** ?danhMuc=... (từ trang Danh mục) để lọc sẵn. */
  readonly danhMuc = input<string>();
  readonly categories = inject(CategoryService).names;
  readonly tab = signal<Tab>('all');
  readonly search = signal('');
  readonly category = signal('');
  readonly selected = signal<Set<string>>(new Set());
  bulk: Bulk = '';

  constructor() {
    effect(() => this.category.set(this.danhMuc() ?? ''));
  }

  readonly tabs = computed(() => {
    const all = this.service.products();
    return [
      { key: 'all' as Tab, label: 'Tất cả', count: all.length },
      { key: 'in' as Tab, label: 'Còn hàng', count: all.filter((p) => p.inStock).length },
      { key: 'out' as Tab, label: 'Hết hàng', count: all.filter((p) => !p.inStock).length },
      { key: 'featured' as Tab, label: 'Nổi bật', count: all.filter((p) => p.featured).length },
    ];
  });

  readonly rows = computed(() => {
    const term = this.search().trim().toLowerCase();
    const cat = this.category();
    const tab = this.tab();
    return [...this.service.products()]
      .filter(
        (p) =>
          (tab === 'all' || (tab === 'in' && p.inStock) || (tab === 'out' && !p.inStock) || (tab === 'featured' && p.featured)) &&
          (!cat || p.category === cat) &&
          (!term || p.name.toLowerCase().includes(term)),
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  });

  readonly allSelected = computed(() => {
    const rows = this.rows();
    return rows.length > 0 && rows.every((r) => this.selected().has(r.id));
  });

  setTab(t: Tab): void {
    this.tab.set(t);
    this.selected.set(new Set());
    requestAnimationFrame(() =>
      animate(this.host.querySelectorAll('tbody tr'), {
        opacity: [0, 1],
        translateX: [-12, 0],
        delay: stagger(30),
        duration: 350,
        ease: 'outCubic',
      }),
    );
  }

  toggleOne(id: string): void {
    this.selected.update((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  toggleAll(): void {
    this.selected.set(this.allSelected() ? new Set() : new Set(this.rows().map((r) => r.id)));
  }

  toggleStock(p: Product): void {
    this.toast.run(() => this.service.update(p.id, { inStock: !p.inStock }), `"${p.name}": ${p.inStock ? 'hết hàng' : 'còn hàng'}`);
  }

  toggleFeatured(p: Product, e: MouseEvent): void {
    animate(e.currentTarget as HTMLElement, { scale: [1, 1.6, 1], rotate: [0, 72], duration: 600, ease: 'outElastic(1, .5)' });
    this.toast.run(() => this.service.update(p.id, { featured: !p.featured }), p.featured ? 'Đã bỏ nổi bật' : 'Đã đặt nổi bật');
  }

  remove(p: Product): void {
    if (!confirm(`Xoá sản phẩm "${p.name}"?`)) return;
    this.fadeRows([p.id], () => void this.toast.run(() => this.service.remove(p.id), 'Đã xoá sản phẩm'));
  }

  applyBulk(): void {
    const ids = [...this.selected()];
    if (!ids.length || !this.bulk) return;
    if (this.bulk === 'delete') {
      if (!confirm(`Xoá ${ids.length} sản phẩm đã chọn?`)) return;
      this.fadeRows(ids, () => void this.toast.run(() => ids.forEach((id) => this.service.remove(id)), `Đã xoá ${ids.length} sản phẩm`));
    } else {
      const patch = {
        in: { inStock: true },
        out: { inStock: false },
        feature: { featured: true },
        unfeature: { featured: false },
      }[this.bulk];
      this.toast.run(() => ids.forEach((id) => this.service.update(id, patch)), `Đã cập nhật ${ids.length} sản phẩm`);
    }
    this.selected.set(new Set());
    this.bulk = '';
  }

  private fadeRows(ids: string[], done: () => void): void {
    const rows = ids.map((id) => this.host.querySelector(`[data-row="${id}"]`)).filter((r): r is Element => !!r);
    if (!rows.length) return done();
    animate(rows, { opacity: [1, 0], translateX: [0, 40], duration: 300, ease: 'inQuad', onComplete: done });
  }
}

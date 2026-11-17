import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductInput } from '../../models/product';
import { CategoryService } from '../../services/category.service';
import { ProductService } from '../../services/product.service';
import { downloadBlob } from '../../shared/download';
import { placeholderImage } from '../../shared/placeholder';
import { ImportPlan, ImportRow, buildProductsWorkbook, planImport, readProductsFile } from '../../shared/product-excel';
import { VndPipe } from '../../shared/vnd.pipe';
import { AdminToastService } from '../toast.service';

type Filter = 'changed' | 'all' | 'error';

@Component({
  selector: 'app-admin-products-excel',
  imports: [RouterLink, VndPipe],
  template: `
    <div class="adm-head">
      <h1>Nhập / xuất Excel</h1>
      <a class="btn ghost small" routerLink="/admin/san-pham">← Danh sách sản phẩm</a>
    </div>

    <div class="cards">
      <section class="adm-box">
        <h2>1. Tải file Excel</h2>
        <div class="box-body">
          <p class="hint">
            File gồm toàn bộ {{ products().length }} sản phẩm hiện có, kèm ô chọn sẵn cho Danh mục, Còn hàng, Nổi bật
            và sheet hướng dẫn. Không có hình ảnh.
          </p>
          <div class="row-btns">
            <button class="btn primary small" type="button" [disabled]="busy()" (click)="download(false)">⬇ Xuất sản phẩm</button>
            <button class="btn ghost small" type="button" [disabled]="busy()" (click)="download(true)">⬇ File mẫu trống</button>
          </div>
        </div>
      </section>

      <section class="adm-box">
        <h2>2. Tải file đã sửa lên</h2>
        <div class="box-body">
          <p class="hint">
            Có <b>Mã SP</b> → cập nhật; để trống Mã SP → thêm mới. Sản phẩm không có trong file giữ nguyên.
            Bạn sẽ được xem trước thay đổi trước khi áp dụng.
          </p>
          <label class="btn primary small" [class.disabled]="busy()">
            ⬆ Chọn file .xlsx
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden (change)="upload($event)" />
          </label>
        </div>
      </section>

      <section class="adm-box">
        <h2>🖼 Hình ảnh quản lý riêng</h2>
        <div class="box-body">
          <p class="hint">
            Excel chỉ cập nhật thông tin. Ảnh hiện có của sản phẩm được giữ nguyên. Sản phẩm thêm mới qua Excel sẽ có ảnh tạm —
            vào trang sửa sản phẩm để tải ảnh thật.
          </p>
        </div>
      </section>
    </div>

    @if (busy()) {
      <div class="adm-notice">⏳ Đang xử lý file...</div>
    }

    @if (plan(); as pl) {
      <section class="adm-box preview">
        <h2>Xem trước: {{ fileName() }}</h2>
        <div class="box-body">
          <div class="summary">
            <span class="pill new">+ {{ pl.counts.new }} thêm mới</span>
            <span class="pill upd">✎ {{ pl.counts.update }} cập nhật</span>
            <span class="pill same">= {{ pl.counts.same }} không đổi</span>
            <span class="pill err">⚠ {{ pl.counts.error }} lỗi</span>
          </div>

          @if (pl.counts.error) {
            <div class="adm-notice warn">
              Các dòng lỗi sẽ bị <b>bỏ qua</b>. Sửa trong Excel rồi tải lại nếu muốn nhập cả những dòng này.
            </div>
          }

          <nav class="adm-tabs">
            <button type="button" [class.on]="filter() === 'changed'" (click)="filter.set('changed')">
              Có thay đổi <span class="count">({{ pl.counts.new + pl.counts.update }})</span>
            </button>
            <button type="button" [class.on]="filter() === 'error'" (click)="filter.set('error')">
              Lỗi <span class="count">({{ pl.counts.error }})</span>
            </button>
            <button type="button" [class.on]="filter() === 'all'" (click)="filter.set('all')">
              Tất cả <span class="count">({{ pl.rows.length }})</span>
            </button>
          </nav>

          <div class="adm-table-wrap">
            <table class="adm-table">
              <thead>
                <tr>
                  <th style="width: 60px">Dòng</th>
                  <th style="width: 110px">Kết quả</th>
                  <th>Sản phẩm</th>
                  <th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                @for (r of visibleRows(); track r.line) {
                  <tr [class]="'k-' + r.kind">
                    <td>{{ r.line }}</td>
                    <td><span class="pill" [class]="pillClass[r.kind]">{{ kindLabel[r.kind] }}</span></td>
                    <td>
                      <b>{{ r.name }}</b>
                      @if (r.data) {
                        <div class="sub">{{ r.data.category }} · {{ r.data.price | vnd }}@if (r.data.salePrice !== null && r.data.salePrice !== undefined) { → giảm còn {{ r.data.salePrice | vnd }} }</div>
                      }
                    </td>
                    <td>
                      @if (r.kind === 'error') {
                        <ul class="errs">
                          @for (e of r.errors; track e) { <li>{{ e }}</li> }
                        </ul>
                      } @else if (r.kind === 'update') {
                        Đổi: {{ r.changes.join(', ') }}
                      } @else if (r.kind === 'new') {
                        Sản phẩm mới (ảnh tạm)
                      } @else {
                        —
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="4" class="empty">Không có dòng nào.</td></tr>
                }
              </tbody>
            </table>
          </div>

          <div class="row-btns end">
            <button class="btn ghost small" type="button" (click)="plan.set(null)">Huỷ</button>
            <button class="btn primary small" type="button" [disabled]="!pl.counts.new && !pl.counts.update" (click)="apply()">
              Áp dụng {{ pl.counts.new + pl.counts.update }} thay đổi
            </button>
          </div>
        </div>
      </section>
    }
  `,
  styles: `
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-bottom: 20px; }
    .hint { color: #646970; font-size: 0.875rem; margin: 0; }
    .row-btns { display: flex; gap: 8px; flex-wrap: wrap; }
    .row-btns.end { justify-content: flex-end; }
    label.btn { align-self: flex-start; }
    label.btn.disabled { opacity: 0.5; pointer-events: none; }
    .summary { display: flex; gap: 8px; flex-wrap: wrap; }
    .pill { display: inline-block; font-size: 0.78rem; font-weight: 800; padding: 3px 10px; border-radius: 999px; background: #f0f0f1; color: #50575e; white-space: nowrap; }
    .pill.new { background: var(--primary-100); color: var(--primary-ink); }
    .pill.upd { background: var(--primary); color: #fff; }
    .pill.err { background: #fff; color: var(--error, #b32d2e); border: 1px solid currentColor; }
    .sub { font-size: 0.8rem; color: #646970; }
    .errs { margin: 0; padding-left: 18px; color: var(--error, #b32d2e); font-size: 0.85rem; }
    .adm-tabs { margin-bottom: 0; }
  `,
})
export class AdminProductsExcel {
  private readonly productsSvc = inject(ProductService);
  private readonly categories = inject(CategoryService);
  private readonly toast = inject(AdminToastService);

  readonly products = this.productsSvc.products;
  readonly busy = signal(false);
  readonly plan = signal<ImportPlan | null>(null);
  readonly fileName = signal('');
  readonly filter = signal<Filter>('changed');

  readonly kindLabel: Record<ImportRow['kind'], string> = { new: 'Thêm mới', update: 'Cập nhật', same: 'Không đổi', error: 'Lỗi' };
  readonly pillClass: Record<ImportRow['kind'], string> = { new: 'new', update: 'upd', same: 'same', error: 'err' };

  readonly visibleRows = computed(() => {
    const rows = this.plan()?.rows ?? [];
    const f = this.filter();
    if (f === 'all') return rows;
    if (f === 'error') return rows.filter((r) => r.kind === 'error');
    return rows.filter((r) => r.kind === 'new' || r.kind === 'update');
  });

  async download(blank: boolean): Promise<void> {
    this.busy.set(true);
    try {
      const list = blank ? [] : [...this.products()].sort((a, b) => b.createdAt - a.createdAt);
      const blob = await buildProductsWorkbook(list, this.categories.names());
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, blank ? 'mau-san-pham.xlsx' : `san-pham-${date}.xlsx`);
    } catch {
      this.toast.err('Không tạo được file Excel.');
    } finally {
      this.busy.set(false);
    }
  }

  async upload(event: Event): Promise<void> {
    const el = event.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    this.busy.set(true);
    this.plan.set(null);
    try {
      const raw = await readProductsFile(file);
      if (!raw.length) throw new Error('File không có dòng dữ liệu nào.');
      const plan = planImport(raw, this.products(), this.categories.names());
      this.fileName.set(file.name);
      this.filter.set(plan.counts.new + plan.counts.update ? 'changed' : plan.counts.error ? 'error' : 'all');
      this.plan.set(plan);
    } catch (e) {
      this.toast.err(e instanceof Error ? e.message : 'Không đọc được file.');
    } finally {
      this.busy.set(false);
    }
  }

  apply(): void {
    const plan = this.plan();
    if (!plan) return;
    const updates = plan.rows.filter((r) => r.kind === 'update').map((r) => ({ id: r.id!, patch: r.data! }));
    const adds: ProductInput[] = plan.rows
      .filter((r) => r.kind === 'new')
      .map((r, i) => ({ ...r.data!, images: [placeholderImage(r.data!.name.slice(0, 18), i)] }));
    const ok = this.toast.run(
      () => this.productsSvc.applyImport(updates, adds),
      `Đã cập nhật ${updates.length} và thêm ${adds.length} sản phẩm`,
    );
    if (ok) this.plan.set(null);
  }
}

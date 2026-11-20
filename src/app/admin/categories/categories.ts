import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Category } from '../../models/product';
import { CategoryService } from '../../services/category.service';
import { AdminToastService } from '../toast.service';
import { IconComponent, IconPickerComponent, isImageIcon } from '../../shared/icon';

interface Draft {
  name: string;
  icon: string;
}

@Component({
  selector: 'app-admin-categories',
  imports: [FormsModule, RouterLink, IconComponent, IconPickerComponent],
  template: `
    <div class="adm-head">
      <h1>Danh mục</h1>
    </div>

    <div class="layout">
      <section class="adm-box add">
        <h2>Thêm danh mục</h2>
        <form class="box-body" (ngSubmit)="add()">
          <div class="field">
            <label class="req" for="cat-name">Tên danh mục</label>
            <input id="cat-name" name="name" [class.invalid]="nameBad()" (input)="nameBad.set(false)" [(ngModel)]="newCat.name" maxlength="40" placeholder="Ví dụ: Gối ôm" />
            @if (nameBad()) { <span class="field-err">Nhập tên danh mục.</span> }
          </div>
          <div class="field">
            <label for="cat-icon">Biểu tượng (emoji / ảnh PNG vuông)</label>
            <app-icon-picker id="cat-icon" name="icon" [(ngModel)]="newCat.icon" />
          </div>
          <button class="btn primary small" type="submit">+ Thêm danh mục</button>
          <p class="hint">Thứ tự ở đây là thứ tự hiển thị trên trang chủ, trang sản phẩm và chân trang.</p>
        </form>
      </section>

      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead>
            <tr>
              <th style="width: 64px">Icon</th>
              <th>Tên</th>
              <th style="width: 110px">Sản phẩm</th>
              <th style="width: 220px"></th>
            </tr>
          </thead>
          <tbody>
            @for (c of service.categories(); track c.name; let i = $index, first = $first, last = $last) {
              @let count = service.counts().get(c.name) ?? 0;
              <tr>
                @if (editing() === c.name) {
                  <td><app-icon-picker [(ngModel)]="draft.icon" [ngModelOptions]="{ standalone: true }" /></td>
                  <td>
                    <input
                      class="cell-input"
                      [(ngModel)]="draft.name"
                      maxlength="40"
                      aria-label="Tên danh mục"
                      (keydown.enter)="saveEdit(c)"
                      (keydown.escape)="editing.set(null)"
                    />
                    @if (count && draft.name.trim() !== c.name) {
                      <small class="hint">{{ count }} sản phẩm sẽ được chuyển sang tên mới.</small>
                    }
                  </td>
                  <td>{{ count }}</td>
                  <td class="actions">
                    <button class="btn primary small" type="button" (click)="saveEdit(c)">Lưu</button>
                    <button class="btn ghost small" type="button" (click)="editing.set(null)">Huỷ</button>
                  </td>
                } @else if (deleting() === c.name) {
                  <td class="icon"><app-icon [icon]="c.icon" /></td>
                  <td colspan="2">
                    @if (count) {
                      <div class="move">
                        <span>Chuyển {{ count }} sản phẩm sang</span>
                        <select [(ngModel)]="moveTo" aria-label="Danh mục chuyển sang">
                          @for (o of service.categories(); track o.name) {
                            @if (o.name !== c.name) {
                              <option [value]="o.name">{{ textIcon(o.icon) }}{{ o.name }}</option>
                            }
                          }
                        </select>
                      </div>
                    } @else {
                      Xoá danh mục <b>{{ c.name }}</b>?
                    }
                  </td>
                  <td class="actions">
                    <button class="btn danger small" type="button" (click)="confirmDelete(c)">Xoá</button>
                    <button class="btn ghost small" type="button" (click)="deleting.set(null)">Huỷ</button>
                  </td>
                } @else {
                  <td class="icon"><app-icon [icon]="c.icon" /></td>
                  <td class="title-cell">
                    <a routerLink="/admin/san-pham" [queryParams]="{ danhMuc: c.name }">{{ c.name }}</a>
                  </td>
                  <td>{{ count }}</td>
                  <td class="actions">
                    <button class="mini" type="button" title="Lên" [disabled]="first" (click)="service.move(i, -1)">↑</button>
                    <button class="mini" type="button" title="Xuống" [disabled]="last" (click)="service.move(i, 1)">↓</button>
                    <button class="mini" type="button" (click)="startEdit(c)">Sửa</button>
                    <button class="mini del" type="button" [disabled]="service.categories().length <= 1" (click)="startDelete(c)">
                      Xoá
                    </button>
                  </td>
                }
              </tr>
            } @empty {
              <tr><td colspan="4" class="empty">Chưa có danh mục nào.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: `
    .layout { display: grid; grid-template-columns: 300px 1fr; gap: 20px; align-items: start; }
    .emoji { width: 72px; text-align: center; font-size: 1.2rem; }
    .hint { color: #646970; font-size: 0.8rem; margin: 0; display: block; }
    .icon { font-size: 1.4rem; }
    .cell-input { font: inherit; padding: 6px 10px; border: 1px solid #c3c4c7; border-radius: 8px; width: 100%; box-sizing: border-box; }
    .cell-input.emoji { width: 56px; }
    .actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
    .mini { font: inherit; font-size: 0.8rem; padding: 4px 10px; border: 1px solid #c3c4c7; border-radius: 6px; background: #fff; cursor: pointer; }
    .mini:hover:not(:disabled) { border-color: var(--primary); color: var(--primary-dark); }
    .mini:disabled { opacity: 0.35; cursor: default; }
    .mini.del { color: var(--primary-ink); }
    .move { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .move select { font: inherit; padding: 5px 10px; border: 1px solid #c3c4c7; border-radius: 8px; }
    @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
  `,
})
export class AdminCategories {
  readonly service = inject(CategoryService);
  private readonly toast = inject(AdminToastService);

  newCat: Draft = { name: '', icon: '✨' };
  /** <option> không hiện được ảnh → chỉ ghi emoji. */
  textIcon(i: string): string {
    return isImageIcon(i) ? '' : i + ' ';
  }
  draft: Draft = { name: '', icon: '' };
  moveTo = '';
  readonly editing = signal<string | null>(null);
  readonly deleting = signal<string | null>(null);

  readonly nameBad = signal(false);

  add(): void {
    const name = this.newCat.name.trim();
    if (!name) {
      this.nameBad.set(true);
      this.toast.err('Vui lòng điền trường đang tô đỏ.');
      return;
    }
    if (this.toast.run(() => this.service.add(name, this.newCat.icon), `Đã thêm danh mục "${name}"`)) {
      this.newCat = { name: '', icon: '✨' };
    }
  }

  startEdit(c: Category): void {
    this.deleting.set(null);
    this.draft = { ...c };
    this.editing.set(c.name);
  }

  saveEdit(c: Category): void {
    if (this.toast.run(() => this.service.update(c.name, this.draft), 'Đã cập nhật danh mục')) this.editing.set(null);
  }

  startDelete(c: Category): void {
    this.editing.set(null);
    this.moveTo = this.service.categories().find((o) => o.name !== c.name)?.name ?? '';
    this.deleting.set(c.name);
  }

  confirmDelete(c: Category): void {
    if (this.toast.run(() => this.service.remove(c.name, this.moveTo), `Đã xoá danh mục "${c.name}"`)) this.deleting.set(null);
  }
}

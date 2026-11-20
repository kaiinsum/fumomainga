import { Injectable, inject, signal } from '@angular/core';
import { OrderApiService } from '../services/order-api.service';

export interface AdminNote {
  text: string;
  updatedAt: number;
}

/**
 * Ghi chú nội bộ cho sản phẩm — CHỈ admin. Lưu riêng trên máy chủ (/api/admin/notes),
 * không nằm trong dữ liệu sản phẩm công khai nên khách không bao giờ thấy.
 */
@Injectable({ providedIn: 'root' })
export class NoteService {
  private readonly api = inject(OrderApiService);
  readonly notes = signal<Record<string, AdminNote>>({});
  readonly error = signal('');
  private loading?: Promise<void>;

  load(force = false): Promise<void> {
    if (this.loading && !force) return this.loading;
    this.loading = this.api
      .call<{ notes: Record<string, AdminNote> }>('GET', '/api/admin/notes', undefined, true)
      .then((r) => {
        this.notes.set(r.notes ?? {});
        this.error.set('');
      })
      .catch((e) => {
        this.loading = undefined;
        this.error.set(e instanceof Error ? e.message : 'Không tải được ghi chú.');
      });
    return this.loading;
  }

  noteOf(id: string): AdminNote | null {
    return this.notes()[id] ?? null;
  }

  /** Lưu ghi chú 1 sản phẩm (rỗng = xoá). Bỏ qua nếu không đổi. */
  async save(id: string, text: string): Promise<void> {
    const t = text.trim();
    if ((this.noteOf(id)?.text ?? '') === t) return;
    const r = await this.api.call<{ notes: Record<string, AdminNote> }>('PATCH', '/api/admin/notes', { id, text: t }, true);
    this.notes.set(r.notes ?? {});
  }
}

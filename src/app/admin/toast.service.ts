import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  kind: 'ok' | 'err';
  text: string;
}

@Injectable({ providedIn: 'root' })
export class AdminToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  ok(text: string): void {
    this.push('ok', text);
  }

  err(text: string): void {
    this.push('err', text);
  }

  /** Chạy thao tác lưu; báo lỗi (ví dụ bộ nhớ đầy) thay vì làm hỏng trang. */
  run(action: () => void, success: string): boolean {
    try {
      action();
      this.ok(success);
      return true;
    } catch (e) {
      this.err(e instanceof Error ? e.message : 'Có lỗi xảy ra khi lưu.');
      return false;
    }
  }

  dismiss(id: number): void {
    this.toasts.update((l) => l.filter((t) => t.id !== id));
  }

  private push(kind: Toast['kind'], text: string): void {
    const id = ++this.seq;
    this.toasts.update((l) => [...l, { id, kind, text }]);
    setTimeout(() => this.dismiss(id), 3200);
  }
}

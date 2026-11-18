import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CatalogSyncService } from './services/catalog-sync.service';
import { SettingsService } from './services/settings.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {
  // Khởi tạo sớm để áp dụng màu chủ đạo ngay khi tải trang.
  private readonly _settings = inject(SettingsService);
  // Tải sản phẩm / danh mục / tin tức từ máy chủ (dùng chung cho mọi máy).
  private readonly _catalog = inject(CatalogSyncService);
}

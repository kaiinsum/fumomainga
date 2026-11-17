import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SettingsService } from './services/settings.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {
  // Khởi tạo sớm để áp dụng màu chủ đạo ngay khi tải trang.
  private readonly _settings = inject(SettingsService);
}

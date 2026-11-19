import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { initPerf } from './app/core/perf';

// Chọn mức hiệu ứng theo cấu hình máy trước khi vẽ giao diện.
initPerf();

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));

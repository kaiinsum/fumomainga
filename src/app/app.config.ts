import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';
import { ShopTitleStrategy } from './core/shop-title.strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
    ),
    { provide: TitleStrategy, useClass: ShopTitleStrategy },
  ],
};

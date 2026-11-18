import { Routes } from '@angular/router';
import { minigameGuard } from './core/minigame.guard';
import { PublicLayout } from './layouts/public-layout';

export const routes: Routes = [
  // ---------- Khu vực quản trị ----------
  {
    path: 'admin',
    loadChildren: () => import('./admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },

  // ---------- Trang công khai ----------
  {
    path: '',
    component: PublicLayout,
    children: [
      {
        path: '',
        title: 'Trang chủ',
        loadComponent: () => import('./pages/home/home').then((m) => m.HomePage),
      },
      {
        path: 'san-pham',
        title: 'Sản phẩm',
        loadComponent: () => import('./pages/products/products').then((m) => m.ProductsPage),
      },
      {
        path: 'san-pham/:id',
        title: 'Chi tiết sản phẩm',
        loadComponent: () => import('./pages/product-detail/product-detail').then((m) => m.ProductDetailPage),
      },
      {
        path: 'tin-tuc',
        title: 'Tin tức',
        loadComponent: () => import('./pages/news/news').then((m) => m.NewsPage),
      },
      {
        path: 'tin-tuc/:id',
        title: 'Tin tức',
        loadComponent: () => import('./pages/news-detail/news-detail').then((m) => m.NewsDetailPage),
      },
      {
        path: 'gio-hang',
        title: 'Giỏ hàng',
        loadComponent: () => import('./pages/cart/cart').then((m) => m.CartPage),
      },
      {
        path: 'tra-cuu-don-hang',
        title: 'Tra cứu đơn hàng',
        loadComponent: () => import('./pages/order-lookup/order-lookup').then((m) => m.OrderLookupPage),
      },
      {
        path: 'mini-game',
        title: 'Mini game',
        loadComponent: () => import('./pages/minigame/hub').then((m) => m.MiniGameHubPage),
      },
      {
        path: 'mini-game/dai-chien-mot-vai',
        canActivate: [minigameGuard('shmup')],
        title: 'Đại chiến Mọt Vải',
        loadComponent: () => import('./pages/minigame/minigame').then((m) => m.MiniGamePage),
      },
      {
        path: 'mini-game/doan-nhan-vat',
        canActivate: [minigameGuard('touhoudle')],
        title: 'Đoán nhân vật (Touhoudle)',
        loadComponent: () => import('./pages/minigame/touhoudle').then((m) => m.TouhoudlePage),
      },
      {
        path: 'mini-game/go-chu-diet-fumo',
        canActivate: [minigameGuard('jp-type')],
        title: 'Gõ chữ diệt Fumo',
        loadComponent: () => import('./pages/minigame/jp-type').then((m) => m.JpTypePage),
      },
      {
        path: 'mini-game/fumo-ninja',
        canActivate: [minigameGuard('ninja')],
        title: 'Fumo Ninja',
        loadComponent: () => import('./pages/minigame/ninja').then((m) => m.FumoNinjaPage),
      },
      {
        path: 'mini-game/tui-mu',
        canActivate: [minigameGuard('gacha')],
        title: 'Túi mù may mắn',
        loadComponent: () => import('./pages/minigame/gacha').then((m) => m.GachaPage),
      },
      {
        path: 'gioi-thieu',
        title: 'Giới thiệu',
        loadComponent: () => import('./pages/about/about').then((m) => m.AboutPage),
      },
      {
        path: 'lien-he',
        title: 'Liên hệ',
        loadComponent: () => import('./pages/contact/contact').then((m) => m.ContactPage),
      },
      {
        path: '**',
        title: 'Không tìm thấy',
        loadComponent: () => import('./pages/not-found/not-found').then((m) => m.NotFoundPage),
      },
    ],
  },
];

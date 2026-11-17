import { Routes } from '@angular/router';
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

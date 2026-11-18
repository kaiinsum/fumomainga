import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { AdminLayout } from './layout/admin-layout';

const authGuard: CanActivateFn = (_route, state) => {
  if (inject(AuthService).check()) return true;
  return inject(Router).createUrlTree(['/admin/dang-nhap'], { queryParams: { next: state.url } });
};

const guestGuard: CanActivateFn = () =>
  inject(AuthService).check() ? inject(Router).createUrlTree(['/admin']) : true;

export const ADMIN_ROUTES: Routes = [
  {
    path: 'dang-nhap',
    title: 'Đăng nhập quản trị',
    canActivate: [guestGuard],
    loadComponent: () => import('./login/login').then((m) => m.AdminLogin),
  },
  {
    path: '',
    component: AdminLayout,
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    children: [
      {
        path: '',
        title: 'Bảng tin',
        loadComponent: () => import('./dashboard/dashboard').then((m) => m.AdminDashboard),
      },
      {
        path: 'san-pham',
        title: 'Quản lý sản phẩm',
        loadComponent: () => import('./products/products-list').then((m) => m.AdminProductsList),
      },
      {
        path: 'san-pham/moi',
        title: 'Thêm sản phẩm',
        loadComponent: () => import('./products/product-form').then((m) => m.AdminProductForm),
      },
      {
        path: 'san-pham/excel',
        title: 'Nhập / xuất Excel',
        loadComponent: () => import('./products/products-excel').then((m) => m.AdminProductsExcel),
      },
      {
        path: 'san-pham/:id',
        title: 'Sửa sản phẩm',
        loadComponent: () => import('./products/product-form').then((m) => m.AdminProductForm),
      },
      {
        path: 'minigame',
        title: 'Minigame',
        loadComponent: () => import('./minigames/minigames').then((m) => m.AdminMinigames),
      },
      {
        path: 'danh-muc',
        title: 'Danh mục',
        loadComponent: () => import('./categories/categories').then((m) => m.AdminCategories),
      },
      {
        path: 'tin-tuc',
        title: 'Quản lý tin tức',
        loadComponent: () => import('./news/news-list').then((m) => m.AdminNewsList),
      },
      {
        path: 'tin-tuc/moi',
        title: 'Viết bài mới',
        loadComponent: () => import('./news/news-form').then((m) => m.AdminNewsForm),
      },
      {
        path: 'tin-tuc/:id',
        title: 'Sửa bài viết',
        loadComponent: () => import('./news/news-form').then((m) => m.AdminNewsForm),
      },
      {
        path: 'don-hang',
        title: 'Đơn hàng',
        loadComponent: () => import('./orders/orders').then((m) => m.AdminOrders),
      },
      {
        path: 'lien-he',
        title: 'Liên hệ',
        loadComponent: () => import('./contacts/contacts').then((m) => m.AdminContacts),
      },
      {
        path: 'tro-ly-ai',
        title: 'Trợ lý AI',
        loadComponent: () => import('./ai/ai-assistant').then((m) => m.AdminAiAssistant),
      },
      {
        path: 'cai-dat',
        title: 'Cài đặt',
        loadComponent: () => import('./settings/settings').then((m) => m.AdminSettings),
      },
      { path: '**', redirectTo: '' },
    ],
  },
];

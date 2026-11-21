import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { SEO_PAGES, siteSeoOf } from '../models/site-seo';
import { SettingsService } from '../services/settings.service';
import { titleSep } from './page-seo.service';

/**
 * Tiêu đề tab = "<tiêu đề trang> - <tên shop>" (tên shop lấy từ Cài đặt).
 * Trang trên menu có "Tiêu đề SEO" (Admin → Khai báo) → dùng nguyên tiêu đề đó.
 */
@Injectable({ providedIn: 'root' })
export class ShopTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly settings = inject(SettingsService);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const s = this.settings.settings();
    const seo = siteSeoOf(s);
    const sep = seo.titleSep || '-';
    const path = snapshot.url.split(/[?#]/)[0] || '/';
    const custom = SEO_PAGES.some((p) => p.path === path) ? seo.pages[path]?.title?.trim() : '';
    if (custom) return this.title.setTitle(custom);
    // Trang chủ: chỉ tên shop (thương hiệu) - giống bản xem trước ở Admin → Khai báo.
    if (path === '/') return this.title.setTitle(s.shopName);
    const page = this.buildTitle(snapshot);
    this.title.setTitle(page ? `${page} ${sep} ${s.shopName}` : s.shopName);
  }
}

export function setPageTitle(title: Title, page: string, shop: string): void {
  title.setTitle(`${page} ${titleSep.value} ${shop}`);
}

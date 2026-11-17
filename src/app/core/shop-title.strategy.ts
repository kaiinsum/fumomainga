import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { SettingsService } from '../services/settings.service';

/** Tiêu đề tab = "<tiêu đề trang> — <tên shop>" (tên shop lấy từ Cài đặt). */
@Injectable({ providedIn: 'root' })
export class ShopTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly settings = inject(SettingsService);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const page = this.buildTitle(snapshot);
    const shop = this.settings.settings().shopName;
    this.title.setTitle(page ? `${page} — ${shop}` : shop);
  }
}

export function setPageTitle(title: Title, page: string, shop: string): void {
  title.setTitle(`${page} — ${shop}`);
}

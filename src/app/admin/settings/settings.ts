import { Component, ElementRef, OnDestroy, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { animate, stagger } from 'animejs';
import { DEFAULT_SETTINGS, FONT_OPTIONS, SiteSettings } from '../../models/site-settings';
import { Category, Product } from '../../models/product';
import { buildNotices } from '../../models/notifications';
import { NewsPost } from '../../models/news';
import { AuthService } from '../../services/auth.service';
import { CategoryService } from '../../services/category.service';
import { NewsService, SEED_NEWS } from '../../services/news.service';
import { ProductService } from '../../services/product.service';
import { SettingsService } from '../../services/settings.service';
import { AdminToastService } from '../toast.service';
import { AdminLoginsComponent } from './admin-logins';
import { AdminSecurityComponent } from './admin-security';

type TabKey = 'chung' | 'trang-chu' | 'gioi-thieu' | 'lien-he' | 'chinh-sach' | 'thong-bao' | 'bao-mat' | 'sao-luu';

/** Gợi ý chỉ gồm các sắc của #60B5FF (đậm → nhạt) để giữ giao diện một tông màu. */
const COLOR_PRESETS = ['#60B5FF', '#4A9EE8', '#3A86CC', '#2F6FA8'];
const BG_PRESETS = ['#F5FAFF', '#EAF5FF', '#FFFFFF', '#60B5FF'];

@Component({
  selector: 'app-admin-settings',
  imports: [FormsModule, AdminLoginsComponent, AdminSecurityComponent],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class AdminSettings implements OnDestroy {
  /** ?tab=... để mở thẳng một tab. */
  readonly tab = input<string>();

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly settingsSvc = inject(SettingsService);
  private readonly productsSvc = inject(ProductService);
  private readonly newsSvc = inject(NewsService);
  private readonly categorySvc = inject(CategoryService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(AdminToastService);

  readonly tabs: { key: TabKey; label: string }[] = [
    { key: 'chung', label: 'Chung' },
    { key: 'trang-chu', label: 'Trang chủ' },
    { key: 'gioi-thieu', label: 'Giới thiệu' },
    { key: 'lien-he', label: 'Liên hệ' },
    { key: 'chinh-sach', label: 'Chính sách' },
    { key: 'thong-bao', label: 'Thông báo' },
    { key: 'bao-mat', label: 'Bảo mật' },
    { key: 'sao-luu', label: 'Sao lưu' },
  ];
  readonly colorPresets = COLOR_PRESETS;
  readonly bgPresets = BG_PRESETS;
  readonly fontOptions = FONT_OPTIONS;

  readonly active = signal<TabKey>('chung');
  /** Bản nháp đang chỉnh — chỉ áp dụng khi bấm "Lưu thay đổi". */
  draft: SiteSettings = structuredClone(this.settingsSvc.settings());

  oldPw = '';
  newPw = '';
  newPw2 = '';

  constructor() {
    this.loadFontPreviews();
    effect(() => {
      const t = this.tab() as TabKey | undefined;
      untracked(() => this.select(t && this.tabs.some((x) => x.key === t) ? t : 'chung', false));
    });
  }

  select(key: TabKey, updateUrl = true): void {
    this.active.set(key);
    if (updateUrl) this.router.navigate([], { queryParams: { tab: key }, replaceUrl: true });
    requestAnimationFrame(() =>
      animate(this.host.querySelectorAll('.panel > *'), {
        opacity: [0, 1],
        translateY: [12, 0],
        delay: stagger(40),
        duration: 400,
        ease: 'outCubic',
      }),
    );
  }

  // ---------- Font ----------
  /** Tải một lần tất cả font lựa chọn (độ đậm 400 & 700) để xem trước trong danh sách. */
  private loadFontPreviews(): void {
    if (document.getElementById('font-previews')) return;
    const families = FONT_OPTIONS.map((f) => `family=${f.name.replace(/ /g, '+')}:wght@400;700`).join('&');
    const link = document.createElement('link');
    link.id = 'font-previews';
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
    document.head.appendChild(link);
  }

  quote(name: string): string {
    return `'${name}', 'Segoe UI', Arial, sans-serif`;
  }

  /** Xem trước font ngay (tải font về); chỉ lưu khi bấm "Lưu thay đổi". */
  pickFont(name: string): void {
    this.draft.fontFamily = name;
    this.settingsSvc.applyFont(name);
    requestAnimationFrame(() => {
      const sample = this.host.querySelector('.font-sample');
      if (sample) animate(sample, { opacity: [0.2, 1], translateY: [8, 0], duration: 450, ease: 'outCubic' });
    });
  }

  ngOnDestroy(): void {
    // Rời trang mà chưa lưu -> trả lại font đã lưu.
    this.settingsSvc.applyFont(this.settingsSvc.settings().fontFamily);
  }

  // ---------- Lưu cài đặt ----------
  readonly shopNameBad = signal(false);

  save(): void {
    this.shopNameBad.set(!this.draft.shopName.trim());
    if (this.shopNameBad()) {
      this.active.set('chung');
      this.toast.err('Vui lòng điền trường đang tô đỏ: Tên shop.');
      return;
    }
    if (this.toast.run(() => this.settingsSvc.save(this.draft), 'Đã lưu cài đặt')) void this.publish();
  }

  /** Gửi cài đặt lên máy chủ để mọi khách cùng thấy (link mạng xã hội, liên hệ, màu...). */
  private async publish(): Promise<void> {
    const err = await this.settingsSvc.publish(this.settingsSvc.settings());
    if (err) this.toast.err('Đã lưu trên máy này nhưng chưa gửi được lên web cho khách: ' + err);
    else this.toast.ok('Đã cập nhật cho mọi khách truy cập');
  }

  discard(): void {
    this.draft = structuredClone(this.settingsSvc.settings());
    this.settingsSvc.applyFont(this.draft.fontFamily);
    this.toast.ok('Đã huỷ các thay đổi chưa lưu');
  }

  resetDefaults(): void {
    if (!confirm('Đưa toàn bộ cài đặt về mặc định?')) return;
    this.draft = structuredClone(DEFAULT_SETTINGS);
    if (this.toast.run(() => this.settingsSvc.save(this.draft), 'Đã khôi phục cài đặt mặc định')) void this.publish();
  }

  addValue(): void {
    this.draft.aboutValues.push({ icon: '✨', title: '', text: '' });
  }

  /** Xem trước các thông báo khách đang thấy theo bản nháp (số ngày, bật/tắt). */
  noticePreview() {
    return this.draft.notifyEnabled === false ? [] : buildNotices(this.productsSvc.products(), this.draft.minigames, this.draft.notifyDays || 14);
  }

  fmtDay(t: number): string {
    return new Date(t).toLocaleDateString('vi-VN');
  }

  addPolicy(): void {
    this.draft.policies.push({ icon: '📌', title: '', text: '' });
  }

  addMilestone(): void {
    this.draft.aboutMilestones.push({ year: String(new Date().getFullYear()), text: '' });
  }

  move<T>(list: T[], i: number, dir: -1 | 1): void {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
  }

  removeAt<T>(list: T[], i: number): void {
    list.splice(i, 1);
  }

  // ---------- Bảo mật ----------
  async changePassword(): Promise<void> {
    if (this.newPw.length < 6) return this.toast.err('Mật khẩu mới tối thiểu 6 ký tự.');
    if (this.newPw !== this.newPw2) return this.toast.err('Mật khẩu nhập lại không khớp.');
    const res = await this.auth.changePassword(this.oldPw, this.newPw);
    if (res.error) return this.toast.err(res.error);
    this.oldPw = this.newPw = this.newPw2 = '';
    this.toast.ok(
      res.localOnly
        ? 'Đã đổi mật khẩu trên trình duyệt này (chưa kết nối được máy chủ).'
        : 'Đã đổi mật khẩu cho mọi máy — mật khẩu cũ không đăng nhập được nữa, các máy khác sẽ bị đăng xuất.',
    );
  }

  // ---------- Sao lưu ----------
  exportData(): void {
    const data = {
      app: 'fumo-showcase',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: this.settingsSvc.settings(),
      categories: this.categorySvc.categories(),
      products: this.productsSvc.products(),
      news: this.newsSvc.posts(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fumo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async importData(event: Event): Promise<void> {
    const el = event.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as {
        settings?: Partial<SiteSettings>;
        categories?: Category[];
        products?: Product[];
        news?: NewsPost[];
      };
      if (!Array.isArray(data.products) || !Array.isArray(data.news)) throw new Error('format');
      if (!confirm(`Nhập ${data.products.length} sản phẩm và ${data.news.length} bài viết? Dữ liệu hiện tại sẽ bị thay thế.`)) return;
      this.toast.run(() => {
        this.productsSvc.replaceAll(data.products!);
        this.newsSvc.replaceAll(data.news!);
        this.categorySvc.replaceAll(data.categories);
        this.settingsSvc.save({ ...DEFAULT_SETTINGS, ...data.settings });
        this.draft = structuredClone(this.settingsSvc.settings());
      }, 'Đã nhập dữ liệu sao lưu');
    } catch {
      this.toast.err('File sao lưu không hợp lệ.');
    }
  }

  resetDemo(): void {
    if (!confirm('Khôi phục toàn bộ dữ liệu mẫu? Sản phẩm, bài viết và cài đặt hiện tại sẽ bị xoá.')) return;
    this.toast.run(() => {
      this.productsSvc.resetDemo();
      this.newsSvc.replaceAll(structuredClone(SEED_NEWS));
      this.categorySvc.reset();
      this.settingsSvc.reset();
      this.draft = structuredClone(this.settingsSvc.settings());
    }, 'Đã khôi phục dữ liệu mẫu');
  }
}

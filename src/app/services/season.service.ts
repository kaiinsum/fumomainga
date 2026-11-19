import { Injectable, computed, inject, signal } from '@angular/core';
import { SeasonDef, activeSeason, seasonRange } from '../models/seasons';
import { SettingsService } from './settings.service';

const HIDE_KEY = 'fumo.season.hide';
const SHOWN_KEY = 'fumo.season.shown';

/** Khoá "không hiện lại" theo chủ đề + năm (năm sau tới dịp lại hiện). */
const keyOf = (s: SeasonDef) => `${s.id}:${new Date(seasonRange(s.id, new Date().getFullYear()).start).getFullYear()}`;

function readList(storage: Storage | undefined, key: string): string[] {
  try {
    const v = JSON.parse(storage?.getItem(key) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Chủ đề dịp lễ đang bật + thiệp chào hiện ra lần đầu vào web. */
@Injectable({ providedIn: 'root' })
export class SeasonService {
  private readonly settings = inject(SettingsService).settings;
  /** Cập nhật mỗi 30 phút để chế độ "tự động theo lịch" tự đổi khi sang ngày. */
  private readonly tick = signal(Date.now());

  readonly active = computed<SeasonDef | undefined>(() => activeSeason(this.settings().seasonTheme, this.tick()));
  readonly popupOpen = signal(false);

  constructor() {
    setInterval(() => this.tick.set(Date.now()), 30 * 60_000);
  }

  /** Khách đã chọn "không hiện lại lần sau" cho chủ đề này chưa. */
  hidden(s: SeasonDef): boolean {
    return readList(globalThis.localStorage, HIDE_KEY).includes(keyOf(s));
  }

  /** Gọi khi trang công khai mở: hiện thiệp 1 lần mỗi phiên (trừ khi khách đã tắt). */
  maybeShow(): void {
    const s = this.active();
    if (!s || this.hidden(s)) return;
    const shown = readList(globalThis.sessionStorage, SHOWN_KEY);
    if (shown.includes(keyOf(s))) return;
    try {
      sessionStorage.setItem(SHOWN_KEY, JSON.stringify([...shown, keyOf(s)]));
    } catch {
      /* bỏ qua */
    }
    this.popupOpen.set(true);
  }

  /** Mở lại thiệp (nút ở chân trang). */
  open(): void {
    if (this.active()) this.popupOpen.set(true);
  }

  close(dontShowAgain: boolean): void {
    this.popupOpen.set(false);
    const s = this.active();
    if (!s) return;
    const list = readList(globalThis.localStorage, HIDE_KEY).filter((k) => k !== keyOf(s));
    if (dontShowAgain) list.push(keyOf(s));
    try {
      localStorage.setItem(HIDE_KEY, JSON.stringify(list.slice(-20)));
    } catch {
      /* bỏ qua */
    }
  }
}

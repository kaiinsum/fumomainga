import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Bỏ khoảng trắng, dấu chấm, gạch; đổi +84 / 84 đầu số thành 0. */
export function normalizePhone(raw: string): string {
  let d = raw.replace(/[\s.\-()]/g, '');
  if (d.startsWith('+84')) d = '0' + d.slice(3);
  else if (/^84\d{9}$/.test(d)) d = '0' + d.slice(2);
  return d;
}

/**
 * Số điện thoại Việt Nam: di động 10 số (03, 05, 07, 08, 09) hoặc cố định 11 số (02x).
 * Nhận cả dạng +84 / có khoảng trắng, dấu chấm.
 */
export function isValidVnPhone(raw: string): boolean {
  return /^0(?:[35789]\d{8}|2\d{9})$/.test(normalizePhone(raw));
}

export function phoneError(raw: string): string {
  const v = raw.trim();
  if (!v) return 'Vui lòng nhập số điện thoại.';
  if (/[^\d\s.+\-()]/.test(v)) return 'Số điện thoại chỉ gồm chữ số.';
  const d = normalizePhone(v);
  if (!d.startsWith('0')) return 'Số điện thoại phải bắt đầu bằng 0 hoặc +84.';
  if (d.length < 10) return `Số điện thoại còn thiếu ${10 - d.length} số.`;
  if (!isValidVnPhone(v)) return 'Số điện thoại không đúng (VD: 0912 345 678).';
  return '';
}

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** Tên miền hay gõ nhầm → tên đúng. */
const DOMAIN_FIX: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.vn': 'gmail.com',
  'gmail.com.vn': 'gmail.com',
  'yahoo.con': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'hotmail.con': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'outlook.con': 'outlook.com',
  'icloud.con': 'icloud.com',
};

/** Gợi ý sửa khi tên miền email bị gõ nhầm (vd. abc@gmial.com → abc@gmail.com). */
export function emailSuggestion(raw: string): string {
  const v = raw.trim().toLowerCase();
  const at = v.lastIndexOf('@');
  if (at < 1) return '';
  const fix = DOMAIN_FIX[v.slice(at + 1)];
  return fix ? v.slice(0, at + 1) + fix : '';
}

/** required = false: để trống thì hợp lệ. */
export function emailError(raw: string, required = false): string {
  const v = raw.trim();
  if (!v) return required ? 'Vui lòng nhập email.' : '';
  if (!v.includes('@')) return 'Email thiếu ký tự @.';
  if (!EMAIL_RE.test(v) || v.includes('..')) return 'Email không đúng định dạng (VD: ten@gmail.com).';
  const fix = emailSuggestion(v);
  if (fix) return `Có phải bạn muốn nhập ${fix}?`;
  return '';
}

/** Dùng cho Reactive Forms. */
export const vnPhoneValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  const msg = c.value ? phoneError(String(c.value)) : '';
  return msg ? { phone: msg } : null;
};

export const emailValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  const msg = c.value ? emailError(String(c.value)) : '';
  return msg ? { email: msg } : null;
};

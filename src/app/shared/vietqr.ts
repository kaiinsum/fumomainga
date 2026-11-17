/**
 * Tạo nội dung mã VietQR (chuẩn EMVCo / NAPAS 247) để khách quét chuyển khoản.
 * Mã "động": có sẵn số tiền và nội dung chuyển khoản (mã đơn) — khách không phải gõ tay.
 */

export interface BankInfo {
  /** Mã BIN ngân hàng (Timo: 963388). */
  bin: string;
  account: string;
}

const field = (id: string, value: string) => id + String(value.length).padStart(2, '0') + value;

/** CRC16-CCITT (0xFFFF, đa thức 0x1021) — 4 ký tự hex in hoa. */
export function crc16(s: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(s)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Nội dung chuyển khoản: chỉ chữ không dấu, số, khoảng trắng (ngân hàng hay cắt ký tự lạ). */
export function cleanTransferNote(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
}

export function buildVietQr(bank: BankInfo, amount?: number, note?: string): string {
  const merchant = field('00', 'A000000727') + field('01', field('00', bank.bin) + field('01', bank.account)) + field('02', 'QRIBFTTA');
  const dynamic = !!amount || !!note;
  let payload =
    field('00', '01') +
    field('01', dynamic ? '12' : '11') +
    field('38', merchant) +
    field('53', '704') +
    (amount ? field('54', String(Math.round(amount))) : '') +
    field('58', 'VN') +
    (note ? field('62', field('08', cleanTransferNote(note))) : '');
  payload += '6304';
  return payload + crc16(payload);
}

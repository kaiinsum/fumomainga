import type { Cell, CellValue, Workbook, Worksheet } from 'exceljs';
import { Product, ProductInput, onSale } from '../models/product';

/**
 * Nhập / xuất thông tin sản phẩm bằng Excel theo mẫu cố định.
 * Hình ảnh KHÔNG nằm trong file Excel — ảnh được quản lý riêng ở trang sửa sản phẩm.
 */

export const SHEET_PRODUCTS = 'SanPham';
const SHEET_GUIDE = 'HuongDan';
const SHEET_LISTS = 'DanhSach';
const YES = 'Có';
const NO = 'Không';

type Key = 'id' | 'name' | 'category' | 'price' | 'salePrice' | 'description' | 'tags' | 'inStock' | 'featured' | 'imageCount';

interface Column {
  key: Key;
  header: string;
  width: number;
  required?: boolean;
  /** Chỉ để xem, bỏ qua khi nhập. */
  readOnly?: boolean;
  note: string;
}

export const COLUMNS: Column[] = [
  { key: 'id', header: 'Mã SP', width: 40, note: 'Giữ nguyên để cập nhật sản phẩm. Để trống để THÊM sản phẩm mới. Không tự sửa mã.' },
  { key: 'name', header: 'Tên sản phẩm', width: 32, required: true, note: '3–80 ký tự.' },
  { key: 'category', header: 'Danh mục', width: 18, required: true, note: 'Chọn trong danh sách (phải có sẵn ở trang Danh mục).' },
  { key: 'price', header: 'Giá (VNĐ)', width: 14, required: true, note: 'Số nguyên ≥ 0, ví dụ 690000.' },
  { key: 'salePrice', header: 'Giá sau giảm (VNĐ)', width: 16, note: 'Để trống nếu KHÔNG giảm giá. Phải nhỏ hơn Giá.' },
  { key: 'description', header: 'Mô tả', width: 60, required: true, note: 'Tối thiểu 10 ký tự.' },
  { key: 'tags', header: 'Thẻ', width: 26, note: 'Phân cách bằng dấu phẩy, ví dụ: dễ thương, pastel.' },
  { key: 'inStock', header: 'Còn hàng', width: 11, note: `${YES} / ${NO}. Để trống = ${YES}.` },
  { key: 'featured', header: 'Nổi bật', width: 11, note: `${YES} / ${NO}. Để trống = ${NO}.` },
  { key: 'imageCount', header: 'Số ảnh', width: 9, readOnly: true, note: 'Chỉ để xem. Ảnh được quản lý riêng trên trang web, không nhập qua Excel.' },
];

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();

const HEADER_TO_KEY = new Map(COLUMNS.map((c) => [norm(c.header), c.key]));

// ===================== Lập kế hoạch nhập (thuần, không phụ thuộc Excel) =====================

export type RawRow = Partial<Record<Key, string>> & { line: number };

export interface ImportRow {
  line: number;
  kind: 'new' | 'update' | 'same' | 'error';
  name: string;
  id?: string;
  errors: string[];
  /** Mô tả các trường thay đổi (khi cập nhật). */
  changes: string[];
  data?: Omit<ProductInput, 'images'>;
}

export interface ImportPlan {
  rows: ImportRow[];
  counts: Record<ImportRow['kind'], number>;
}

const FIELD_LABELS: Record<keyof Omit<ProductInput, 'images'>, string> = {
  name: 'Tên',
  category: 'Danh mục',
  price: 'Giá',
  salePrice: 'Giá giảm',
  description: 'Mô tả',
  tags: 'Thẻ',
  inStock: 'Còn hàng',
  featured: 'Nổi bật',
};

function parseBool(v: string | undefined, fallback: boolean): boolean | null {
  const t = norm(v ?? '');
  if (!t) return fallback;
  if (['co', 'x', 'yes', 'y', 'true', '1', 'con', 'conhang'].includes(t)) return true;
  if (['khong', 'k', 'no', 'n', 'false', '0', 'het', 'hethang'].includes(t)) return false;
  return null;
}

function parsePrice(v: string | undefined): number | null {
  const t = (v ?? '').trim();
  if (!t) return null;
  // Số thập phân thật (ô số trong Excel, ví dụ 690000.5) -> làm tròn.
  if (/^\d+\.\d{1,2}$/.test(t)) return Math.round(Number(t));
  // Chấp nhận "690000", "690.000", "690,000 đ"... (giá VNĐ luôn là số nguyên).
  const digits = /^[\d\s.,]+(đ|d|vnd|vnđ)?$/i.test(t) ? t.replace(/[^\d]/g, '') : '';
  return digits ? Number(digits) : null;
}

/** Kiểm tra từng dòng và so sánh với dữ liệu hiện có. Không ghi gì cả. */
export function planImport(raw: RawRow[], products: Product[], categoryNames: string[]): ImportPlan {
  const byId = new Map(products.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const rows: ImportRow[] = [];

  for (const r of raw) {
    const errors: string[] = [];
    const id = r.id?.trim() || undefined;
    const name = (r.name ?? '').trim();

    const existing = id ? byId.get(id) : undefined;
    if (id && !existing) errors.push('Không tìm thấy Mã SP (để trống nếu muốn thêm mới)');
    if (id && seen.has(id)) errors.push('Mã SP bị lặp trong file');
    if (id) seen.add(id);

    if (name.length < 3 || name.length > 80) errors.push('Tên phải từ 3–80 ký tự');

    const catInput = (r.category ?? '').trim();
    const category = categoryNames.find((c) => norm(c) === norm(catInput));
    if (!category) errors.push(catInput ? `Danh mục "${catInput}" chưa có` : 'Thiếu danh mục');

    const price = parsePrice(r.price);
    if (price === null) errors.push('Giá không hợp lệ');

    // Giá sau giảm: trống = không giảm.
    const saleRaw = (r.salePrice ?? '').trim();
    const salePrice = saleRaw ? parsePrice(saleRaw) : null;
    if (saleRaw && salePrice === null) errors.push('Giá sau giảm không hợp lệ');
    else if (salePrice !== null && price !== null && salePrice >= price) errors.push('Giá sau giảm phải nhỏ hơn Giá');

    const description = (r.description ?? '').trim();
    if (description.length < 10) errors.push('Mô tả tối thiểu 10 ký tự');

    const inStock = parseBool(r.inStock, true);
    if (inStock === null) errors.push(`Còn hàng phải là ${YES}/${NO}`);
    const featured = parseBool(r.featured, false);
    if (featured === null) errors.push(`Nổi bật phải là ${YES}/${NO}`);

    const tags = [...new Set((r.tags ?? '').split(/[,;]/).map((t) => t.trim().toLowerCase()).filter(Boolean))];

    if (errors.length) {
      rows.push({ line: r.line, kind: 'error', name: name || existing?.name || '(không tên)', id, errors, changes: [] });
      continue;
    }

    const data = { name, category: category!, price: price!, salePrice, description, tags, inStock: inStock!, featured: featured! };
    if (!existing) {
      rows.push({ line: r.line, kind: 'new', name, errors, changes: [], data });
      continue;
    }

    const changes = (Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[])
      .filter((k) => JSON.stringify(existing[k] ?? null) !== JSON.stringify(data[k] ?? null))
      .map((k) => FIELD_LABELS[k]);
    rows.push({ line: r.line, kind: changes.length ? 'update' : 'same', name, id, errors, changes, data });
  }

  const counts = { new: 0, update: 0, same: 0, error: 0 };
  for (const r of rows) counts[r.kind]++;
  return { rows, counts };
}

// ===================== Đọc / ghi file Excel =====================

async function loadExcelJs(): Promise<typeof import('exceljs')> {
  const mod = (await import('exceljs')) as unknown as { default?: typeof import('exceljs') };
  return mod.default ?? (mod as unknown as typeof import('exceljs'));
}

const ROW_PADDING = 300; // số dòng trống có sẵn ô chọn để thêm sản phẩm mới

/** Tạo file Excel theo mẫu. Truyền danh sách rỗng để lấy file mẫu trống. */
export async function buildProductsWorkbook(products: Product[], categoryNames: string[]): Promise<Blob> {
  const ExcelJS = await loadExcelJs();
  const wb: Workbook = new ExcelJS.Workbook();
  wb.creator = 'Fumo Admin';
  wb.created = new Date();

  // --- Sheet dữ liệu ---
  const ws = wb.addWorksheet(SHEET_PRODUCTS, { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.required ? `${c.header} *` : c.header, key: c.key, width: c.width }));

  const header = ws.getRow(1);
  header.height = 22;
  header.eachCell((cell, col) => {
    const c = COLUMNS[col - 1];
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.readOnly ? 'FF8C8F94' : 'FF3A86CC' } };
    cell.alignment = { vertical: 'middle' };
    cell.note = c.note;
  });

  for (const p of products) {
    ws.addRow({
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.price,
      salePrice: onSale(p) ? p.salePrice : null,
      description: p.description,
      tags: p.tags.join(', '),
      inStock: p.inStock ? YES : NO,
      featured: p.featured ? YES : NO,
      imageCount: p.images.length,
    });
  }

  // --- Danh sách cho ô chọn (ẩn) ---
  const lists = wb.addWorksheet(SHEET_LISTS, { state: 'hidden' });
  categoryNames.forEach((name, i) => (lists.getCell(i + 1, 1).value = name));
  [YES, NO].forEach((s, i) => (lists.getCell(i + 1, 3).value = s));

  const col = (key: Key) => COLUMNS.findIndex((c) => c.key === key) + 1;
  const lastRow = products.length + ROW_PADDING;
  const listRule = (range: string, title: string) => ({
    type: 'list' as const,
    allowBlank: true,
    formulae: [`${SHEET_LISTS}!${range}`],
    showErrorMessage: true,
    errorStyle: 'warning' as const,
    errorTitle: title,
    error: 'Giá trị không có trong danh sách.',
  });
  for (let r = 2; r <= lastRow; r++) {
    const row = ws.getRow(r);
    row.getCell(col('category')).dataValidation = listRule(`$A$1:$A$${Math.max(1, categoryNames.length)}`, 'Danh mục');
    row.getCell(col('inStock')).dataValidation = listRule('$C$1:$C$2', 'Còn hàng');
    row.getCell(col('featured')).dataValidation = listRule('$C$1:$C$2', 'Nổi bật');
    row.getCell(col('price')).numFmt = '#,##0';
    row.getCell(col('salePrice')).numFmt = '#,##0';
    row.getCell(col('description')).alignment = { wrapText: true, vertical: 'top' };
    const img = row.getCell(col('imageCount'));
    img.font = { color: { argb: 'FF8C8F94' } };
    if (r <= products.length + 1) img.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F1' } };
  }

  // --- Hướng dẫn ---
  const guide = wb.addWorksheet(SHEET_GUIDE);
  guide.columns = [{ width: 18 }, { width: 90 }];
  const lines: [string, string][] = [
    ['HƯỚNG DẪN', ''],
    ['', `Chỉnh sửa ở sheet "${SHEET_PRODUCTS}", lưu file rồi tải lên tại Quản trị → Sản phẩm → Nhập / xuất Excel.`],
    ['', 'Mỗi dòng là một sản phẩm. Cột có dấu * là bắt buộc.'],
    ['', 'Dòng có Mã SP → cập nhật sản phẩm đó. Dòng để trống Mã SP → thêm sản phẩm mới.'],
    ['', 'Sản phẩm không có trong file sẽ được giữ nguyên (không bị xoá).'],
    ['', 'HÌNH ẢNH không nhập qua Excel: ảnh hiện có được giữ nguyên; sản phẩm mới sẽ có ảnh tạm, hãy vào trang sửa sản phẩm để tải ảnh.'],
    ['', 'Không đổi tên hoặc thứ tự dòng tiêu đề.'],
    ['', ''],
    ['CỘT', 'Ý NGHĨA'],
    ...COLUMNS.map((c): [string, string] => [c.required ? `${c.header} *` : c.header, c.note]),
  ];
  lines.forEach((l) => guide.addRow(l));
  guide.getRow(1).font = { bold: true, size: 14 };
  guide.getRow(9).font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function cellText(cell: Cell): string {
  const v: CellValue = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('result' in v) return v.result === undefined || v.result === null ? '' : String(v.result);
    if ('text' in v) return String(v.text);
  }
  return cell.text ?? '';
}

/** Đọc file Excel đã tải lên thành các dòng thô (theo tên cột, không phụ thuộc thứ tự cột). */
export async function readProductsFile(file: File): Promise<RawRow[]> {
  const ExcelJS = await loadExcelJs();
  const wb: Workbook = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new Error('Không đọc được file. Hãy dùng file .xlsx tải từ trang này.');
  }
  const ws: Worksheet | undefined = wb.getWorksheet(SHEET_PRODUCTS) ?? wb.worksheets.find((w) => w.state === 'visible');
  if (!ws) throw new Error('File không có sheet dữ liệu.');

  const keys = new Map<number, Key>();
  ws.getRow(1).eachCell((cell, col) => {
    const key = HEADER_TO_KEY.get(norm(cellText(cell)));
    if (key) keys.set(col, key);
  });
  const missing = COLUMNS.filter((c) => c.required && ![...keys.values()].includes(c.key)).map((c) => c.header);
  if (missing.length) throw new Error(`File không đúng mẫu — thiếu cột: ${missing.join(', ')}.`);

  const rows: RawRow[] = [];
  ws.eachRow((row, line) => {
    if (line === 1) return;
    const r: RawRow = { line };
    let filled = false;
    for (const [col, key] of keys) {
      if (COLUMNS.find((c) => c.key === key)?.readOnly) continue;
      const text = cellText(row.getCell(col)).trim();
      if (text) {
        r[key] = text;
        filled = true;
      }
    }
    if (filled) rows.push(r);
  });
  return rows;
}

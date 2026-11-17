import { Product } from '../models/product';
import { placeholderImage } from '../shared/placeholder';

const day = 86_400_000;
const now = Date.UTC(2026, 10, 1);

function imgs(label: string, hue: number): string[] {
  const base = Math.round(hue / 60);
  return [0, 1, 2].map((v) => placeholderImage(label, base + v));
}

export const SEED_PRODUCTS: Product[] = [
  {
    id: 'seed-1', name: 'Fumo Hồng Đào', category: 'Fumo Plush', price: 690000,
    description: 'Thú bông mềm mại tông hồng đào, đường may tỉ mỉ, cao khoảng 20cm. Phù hợp trưng bày hoặc ôm ngủ.',
    images: imgs('Hồng Đào', 340), tags: ['dễ thương', 'bán chạy', 'pastel'],
    inStock: true, featured: true, createdAt: now - 1 * day,
  },
  {
    id: 'seed-2', name: 'Fumo Bạc Hà', category: 'Fumo Plush', price: 720000, salePrice: 590000,
    description: 'Phiên bản tóc xanh bạc hà, mắt thêu nổi, vải nhung cao cấp.',
    images: imgs('Bạc Hà', 160), tags: ['pastel', 'mới'],
    inStock: true, featured: true, createdAt: now - 2 * day,
  },
  {
    id: 'seed-3', name: 'Fumo Mini Chanh', category: 'Fumo Plush', price: 390000,
    description: 'Bản mini 10cm nhỏ xinh, dễ mang theo bên mình.',
    images: imgs('Mini Chanh', 55), tags: ['mini', 'dễ thương'],
    inStock: true, featured: false, createdAt: now - 5 * day,
  },
  {
    id: 'seed-4', name: 'Fumo Khổng Lồ Lavender', category: 'Fumo Plush', price: 1490000,
    description: 'Bản cỡ lớn 45cm, nhồi bông dày, ôm cực đã.',
    images: imgs('Lavender', 270), tags: ['cỡ lớn', 'giới hạn'],
    inStock: false, featured: true, createdAt: now - 8 * day,
  },
  {
    id: 'seed-5', name: 'Móc khóa Fumo Cam', category: 'Móc khóa', price: 149000,
    description: 'Móc khóa bông kèm khoen kim loại chắc chắn, treo balo rất xinh.',
    images: imgs('Móc khóa Cam', 25), tags: ['mini', 'quà tặng'],
    inStock: true, featured: false, createdAt: now - 3 * day,
  },
  {
    id: 'seed-6', name: 'Móc khóa Fumo Biển', category: 'Móc khóa', price: 159000, salePrice: 119000,
    description: 'Tông xanh biển mát mắt, có dây đeo điện thoại đi kèm.',
    images: imgs('Móc khóa Biển', 200), tags: ['quà tặng', 'mới'],
    inStock: true, featured: false, createdAt: now - 4 * day,
  },
  {
    id: 'seed-7', name: 'Figure Fumo Ngồi Ghế', category: 'Figure', price: 890000,
    description: 'Figure nhựa PVC sơn tay, tư thế ngồi ghế đọc sách.',
    images: imgs('Figure', 300), tags: ['giới hạn', 'sưu tầm'],
    inStock: true, featured: true, createdAt: now - 10 * day,
  },
  {
    id: 'seed-8', name: 'Túi đựng Fumo trong suốt', category: 'Phụ kiện', price: 259000,
    description: 'Túi ita trong suốt để mang fumo đi dạo, có quai đeo chéo.',
    images: imgs('Túi Ita', 120), tags: ['phụ kiện', 'bán chạy'],
    inStock: true, featured: false, createdAt: now - 12 * day,
  },
  {
    id: 'seed-9', name: 'Bộ quần áo Fumo mùa đông', category: 'Phụ kiện', price: 199000,
    description: 'Áo len và khăn quàng cho fumo cỡ 20cm.',
    images: imgs('Áo len', 10), tags: ['phụ kiện', 'pastel'],
    inStock: false, featured: false, createdAt: now - 15 * day,
  },
];

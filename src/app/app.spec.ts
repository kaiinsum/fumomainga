import { TestBed } from '@angular/core/testing';
import { ProductService } from './services/product.service';
import { SEED_PRODUCTS } from './services/seed-data';
import { NewsService } from './services/news.service';
import { renderMarkdown } from './shared/markdown';
import { CategoryService } from './services/category.service';
import { planImport } from './shared/product-excel';

describe('renderMarkdown', () => {
  it('escapes raw HTML', () => {
    const html = renderMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders headings, bold, lists and blocks unsafe links', () => {
    const html = renderMarkdown('## Tiêu đề\n\n**đậm** [x](javascript:alert(1))\n\n- a\n- b');
    expect(html).toContain('<h2>Tiêu đề</h2>');
    expect(html).toContain('<strong>đậm</strong>');
    expect(html).toContain('<a href="#">x</a>');
    expect(html).toContain('<ul><li>a</li><li>b</li></ul>');
  });
});

describe('NewsService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('only exposes published posts publicly', () => {
    const svc = TestBed.inject(NewsService);
    const draft = svc.add({ title: 'Nháp', excerpt: '', content: 'x', cover: '', status: 'draft' });
    expect(svc.posts().some((p) => p.id === draft.id)).toBe(true);
    expect(svc.published().some((p) => p.id === draft.id)).toBe(false);
    svc.update(draft.id, { status: 'published' });
    expect(svc.published().some((p) => p.id === draft.id)).toBe(true);
  });
});

describe('ProductService', () => {
  let service: ProductService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ProductService);
  });

  it('loads seed data when storage is empty', () => {
    expect(service.products().length).toBe(SEED_PRODUCTS.length);
  });

  it('adds, updates and removes a product and persists it', () => {
    const created = service.add({
      name: 'Test Fumo',
      category: 'Figure',
      price: 100000,
      description: 'Mô tả thử nghiệm',
      images: ['data:image/png;base64,AAAA'],
      tags: ['test'],
      size: 'S',
      inStock: true,
      featured: false,
    });
    expect(service.products()[0].id).toBe(created.id);
    expect(JSON.parse(localStorage.getItem('fumo.products.v1')!)[0].name).toBe('Test Fumo');

    service.update(created.id, { ...created, price: 200000 });
    expect(service.getById(created.id)?.price).toBe(200000);

    service.remove(created.id);
    expect(service.getById(created.id)).toBeUndefined();
  });
});

describe('CategoryService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('renames a category and moves its products along', () => {
    const cats = TestBed.inject(CategoryService);
    const products = TestBed.inject(ProductService);
    const before = products.products().filter((p) => p.category === 'Figure').length;
    cats.update('Figure', { name: 'Mô hình', icon: '🗿' });
    expect(cats.names()).toContain('Mô hình');
    expect(products.products().filter((p) => p.category === 'Mô hình').length).toBe(before);
    expect(() => cats.add('mô hình', '')).toThrow();
  });

  it('requires a target when deleting a category in use', () => {
    const cats = TestBed.inject(CategoryService);
    const products = TestBed.inject(ProductService);
    expect(() => cats.remove('Figure')).toThrow();
    cats.remove('Figure', 'Phụ kiện');
    expect(cats.find('Figure')).toBeUndefined();
    expect(products.products().some((p) => p.category === 'Figure')).toBe(false);
  });
});

describe('planImport (Excel)', () => {
  const cats = ['Fumo Plush', 'Móc khóa', 'Figure', 'Phụ kiện'];
  const p = SEED_PRODUCTS[0];
  const base = {
    name: p.name, category: p.category, price: String(p.price), size: p.size, description: p.description,
    tags: p.tags.join(', '), inStock: p.inStock ? 'Có' : 'Không', featured: p.featured ? 'Có' : 'Không',
  };

  it('classifies unchanged, updated, new and invalid rows', () => {
    const plan = planImport(
      [
        { line: 2, id: p.id, ...base },
        { line: 3, id: p.id, ...base },
        { line: 4, id: SEED_PRODUCTS[1].id, ...base, name: 'Tên mới nè', price: '700.000 đ' },
        { line: 5, ...base, name: 'Sản phẩm mới', category: 'móc khoá', size: 'l' },
        { line: 6, id: 'khong-co', ...base },
        { line: 7, ...base, category: 'Không tồn tại', size: 'XL', inStock: 'hmm' },
      ],
      SEED_PRODUCTS,
      cats,
    );
    expect(plan.rows.map((r) => r.kind)).toEqual(['same', 'error', 'update', 'new', 'error', 'error']);
    expect(plan.rows[2].data?.price).toBe(700000);
    expect(plan.rows[2].changes).toContain('Tên');
    expect(plan.rows[3].data?.category).toBe('Móc khóa');
    expect(plan.rows[3].data?.size).toBe('L');
    expect(plan.rows[5].errors.length).toBe(3);
  });

  it('applies updates without touching images', () => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    const svc = TestBed.inject(ProductService);
    const imgs = svc.getById(p.id)!.images;
    svc.applyImport([{ id: p.id, patch: { price: 1, images: [] } }], []);
    expect(svc.getById(p.id)!.price).toBe(1);
    expect(svc.getById(p.id)!.images).toEqual(imgs);
  });
});

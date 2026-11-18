-- =====================================================================
-- Cơ sở dữ liệu Fumo Mai Nga trên Supabase.
-- Cách dùng: Supabase → SQL Editor → New query → dán toàn bộ file này → Run.
-- Chạy lại nhiều lần cũng không sao (chỉ tạo khi chưa có).
--
-- Bảo mật: mọi bảng đều BẬT Row Level Security và KHÔNG có policy nào,
-- nên khoá công khai (anon key) không đọc / ghi được gì. Chỉ máy chủ (Vercel Functions)
-- dùng SERVICE ROLE KEY mới truy cập được — thông tin khách hàng không bị lộ ra trình duyệt.
-- =====================================================================

-- ---------- Khách hàng (mỗi số điện thoại là một khách) ----------
create table if not exists public.customers (
  id          bigint generated always as identity primary key,
  phone       text not null unique,          -- chỉ chữ số, dùng để nhận diện khách
  name        text not null,
  email       text not null default '',
  address     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- Đơn hàng ----------
create table if not exists public.orders (
  code           text primary key,             -- FMxxxxxx (khách thấy trong popup QR)
  status         text not null default 'pending'
                 check (status in ('pending', 'paid', 'shipping', 'done', 'cancelled')),
  customer_id    bigint references public.customers (id) on delete set null,
  customer       jsonb not null,               -- thông tin người nhận lúc đặt (tên, sđt, email, địa chỉ, ghi chú)
  total          bigint not null check (total >= 0),
  admin_note     text not null default '',
  paid_claim_at  timestamptz,                  -- lúc khách bấm "Tôi đã chuyển khoản"
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_customer_idx on public.orders (customer_id);

-- ---------- Sản phẩm trong từng đơn (giỏ hàng lúc đặt) ----------
create table if not exists public.order_items (
  id          bigint generated always as identity primary key,
  order_code  text not null references public.orders (code) on delete cascade,
  product_id  text not null default '',
  name        text not null,
  price       bigint not null check (price >= 0),
  qty         integer not null check (qty between 1 and 99)
);
create index if not exists order_items_order_idx on public.order_items (order_code);

-- ---------- Lời nhắn từ trang Liên hệ ----------
create table if not exists public.contacts (
  id          bigint generated always as identity primary key,
  name        text not null,
  phone       text not null default '',
  email       text not null default '',
  message     text not null,
  status      text not null default 'new' check (status in ('new', 'done')),
  admin_note  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists contacts_created_at_idx on public.contacts (created_at desc);

-- ---------- Sản phẩm (đồng bộ từ Admin → Trợ lý AI → "Đồng bộ dữ liệu cho AI") ----------
create table if not exists public.products (
  id           text primary key,
  name         text not null,
  category     text not null default '',
  price        bigint not null default 0,
  sale_price   bigint,                       -- giá sau giảm, null = không giảm
  in_stock     boolean not null default true,
  featured     boolean not null default false,
  tags         text[] not null default '{}',
  description  text not null default '',
  synced_at    timestamptz not null default now()
);

-- Nâng cấp DB cũ: thêm cột giá giảm, bỏ cột kích thước.
alter table public.products add column if not exists sale_price bigint;
alter table public.products drop column if exists size;

-- ---------- Dữ liệu dạng khoá–giá trị (kiến thức AI, ảnh chụp dữ liệu website...) ----------
create table if not exists public.app_kv (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ---------- Chống spam: đếm số lần gọi theo IP trong một khoảng thời gian ----------
create table if not exists public.rate_limits (
  key       text primary key,
  count     integer not null,
  reset_at  timestamptz not null
);

create or replace function public.hit_rate_limit(p_key text, p_window_sec integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.rate_limits as r (key, count, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_sec))
  on conflict (key) do update
    set count    = case when r.reset_at < now() then 1 else r.count + 1 end,
        reset_at = case when r.reset_at < now() then now() + make_interval(secs => p_window_sec) else r.reset_at end
  returning count into n;
  return n;
end;
$$;

-- Hàm chống spam chỉ cho máy chủ gọi.
revoke all on function public.hit_rate_limit(text, integer) from public, anon, authenticated;

-- ---------- Lưu đơn trong MỘT lần gọi (khách hàng + đơn + sản phẩm, cùng một giao dịch) ----------
-- Trước đây máy chủ phải gọi Supabase 4 lần nối tiếp cho mỗi đơn → chậm, dễ lỗi giữa chừng.
create or replace function public.save_order(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cid bigint;
begin
  insert into public.customers (phone, name, email, address, updated_at)
  values (p->>'phone', p->'customer'->>'name', coalesce(p->'customer'->>'email', ''), coalesce(p->'customer'->>'address', ''), now())
  on conflict (phone) do update
    set name = excluded.name, email = excluded.email, address = excluded.address, updated_at = now()
  returning id into cid;

  insert into public.orders (code, status, customer_id, customer, total, admin_note, paid_claim_at, created_at, updated_at)
  values (
    p->>'code', p->>'status', cid, p->'customer', (p->>'total')::bigint, coalesce(p->>'admin_note', ''),
    (p->>'paid_claim_at')::timestamptz, (p->>'created_at')::timestamptz, (p->>'updated_at')::timestamptz
  )
  on conflict (code) do update
    set status = excluded.status, customer_id = excluded.customer_id, customer = excluded.customer, total = excluded.total,
        admin_note = excluded.admin_note, paid_claim_at = excluded.paid_claim_at, updated_at = excluded.updated_at;

  delete from public.order_items where order_code = p->>'code';
  insert into public.order_items (order_code, product_id, name, price, qty)
  select p->>'code', coalesce(i->>'id', ''), i->>'name', (i->>'price')::bigint, (i->>'qty')::integer
  from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) as i;
end;
$$;

revoke all on function public.save_order(jsonb) from public, anon, authenticated;

-- ---------- Bật RLS, không mở policy nào cho anon / authenticated ----------
alter table public.customers   enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;
alter table public.products    enable row level security;
alter table public.app_kv      enable row level security;
alter table public.rate_limits enable row level security;
alter table public.contacts    enable row level security;

-- ---------- Thống kê truy cập (trang admin "Thống kê") ----------
-- Mỗi lần khách mở một trang = 1 dòng. vid = mã khách (lưu trên trình duyệt), sid = phiên.
create table if not exists public.page_views (
  id   bigint generated always as identity primary key,
  at   timestamptz not null default now(),
  vid  text not null,
  sid  text,
  path text,
  ip   text,
  ua   text,
  ref  text
);
create index if not exists page_views_at_idx on public.page_views (at desc);

-- Khách đang mở web: cập nhật mỗi ~30 giây khi tab còn hiển thị.
create table if not exists public.visitors_online (
  vid       text primary key,
  last_seen timestamptz not null default now(),
  path      text,
  ip        text,
  ua        text
);
create index if not exists visitors_online_seen_idx on public.visitors_online (last_seen desc);

-- Gom lượt xem / số khách theo từng phút / giờ / ngày / tháng (giờ Việt Nam).
create or replace function public.analytics_series(p_from timestamptz, p_unit text)
returns table (bucket timestamptz, views bigint, visitors bigint)
language sql stable
as $$
  select date_trunc(p_unit, at, 'Asia/Ho_Chi_Minh') as bucket, count(*), count(distinct vid)
  from public.page_views
  where at >= p_from
  group by 1
  order by 1;
$$;

-- Tổng lượt xem + số khách khác nhau từ một mốc (null = toàn bộ).
create or replace function public.analytics_totals(p_from timestamptz)
returns table (views bigint, visitors bigint)
language sql stable
as $$
  select count(*), count(distinct vid) from public.page_views where p_from is null or at >= p_from;
$$;

-- Trang được xem nhiều nhất từ một mốc.
create or replace function public.analytics_top_pages(p_from timestamptz, p_limit integer)
returns table (path text, views bigint, visitors bigint)
language sql stable
as $$
  select coalesce(path, '/'), count(*), count(distinct vid)
  from public.page_views
  where p_from is null or at >= p_from
  group by 1
  order by 2 desc
  limit p_limit;
$$;

revoke all on function public.analytics_series(timestamptz, text) from public, anon, authenticated;
revoke all on function public.analytics_totals(timestamptz) from public, anon, authenticated;
revoke all on function public.analytics_top_pages(timestamptz, integer) from public, anon, authenticated;
alter table public.page_views      enable row level security;
alter table public.visitors_online enable row level security;

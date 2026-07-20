-- DTCDecoder v1 schema: products, purchasable files, orders, order items.
create extension if not exists pgcrypto;

create table products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text,
  category text not null check (category in ('wiring_diagram', 'software_tool')),
  vehicle_make text,
  vehicle_model text,
  vehicle_year_start int,
  vehicle_year_end int,
  vehicle_system text,
  price_cents int not null check (price_cents > 0),
  currency text not null default 'usd',
  creem_product_id text,
  thumbnail_path text not null,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_category_idx on products (category);
create index products_published_idx on products (is_published);

create table product_files (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  storage_path text unique not null,
  file_name text not null,
  created_at timestamptz not null default now()
);

create index product_files_product_id_idx on product_files (product_id);

create table orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'refunded')),
  total_cents int not null check (total_cents >= 0),
  currency text not null default 'usd',
  creem_checkout_id text unique,
  provider_event_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index orders_user_id_idx on orders (user_id);
create index orders_email_idx on orders (email);
create index orders_status_idx on orders (status);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  product_id uuid not null references products (id),
  unit_price_cents int not null check (unit_price_cents >= 0),
  created_at timestamptz not null default now()
);

create index order_items_order_id_idx on order_items (order_id);
create index order_items_product_id_idx on order_items (product_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger products_set_updated_at
before update on products
for each row execute function set_updated_at();

-- Row Level Security: server routes use the service-role client (which
-- bypasses RLS) for every write and for any read that needs to cross a
-- purchase-ownership boundary. These policies only govern direct
-- anon/authenticated reads from the browser.
alter table products enable row level security;
alter table product_files enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

create policy products_public_read on products
  for select
  using (is_published = true);

-- product_files rows are never useful without a purchase; block direct
-- reads entirely and serve downloads only via signed URLs from the
-- service-role client after an ownership check.
create policy product_files_no_direct_read on product_files
  for select
  using (false);

create policy orders_owner_read on orders
  for select
  using (auth.uid() = user_id);

create policy order_items_owner_read on order_items
  for select
  using (
    exists (
      select 1 from orders
      where orders.id = order_items.order_id
        and orders.user_id = auth.uid()
    )
  );

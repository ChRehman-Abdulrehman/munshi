-- Munshi: core schema, RLS, views, and RPCs.
-- Mirrors the local IndexedDB repo so both modes behave identically.

create extension if not exists pgcrypto;

-- ---------- enums ----------
do $$ begin
  create type entry_type as enum ('sale','payment','refund','stock_in','adjustment');
  create type pay_method as enum ('cash','easypaisa','jazzcash','bank','credit');
  create type entry_status as enum ('active','reversed','needs_review');
  create type entry_source as enum ('voice','text','manual','ocr','import','seed');
  create type member_role as enum ('owner','staff');
  create type wanted_reason as enum ('out_of_stock','price','variant','deferred','other');
  create type wanted_status as enum ('new','to_order','ordered','arrived','customer_notified','converted','closed');
  create type alert_type as enum ('credit','low_stock','missed_demand','hot','summary','overdue','info');
  create type severity as enum ('info','warning','critical');
  create type movement_type as enum ('sale','stock_in','adjustment','reversal','refund');
exception when duplicate_object then null; end $$;

-- ---------- tables ----------
create table if not exists shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'Asia/Karachi',
  currency text not null default 'PKR',
  is_demo boolean not null default false,
  settings jsonb not null default '{
    "default_credit_limit": 5000,
    "overdue_days": 30,
    "hot_window_days": 7,
    "hot_min_units": 5,
    "hot_growth_pct": 20,
    "low_stock_default": 2,
    "store_transcripts": true,
    "store_ocr_images": false,
    "retention_days": 365,
    "language": "roman",
    "voice_reply": false
  }'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  role member_role not null default 'staff',
  permissions jsonb not null default '{"can_override_credit":false,"can_view_phones":true,"can_edit_entries":false,"can_share_statements":true}'::jsonb,
  pin_hash text,
  created_at timestamptz not null default now(),
  unique (shop_id, user_id)
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  phone text,
  notes text,
  credit_limit numeric,
  payment_terms_days int,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  aliases text[] not null default '{}',
  category text,
  unit text not null default 'pc',
  selling_price numeric not null default 0,
  cost_price numeric,
  stock_qty numeric not null default 0,
  min_stock numeric not null default 2,
  preferred_restock_qty numeric,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  type entry_type not null,
  customer_id uuid references customers(id) on delete set null,
  occurred_at timestamptz not null default now(),
  total numeric not null default 0 check (total >= 0),
  paid_now numeric not null default 0 check (paid_now >= 0),
  credit_amount numeric not null default 0,
  method pay_method not null default 'cash',
  status entry_status not null default 'active',
  replaces_id uuid references entries(id),
  reversed_by_id uuid references entries(id),
  source entry_source not null default 'manual',
  created_by uuid references auth.users(id),
  idempotency_key text not null,
  note text,
  created_at timestamptz not null default now(),
  unique (shop_id, idempotency_key)
);

create table if not exists entry_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references entries(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  description text not null,
  qty numeric not null check (qty > 0),
  unit text not null default 'pc',
  unit_price numeric not null default 0,
  discount numeric not null default 0,
  line_total numeric not null default 0
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  entry_id uuid references entries(id) on delete set null,
  amount numeric not null check (amount > 0),
  date timestamptz not null default now(),
  method pay_method not null default 'cash',
  reference text
);

create table if not exists allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete cascade,
  sale_entry_id uuid not null references entries(id) on delete cascade,
  amount numeric not null check (amount > 0)
);

create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  type movement_type not null,
  qty_change numeric not null,
  entry_id uuid references entries(id) on delete set null,
  at timestamptz not null default now()
);

create table if not exists wanted_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  item_text text not null,
  product_id uuid references products(id) on delete set null,
  variant_note text,
  qty numeric not null default 1,
  customer_id uuid references customers(id) on delete set null,
  contact_permission boolean not null default false,
  reason wanted_reason not null default 'out_of_stock',
  expected_price numeric,
  status wanted_status not null default 'new',
  requested_at timestamptz not null default now(),
  linked_entry_id uuid references entries(id) on delete set null,
  notes text
);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  type alert_type not null,
  severity severity not null default 'info',
  title text not null,
  message text not null,
  related_type text,
  related_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  resolved_at timestamptz,
  snoozed_until timestamptz,
  action jsonb
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  actor uuid references auth.users(id),
  actor_name text,
  action text not null,
  entity text not null,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists share_links (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  from_date timestamptz not null,
  to_date timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists push_subscriptions (
  endpoint text primary key,
  shop_id uuid references shops(id) on delete cascade,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  data jsonb not null,
  review_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists entries_shop_occurred on entries (shop_id, occurred_at desc);
create index if not exists entries_customer on entries (customer_id, occurred_at desc);
create index if not exists payments_customer on payments (customer_id, date desc);
create index if not exists wanted_shop_status on wanted_requests (shop_id, status);
create index if not exists alerts_shop_unresolved on alerts (shop_id, created_at desc) where resolved_at is null;
create index if not exists products_shop on products (shop_id) where active;
create index if not exists customers_shop on customers (shop_id);

-- ---------- membership helper + RLS ----------
create or replace function is_member(p_shop uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from members m
    where m.shop_id = p_shop and m.user_id = auth.uid()
  );
$$;

create or replace function member_can_override(p_shop uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from members m
    where m.shop_id = p_shop and m.user_id = auth.uid()
      and (m.role = 'owner' or (m.permissions->>'can_override_credit')::boolean)
  );
$$;

alter table shops enable row level security;
alter table members enable row level security;
alter table customers enable row level security;
alter table products enable row level security;
alter table entries enable row level security;
alter table entry_lines enable row level security;
alter table payments enable row level security;
alter table allocations enable row level security;
alter table inventory_movements enable row level security;
alter table wanted_requests enable row level security;
alter table alerts enable row level security;
alter table audit_log enable row level security;
alter table share_links enable row level security;
alter table push_subscriptions enable row level security;
alter table drafts enable row level security;

do $$ begin
  create policy shops_member on shops for select using (is_member(id));
  create policy shops_update on shops for update using (is_member(id));
  create policy members_self on members for select using (shop_id in (select shop_id from members where user_id = auth.uid()));
  create policy customers_tenant on customers for all using (is_member(shop_id)) with check (is_member(shop_id));
  create policy products_tenant on products for all using (is_member(shop_id)) with check (is_member(shop_id));
  create policy entries_tenant on entries for all using (is_member(shop_id)) with check (is_member(shop_id));
  create policy entry_lines_tenant on entry_lines for all using (
    exists (select 1 from entries e where e.id = entry_id and is_member(e.shop_id))
  ) with check (
    exists (select 1 from entries e where e.id = entry_id and is_member(e.shop_id))
  );
  create policy payments_tenant on payments for all using (is_member(shop_id)) with check (is_member(shop_id));
  create policy allocations_tenant on allocations for all using (
    exists (select 1 from payments p where p.id = payment_id and is_member(p.shop_id))
  ) with check (
    exists (select 1 from payments p where p.id = payment_id and is_member(p.shop_id))
  );
  create policy movements_tenant on inventory_movements for all using (is_member(shop_id)) with check (is_member(shop_id));
  create policy wanted_tenant on wanted_requests for all using (is_member(shop_id)) with check (is_member(shop_id));
  create policy alerts_tenant on alerts for all using (is_member(shop_id)) with check (is_member(shop_id));
  create policy audit_tenant on audit_log for select using (is_member(shop_id));
  create policy share_links_tenant on share_links for all using (is_member(shop_id)) with check (is_member(shop_id));
  create policy push_tenant on push_subscriptions for all using (is_member(shop_id)) with check (is_member(shop_id));
  create policy drafts_tenant on drafts for all using (is_member(shop_id)) with check (is_member(shop_id));
exception when duplicate_object then null; end $$;

-- ---------- views ----------
create or replace view customer_balance as
select
  c.id as customer_id,
  c.shop_id,
  c.name,
  coalesce((
    select sum(case
      when e.type = 'sale' then e.credit_amount
      when e.type = 'refund' then -e.total
      when e.type = 'adjustment' then e.credit_amount
      else 0 end)
    from entries e
    where e.customer_id = c.id and e.status = 'active'
  ), 0)
  - coalesce((
    select sum(p.amount) from payments p where p.customer_id = c.id
  ), 0) as balance
from customers c;

create or replace view sale_status as
select
  e.id as entry_id,
  e.shop_id,
  e.total,
  e.paid_now,
  coalesce((select sum(a.amount) from allocations a where a.sale_entry_id = e.id), 0) as allocated,
  case
    when e.status = 'reversed' then 'Reversed'
    when e.total <= 0 then 'Paid'
    when e.paid_now + coalesce((select sum(a.amount) from allocations a where a.sale_entry_id = e.id), 0) >= e.total then 'Paid'
    when e.paid_now + coalesce((select sum(a.amount) from allocations a where a.sale_entry_id = e.id), 0) <= 0 then 'Unpaid'
    else 'Partially paid'
  end as status
from entries e
where e.type = 'sale';

-- ---------- RPC: create_shop ----------
create or replace function create_shop(p_name text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_shop uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  insert into shops (name) values (p_name) returning id into v_shop;
  insert into members (shop_id, user_id, name, role, permissions)
  values (v_shop, auth.uid(), coalesce(auth.jwt()->>'name', 'Owner'), 'owner',
          '{"can_override_credit":true,"can_view_phones":true,"can_edit_entries":true,"can_share_statements":true}'::jsonb);
  return v_shop;
end $$;

-- ---------- RPC: commit_entry (atomic, row-locked credit check) ----------
create or replace function commit_entry(payload jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_shop uuid := (payload->>'shop_id')::uuid;
  v_type entry_type := (payload->>'type')::entry_type;
  v_customer uuid := nullif(payload->>'customer_id','')::uuid;
  v_total numeric := coalesce((payload->>'total')::numeric, 0);
  v_paid numeric := coalesce((payload->>'paid_now')::numeric, 0);
  v_credit numeric := greatest(v_total - least(v_paid, v_total), 0);
  v_method pay_method := coalesce((payload->>'method')::pay_method, 'cash');
  v_source entry_source := coalesce((payload->>'source')::entry_source, 'manual');
  v_key text := payload->>'idempotency_key';
  v_note text := payload->>'note';
  v_override text := payload->>'override_reason';
  v_lines jsonb := coalesce(payload->'lines', '[]'::jsonb);
  v_occurred timestamptz := coalesce((payload->>'occurred_at')::timestamptz, now());
  v_entry uuid;
  v_entry_row entries%rowtype;
  v_balance numeric := 0;
  v_limit numeric;
  v_default numeric;
  v_line jsonb;
  v_sale record;
  v_remaining numeric;
  v_alloc numeric;
  v_payment uuid;
  v_line_total numeric := 0;
  v_recent_hot int;
  v_units numeric;
  v_prod uuid;
  v_prod_stock numeric;
  v_min_stock numeric;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not is_member(v_shop) then raise exception 'NOT_MEMBER'; end if;

  if exists (select 1 from entries where shop_id = v_shop and idempotency_key = v_key) then
    raise exception 'DUPLICATE';
  end if;

  if v_type = 'sale' then
    select coalesce(sum((l->>'qty')::numeric * (l->>'unit_price')::numeric - coalesce((l->>'discount')::numeric, 0)), 0)
      into v_line_total from jsonb_array_elements(v_lines) l;
    if v_line_total > 0 then v_total := v_line_total; end if;
    v_credit := greatest(v_total - least(v_paid, v_total), 0);
  end if;

  if v_customer is not null then
    select balance into v_balance from customer_balance where customer_id = v_customer for update;
    if v_balance is null then
      select balance into v_balance from customer_balance where customer_id = v_customer;
      v_balance := coalesce(v_balance, 0);
    end if;
  end if;

  if v_type = 'sale' and v_credit > 0 and v_customer is not null then
    select coalesce(c.credit_limit, (s.settings->>'default_credit_limit')::numeric), (s.settings->>'default_credit_limit')::numeric
      into v_limit, v_default
      from customers c join shops s on s.id = c.shop_id
      where c.id = v_customer;
    v_limit := coalesce(v_limit, v_default);
    if v_limit <= 0 or v_balance + v_credit >= v_limit then
      if v_override is null or length(trim(v_override)) < 3 or not member_can_override(v_shop) then
        raise exception 'CREDIT_BLOCK';
      end if;
      insert into audit_log (shop_id, actor, action, entity, before, after, reason)
      values (v_shop, auth.uid(), 'credit_override', 'customer',
              jsonb_build_object('balance', v_balance, 'limit', v_limit),
              jsonb_build_object('credit_amount', v_credit),
              v_override);
    elsif (v_balance + v_credit) >= v_limit * 0.8 then
      insert into alerts (shop_id, type, severity, title, message, related_type, related_id, action)
      values (v_shop, 'credit', 'warning',
              (select name from customers where id = v_customer) || ' limit ke qareeb',
              'Balance Rs ' || round(v_balance + v_credit) || ' — limit Rs ' || round(v_limit) || '.',
              'customer', v_customer,
              jsonb_build_object('label','Customer dekhein','href','/khata/' || v_customer));
    end if;
  end if;

  if v_type = 'payment' and v_customer is null then
    raise exception 'VALIDATION: payment ke liye customer zaroori hai';
  end if;

  insert into entries (shop_id, type, customer_id, occurred_at, total, paid_now, credit_amount, method, status, source, created_by, idempotency_key, note)
  values (v_shop, v_type, v_customer, v_occurred, v_total,
          case when v_type = 'sale' then least(v_paid, v_total) else v_total end,
          case when v_type = 'sale' then v_credit else 0 end,
          v_method, 'active', v_source, auth.uid(), v_key, v_note)
  returning id into v_entry;

  for v_line in select * from jsonb_array_elements(v_lines) loop
    insert into entry_lines (entry_id, product_id, description, qty, unit, unit_price, discount, line_total)
    values (v_entry,
            nullif(v_line->>'product_id','')::uuid,
            left(v_line->>'description', 200),
            (v_line->>'qty')::numeric,
            coalesce(v_line->>'unit','pc'),
            (v_line->>'unit_price')::numeric,
            coalesce((v_line->>'discount')::numeric, 0),
            (v_line->>'qty')::numeric * (v_line->>'unit_price')::numeric - coalesce((v_line->>'discount')::numeric, 0));

    v_prod := nullif(v_line->>'product_id','')::uuid;
    if v_prod is not null then
      if v_type in ('sale','refund') then
        insert into inventory_movements (shop_id, product_id, type, qty_change, entry_id, at)
        values (v_shop, v_prod, case when v_type='sale' then 'sale'::movement_type else 'refund'::movement_type end,
                case when v_type='sale' then -(v_line->>'qty')::numeric else (v_line->>'qty')::numeric end,
                v_entry, v_occurred);
      else
        insert into inventory_movements (shop_id, product_id, type, qty_change, entry_id, at)
        values (v_shop, v_prod, case when v_type='stock_in' then 'stock_in'::movement_type else 'adjustment'::movement_type end,
                abs((v_line->>'qty')::numeric), v_entry, v_occurred);
      end if;

      select stock_qty + case when v_type='sale' then -(v_line->>'qty')::numeric
                              when v_type='stock_in' then abs((v_line->>'qty')::numeric)
                              when v_type='refund' then (v_line->>'qty')::numeric
                              else abs((v_line->>'qty')::numeric) end,
             min_stock
        into v_prod_stock, v_min_stock
        from products where id = v_prod;
      update products set stock_qty = v_prod_stock where id = v_prod;
      if v_type = 'sale' and v_prod_stock <= v_min_stock then
        insert into alerts (shop_id, type, severity, title, message, related_type, related_id, action)
        values (v_shop, 'low_stock', 'warning',
                (select name from products where id = v_prod) || ' stock kam hai',
                'Sirf ' || v_prod_stock || ' baqi — mangwana behtar hai.',
                'product', v_prod,
                jsonb_build_object('label','Mangwane mein daalein','href','/stock?tab=mangwana'));
      end if;
    end if;
  end loop;

  if v_type = 'payment' then
    insert into payments (shop_id, customer_id, entry_id, amount, date, method)
    values (v_shop, v_customer, v_entry, v_total, v_occurred, case when v_method = 'credit' then 'cash'::pay_method else v_method end);

    v_remaining := v_total;
    for v_sale in
      select e.id, e.total, e.paid_now, coalesce((select sum(a.amount) from allocations a where a.sale_entry_id = e.id), 0) as allocated
      from entries e
      where e.customer_id = v_customer and e.type = 'sale' and e.status = 'active'
      order by e.occurred_at asc
    loop
      exit when v_remaining <= 0;
      v_alloc := least(v_remaining, greatest(v_sale.total - v_sale.paid_now - v_sale.allocated, 0));
      if v_alloc > 0 then
        insert into allocations (payment_id, sale_entry_id, amount) values (v_entry, v_sale.id, v_alloc);
        v_remaining := v_remaining - v_alloc;
      end if;
    end loop;
  end if;

  return jsonb_build_object('entry_id', v_entry, 'total', v_total);
end $$;

-- ---------- RPC: reverse_entry / restore_entry ----------
create or replace function reverse_entry(entry_id uuid, reason text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_entry entries%rowtype;
  v_line entry_lines%rowtype;
  v_rev uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_entry from entries where id = entry_id for update;
  if v_entry.id is null then raise exception 'NOT_FOUND'; end if;
  if not is_member(v_entry.shop_id) then raise exception 'NOT_MEMBER'; end if;
  if v_entry.status <> 'active' then raise exception 'ALREADY_REVERSED'; end if;
  if reason is null or length(trim(reason)) < 3 then raise exception 'REASON_REQUIRED'; end if;

  insert into entries (shop_id, type, customer_id, occurred_at, total, paid_now, credit_amount, method, status, source, created_by, idempotency_key, note, replaces_id)
  values (v_entry.shop_id, v_entry.type, v_entry.customer_id, now(), v_entry.total, 0, 0, v_entry.method, 'reversed', 'manual', auth.uid(),
          'rev-' || v_entry.id || '-' || extract(epoch from now())::text, 'Reverse: ' || reason, v_entry.id)
  returning id into v_rev;

  update entries set status = 'reversed', reversed_by_id = v_rev where id = entry_id;

  for v_line in select * from entry_lines where entry_id = entry_id loop
    if v_line.product_id is not null then
      insert into inventory_movements (shop_id, product_id, type, qty_change, entry_id, at)
      values (v_entry.shop_id, v_line.product_id, 'reversal', v_line.qty, v_entry.id, now());
      update products set stock_qty = stock_qty + v_line.qty where id = v_line.product_id;
    end if;
  end loop;

  if v_entry.type = 'payment' then
    delete from allocations where payment_id = v_entry.id;
    delete from payments where entry_id = v_entry.id;
  end if;

  insert into audit_log (shop_id, actor, action, entity, before, after, reason)
  values (v_entry.shop_id, auth.uid(), 'reverse_entry', 'entry', to_jsonb(v_entry), jsonb_build_object('status','reversed','reversed_by',v_rev), reason);

  return jsonb_build_object('entry_id', entry_id, 'reversed_by', v_rev);
end $$;

create or replace function restore_entry(entry_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_entry entries%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_entry from entries where id = entry_id for update;
  if v_entry.id is null then raise exception 'NOT_FOUND'; end if;
  if not is_member(v_entry.shop_id) then raise exception 'NOT_MEMBER'; end if;
  if v_entry.status <> 'reversed' then raise exception 'NOT_REVERSED'; end if;

  update entries set status = 'active', reversed_by_id = null where id = entry_id;
  update entries set status = 'reversed' where id = v_entry.reversed_by_id;
  insert into audit_log (shop_id, actor, action, entity, reason)
  values (v_entry.shop_id, auth.uid(), 'restore_entry', 'entry', 'restore');
  return jsonb_build_object('entry_id', entry_id);
end $$;

-- ---------- RPC: set_credit_limit ----------
create or replace function set_credit_limit(customer_id uuid, new_limit numeric, reason text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_customer customers%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_customer from customers where id = customer_id for update;
  if v_customer.id is null then raise exception 'NOT_FOUND'; end if;
  if not is_member(v_customer.shop_id) then raise exception 'NOT_MEMBER'; end if;
  update customers set credit_limit = new_limit where id = customer_id;
  insert into audit_log (shop_id, actor, action, entity, before, after, reason)
  values (v_customer.shop_id, auth.uid(), 'set_credit_limit', 'customer',
          jsonb_build_object('credit_limit', v_customer.credit_limit),
          jsonb_build_object('credit_limit', new_limit), reason);
  return jsonb_build_object('customer_id', customer_id, 'credit_limit', new_limit);
end $$;

-- ---------- RPC: resolve_wanted / link_recovered_sale ----------
create or replace function resolve_wanted(wanted_id uuid, new_status wanted_status, add_stock boolean default false, qty numeric default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_w wanted_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_w from wanted_requests where id = wanted_id for update;
  if v_w.id is null then raise exception 'NOT_FOUND'; end if;
  if not is_member(v_w.shop_id) then raise exception 'NOT_MEMBER'; end if;

  update wanted_requests set status = new_status where id = wanted_id;

  if add_stock and v_w.product_id is not null then
    insert into inventory_movements (shop_id, product_id, type, qty_change, at)
    values (v_w.shop_id, v_w.product_id, 'stock_in', coalesce(qty, v_w.qty), now());
    update products set stock_qty = stock_qty + coalesce(qty, v_w.qty) where id = v_w.product_id;
  end if;

  return jsonb_build_object('wanted_id', wanted_id, 'status', new_status);
end $$;

create or replace function link_recovered_sale(wanted_id uuid, entry_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_w wanted_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_w from wanted_requests where id = wanted_id for update;
  if v_w.id is null then raise exception 'NOT_FOUND'; end if;
  if not is_member(v_w.shop_id) then raise exception 'NOT_MEMBER'; end if;
  update wanted_requests set status = 'converted', linked_entry_id = entry_id where id = wanted_id;
  return jsonb_build_object('wanted_id', wanted_id, 'entry_id', entry_id, 'status', 'converted');
end $$;

-- ---------- RPC: share links ----------
create or replace function create_share_link(customer_id uuid, from_date timestamptz, to_date timestamptz, expires_at timestamptz)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_customer customers%rowtype;
  v_token text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_customer from customers where id = customer_id;
  if v_customer.id is null then raise exception 'NOT_FOUND'; end if;
  if not is_member(v_customer.shop_id) then raise exception 'NOT_MEMBER'; end if;
  insert into share_links (shop_id, customer_id, from_date, to_date, expires_at, created_by)
  values (v_customer.shop_id, customer_id, from_date, to_date, expires_at, auth.uid())
  returning token into v_token;
  return jsonb_build_object('token', v_token);
end $$;

create or replace function get_share_by_token(token text)
returns jsonb
language plpgsql security definer stable
set search_path = public
as $$
declare
  v_link share_links%rowtype;
  v_customer customers%rowtype;
  v_entries jsonb;
  v_payments jsonb;
  v_allocations jsonb;
begin
  select * into v_link from share_links where share_links.token = get_share_by_token.token;
  if v_link.id is null then return null; end if;
  if v_link.revoked_at is not null then return null; end if;
  if v_link.expires_at < now() then return null; end if;

  select * into v_customer from customers where id = v_link.customer_id;

  select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) into v_entries
  from entries e
  where e.customer_id = v_link.customer_id
    and e.occurred_at >= v_link.from_date and e.occurred_at <= v_link.to_date;

  select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_payments
  from payments p
  where p.customer_id = v_link.customer_id
    and p.date >= v_link.from_date and p.date <= v_link.to_date;

  select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into v_allocations
  from allocations a
  join payments p on p.id = a.payment_id
  where p.customer_id = v_link.customer_id;

  return jsonb_build_object(
    'link', to_jsonb(v_link),
    'customer', to_jsonb(v_customer),
    'entries', v_entries,
    'payments', v_payments,
    'allocations', v_allocations
  );
end $$;

-- ---------- RPC: reconcile_balances ----------
create or replace function reconcile_balances()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_checked int := 0;
  v_diffs jsonb := '[]'::jsonb;
  v_row record;
  v_derived numeric;
begin
  for v_row in select c.id, c.shop_id from customers c loop
    if auth.uid() is not null and not is_member(v_row.shop_id) then continue; end if;
    v_checked := v_checked + 1;
    select coalesce(sum(case
        when e.type = 'sale' then e.credit_amount
        when e.type = 'refund' then -e.total
        when e.type = 'adjustment' then e.credit_amount
        else 0 end), 0)
      - coalesce((select sum(p.amount) from payments p where p.customer_id = v_row.id), 0)
      into v_derived
      from entries e where e.customer_id = v_row.id and e.status = 'active';
    if exists (
      select 1 from customer_balance cb
      where cb.customer_id = v_row.id and abs(cb.balance - v_derived) > 0.01
    ) then
      v_diffs := v_diffs || jsonb_build_object('customer_id', v_row.id, 'derived', v_derived);
    end if;
  end loop;
  return jsonb_build_object('ok', jsonb_array_length(v_diffs) = 0, 'diffs', v_diffs, 'checked', v_checked);
end $$;

-- ---------- RPC: adjust_stock / add_member / set_demo_mode ----------
create or replace function adjust_stock(product_id uuid, qty_change numeric, note text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_product products%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_product from products where id = product_id for update;
  if v_product.id is null then raise exception 'NOT_FOUND'; end if;
  if not is_member(v_product.shop_id) then raise exception 'NOT_MEMBER'; end if;
  update products set stock_qty = greatest(stock_qty + qty_change, 0) where id = product_id;
  insert into inventory_movements (shop_id, product_id, type, qty_change, at)
  values (v_product.shop_id, product_id, 'adjustment', qty_change, now());
  insert into audit_log (shop_id, actor, action, entity, after, reason)
  values (v_product.shop_id, auth.uid(), 'adjust_stock', 'product', jsonb_build_object('qty_change', qty_change), note);
  return jsonb_build_object('product_id', product_id, 'qty_change', qty_change);
end $$;

create or replace function add_member(p_name text, p_phone text, p_role member_role, p_permissions jsonb, p_pin text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_shop uuid;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select shop_id into v_shop from members where user_id = auth.uid() and role = 'owner' limit 1;
  if v_shop is null then raise exception 'OWNER_ONLY'; end if;
  insert into members (shop_id, user_id, name, phone, role, permissions, pin_hash)
  values (v_shop, auth.uid(), p_name, p_phone, p_role, p_permissions, crypt(p_pin, gen_salt('bf')))
  returning id into v_id;
  return jsonb_build_object('member_id', v_id);
end $$;

create or replace function set_demo_mode(p_on boolean)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_shop uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select shop_id into v_shop from members where user_id = auth.uid() limit 1;
  if v_shop is null then raise exception 'NOT_MEMBER'; end if;
  update shops set is_demo = p_on where id = v_shop;
  return jsonb_build_object('shop_id', v_shop, 'is_demo', p_on);
end $$;

-- ---------- RPC: daily_maintenance (cron) ----------
create or replace function daily_maintenance()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_overdue int := 0;
begin
  insert into alerts (shop_id, type, severity, title, message, related_type, related_id, action)
  select c.shop_id, 'overdue', 'warning',
         c.name || ' ka udhaar purana ho gaya',
         'Rs ' || round(cb.balance) || ' baqi — ' ||
           round(extract(day from now() - min(e.occurred_at))) || ' din se.',
         'customer', c.id,
         jsonb_build_object('label','Khata kholein','href','/khata/' || c.id)
  from customers c
  join customer_balance cb on cb.customer_id = c.id
  join entries e on e.customer_id = c.id and e.type = 'sale' and e.status = 'active' and e.credit_amount > 0
  join shops s on s.id = c.shop_id
  where cb.balance > 0
    and min(e.occurred_at) < now() - ((s.settings->>'overdue_days')::int || ' days')::interval
    and not exists (
      select 1 from alerts a
      where a.related_id = c.id and a.type = 'overdue' and a.created_at > now() - interval '7 days'
    )
  group by c.id, c.shop_id, c.name, cb.balance;
  get diagnostics v_overdue = row_count;

  delete from alerts
  where resolved_at is not null and created_at < now() - interval '90 days';

  return jsonb_build_object('overdue_alerts_created', v_overdue);
end $$;

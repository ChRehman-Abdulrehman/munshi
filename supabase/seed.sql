-- Munshi demo seed (Supabase mode).
-- Usage: run AFTER a user signs up, then call:
--   select seed_demo();
-- The function creates demo products/customers/entries for the caller's shop.

create or replace function seed_demo()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_shop uuid;
  v_products uuid[];
  v_customers uuid[];
  v_p record;
  v_c record;
  v_entry uuid;
  v_day int;
  v_i int;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select shop_id into v_shop from members where user_id = auth.uid() limit 1;
  if v_shop is null then raise exception 'NOT_MEMBER'; end if;

  update shops set is_demo = true, name = coalesce(nullif(name, ''), 'Ali Cloth House, Lahore') where id = v_shop;

  insert into products (shop_id, name, aliases, category, unit, selling_price, cost_price, stock_qty, min_stock, preferred_restock_qty) values
    (v_shop, 'Lawn Suit 3pc', '{"lawn","lawn suit","suit"}', 'kapra', 'pc', 2500, 1900, 40, 5, 20),
    (v_shop, 'Cotton Shirt', '{"shirt","kameez"}', 'kapra', 'pc', 1200, 850, 60, 6, 24),
    (v_shop, 'Kids School Bag', '{"bag","school bag"}', 'accessories', 'pc', 1800, 1300, 3, 4, 12),
    (v_shop, 'Embroidered Dupatta', '{"dupatta","chunni"}', 'kapra', 'pc', 900, 600, 35, 5, 15),
    (v_shop, 'Denim Jeans', '{"jeans","pant"}', 'kapra', 'pc', 2200, 1600, 25, 4, 10);

  insert into customers (shop_id, name, phone, credit_limit, payment_terms_days) values
    (v_shop, 'Ali Raza', '03001234567', 5000, 30),
    (v_shop, 'Ali Mobile Wala', '03011234567', 20000, 15),
    (v_shop, 'Kiran Bibi', '03021234567', 3000, 30),
    (v_shop, 'Sana Malik', '03031234567', 8000, 30),
    (v_shop, 'Hafiz Sahib', '03041234567', 10000, 45);

  select array_agg(id) into v_products from products where shop_id = v_shop;
  select array_agg(id) into v_customers from customers where shop_id = v_shop;

  for v_day in 0..29 loop
    for v_i in 1..2 + (v_day % 3) loop
      v_p := (v_products[1 + (v_i + v_day) % array_length(v_products, 1)]);
      v_c := (v_customers[1 + (v_i + v_day) % array_length(v_customers, 1)]);

      insert into entries (shop_id, type, customer_id, occurred_at, total, paid_now, credit_amount, method, status, source, idempotency_key)
      values (
        v_shop, 'sale', v_c.id,
        now() - (v_day || ' days')::interval - (v_i || ' hours')::interval,
        v_p.selling_price, 
        case when (v_i + v_day) % 3 = 0 then 0 else v_p.selling_price end,
        case when (v_i + v_day) % 3 = 0 then v_p.selling_price else 0 end,
        case when (v_i + v_day) % 3 = 0 then 'credit'::pay_method else 'cash'::pay_method end,
        'active', 'seed', 'seed-sale-' || v_day || '-' || v_i
      ) returning id into v_entry;

      insert into entry_lines (entry_id, product_id, description, qty, unit, unit_price, discount, line_total)
      values (v_entry, v_p.id, v_p.name, 1, v_p.unit, v_p.selling_price, 0, v_p.selling_price);

      insert into inventory_movements (shop_id, product_id, type, qty_change, entry_id, at)
      values (v_shop, v_p.id, 'sale', -1, v_entry, now() - (v_day || ' days')::interval);

      update products set stock_qty = greatest(stock_qty - 1, 0) where id = v_p.id;

      if (v_day + v_i) % 4 = 0 then
        insert into entries (shop_id, type, customer_id, occurred_at, total, paid_now, credit_amount, method, status, source, idempotency_key)
        values (v_shop, 'payment', v_c.id, now() - (v_day || ' days')::interval - interval '30 minutes',
                1500, 1500, 0, 'cash', 'active', 'seed', 'seed-pay-' || v_day || '-' || v_i)
        returning id into v_entry;

        insert into payments (shop_id, customer_id, entry_id, amount, date, method)
        values (v_shop, v_c.id, v_entry, 1500, now() - (v_day || ' days')::interval, 'cash');
      end if;
    end loop;
  end loop;

  insert into wanted_requests (shop_id, item_text, product_id, qty, customer_id, contact_permission, reason, status)
  values
    (v_shop, 'Kids School Bag', v_products[3], 2, v_customers[1], true, 'out_of_stock', 'new'),
    (v_shop, 'Lawn Suit 3pc (green)', v_products[1], 1, v_customers[2], true, 'variant', 'new'),
    (v_shop, 'Denim Jeans (32 size)', v_products[5], 1, null, false, 'variant', 'new');

  insert into alerts (shop_id, type, severity, title, message, related_type, related_id, action)
  values
    (v_shop, 'low_stock', 'warning', 'Kids School Bag stock kam hai', 'Sirf 3 baqi — mangwana behtar hai.', 'product', v_products[3],
     jsonb_build_object('label','Mangwane mein daalein','href','/stock?tab=mangwana')),
    (v_shop, 'missed_demand', 'info', 'School bags ki demand hai', 'Kai customers poochh chuke hain — stock laayein.', 'product', v_products[3],
     jsonb_build_object('label','Stock dekhein','href','/stock'));

  return jsonb_build_object('ok', true, 'shop_id', v_shop, 'products', array_length(v_products,1), 'customers', array_length(v_customers,1));
end $$;

create or replace function clear_demo()
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

  delete from allocations where payment_id in (select id from payments where shop_id = v_shop);
  delete from payments where shop_id = v_shop;
  delete from inventory_movements where shop_id = v_shop;
  delete from entry_lines where entry_id in (select id from entries where shop_id = v_shop);
  delete from entries where shop_id = v_shop;
  delete from wanted_requests where shop_id = v_shop;
  delete from alerts where shop_id = v_shop;
  delete from products where shop_id = v_shop;
  delete from customers where shop_id = v_shop;
  update shops set is_demo = false where id = v_shop;
  return jsonb_build_object('ok', true);
end $$;

-- Example: after signing up once, from the SQL editor:
--   select seed_demo();
--   select clear_demo();

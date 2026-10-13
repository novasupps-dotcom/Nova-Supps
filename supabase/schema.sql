-- =====================================================================
-- Nova Negocio · base en línea para vendedores (Supabase)
-- Pega TODO este archivo en Supabase → SQL Editor → New query → Run.
-- Se puede volver a ejecutar sin perder datos.
--
-- Modelo: el teléfono del dueño es la caja central (guarda todo).
-- Aquí solo viven: catálogo y existencias publicadas por el dueño, clientes,
-- ajustes públicos y las ventas que mandan los vendedores hasta que el
-- teléfono del dueño las registra.
-- =====================================================================

-- ---------- Integrantes ----------
create table if not exists public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  role text not null check (role in ('owner', 'seller')),
  active boolean not null default false,
  created_at timestamptz not null default now()
);

-- 1.1.1: cada cuenta queda ligada a un solo teléfono (la app manda su
-- identificador en el encabezado x-device-id). Sin el teléfono registrado, la
-- cuenta no ve ni puede hacer nada aunque tengan su correo y contraseña.
alter table public.members add column if not exists device_id text;
alter table public.members add column if not exists device_at timestamptz;
-- 1.3: formas de pago que el dueño le permite a cada vendedor.
alter table public.members add column if not exists methods text[] not null default array['Tarjeta', 'Efectivo', 'Transferencia'];
do $$ begin
  alter table public.members add constraint members_methods_check check (methods <@ array['Tarjeta', 'Efectivo', 'Transferencia']::text[] and cardinality(methods) >= 1);
exception when duplicate_object then null; end $$;

create or replace function public.current_device() returns text
language sql stable as $$
  select nullif(coalesce(current_setting('request.headers', true), '{}')::json ->> 'x-device-id', '');
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members
    where user_id = auth.uid() and role = 'owner' and active
      and device_id is not null and device_id = public.current_device()
  );
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members
    where user_id = auth.uid() and active
      and device_id is not null and device_id = public.current_device()
  );
$$;

-- El primer usuario que la llama queda como dueño (y su teléfono queda registrado).
-- Después nadie más puede; y el dueño no puede "mudarse" de teléfono desde la app.
create or replace function public.claim_owner(p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare r record; d text := public.current_device();
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero'; end if;
  if d is null then raise exception 'Actualiza la app a la versión 1.1.1 o posterior'; end if;
  if exists (select 1 from public.members where role = 'owner' and user_id <> auth.uid()) then
    raise exception 'Esta tienda ya tiene dueño registrado';
  end if;
  select * into r from public.members where user_id = auth.uid();
  if found and r.device_id is not null and r.device_id <> d then
    raise exception 'Tu cuenta de dueño está registrada en otro teléfono';
  end if;
  insert into public.members (user_id, name, role, active, device_id, device_at)
  values (auth.uid(), coalesce(nullif(trim(p_name), ''), 'Dueño'), 'owner', true, d, now())
  on conflict (user_id) do update set role = 'owner', active = true,
    name = coalesce(nullif(trim(p_name), ''), public.members.name),
    device_id = coalesce(public.members.device_id, excluded.device_id),
    device_at = coalesce(public.members.device_at, excluded.device_at);
  return 'owner';
end $$;

-- Estado del usuario en este teléfono: owner | active | pending | other_device |
-- update_app | none. Si su cuenta aún no tiene teléfono (alta anterior o cambio
-- autorizado por el dueño), este teléfono queda registrado.
create or replace function public.request_join(p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare r record; d text := public.current_device();
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero'; end if;
  select * into r from public.members where user_id = auth.uid() for update;
  if not found then return 'none'; end if;
  if d is null then return 'update_app'; end if;
  if r.device_id is null then
    update public.members set device_id = d, device_at = now() where user_id = auth.uid();
  elsif r.device_id <> d then
    return 'other_device';
  end if;
  return case when r.role = 'owner' then 'owner' when r.active then 'active' else 'pending' end;
end $$;

alter table public.members enable row level security;
drop policy if exists members_read on public.members;
create policy members_read on public.members for select using (user_id = auth.uid() or public.is_owner());
drop policy if exists members_owner_update on public.members;
create policy members_owner_update on public.members for update using (public.is_owner() and role = 'seller') with check (role = 'seller');
drop policy if exists members_owner_delete on public.members;
create policy members_owner_delete on public.members for delete using (public.is_owner() and role = 'seller');

-- ---------- Catálogo y existencias (lo publica el dueño) ----------
create table if not exists public.catalog (
  product_id text primary key,
  sku text not null default '',
  name text not null,
  brand text not null default '',
  category text not null default '',
  price integer not null check (price >= 0),          -- centavos
  available integer not null default 0,               -- unidades vendibles
  image_key text not null default '',
  archived boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.catalog enable row level security;
drop policy if exists catalog_read on public.catalog;
create policy catalog_read on public.catalog for select using (public.is_member());
drop policy if exists catalog_write on public.catalog;
create policy catalog_write on public.catalog for all using (public.is_owner()) with check (public.is_owner());

-- ---------- Clientes (el dueño publica; el vendedor puede dar de alta) ----------
create table if not exists public.customers (
  id text primary key,
  name text not null check (char_length(name) between 1 and 120),
  phone text not null default '',
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.customers enable row level security;
drop policy if exists customers_read on public.customers;
create policy customers_read on public.customers for select using (public.is_member());
drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers for insert with check (public.is_member() and (created_by = auth.uid() or public.is_owner()));
drop policy if exists customers_owner_update on public.customers;
create policy customers_owner_update on public.customers for update using (public.is_owner()) with check (public.is_owner());
drop policy if exists customers_owner_delete on public.customers;
create policy customers_owner_delete on public.customers for delete using (public.is_owner());

-- ---------- Ajustes públicos (comisión, terminal) ----------
create table if not exists public.config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.config enable row level security;
drop policy if exists config_read on public.config;
-- 2.1: los datos de transferencia (CLABE, tarjeta) solo los lee el dueño; cada vendedor
-- recibe solo los que tiene asignados con public.seller_transfer_accounts().
create policy config_read on public.config for select using (public.is_owner() or (public.is_member() and key <> 'transfer'));
drop policy if exists config_write on public.config;
create policy config_write on public.config for all using (public.is_owner()) with check (public.is_owner());

-- ---------- Ventas de vendedores ----------
create table if not exists public.sales (
  id text primary key,
  seller_id uuid not null default auth.uid() references auth.users (id),
  seller_name text not null default '',
  created_at timestamptz not null default now(),
  items jsonb not null,                                -- [{productId, name, qty, price}]
  total integer not null check (total >= 0),           -- centavos, a precio de lista
  method text not null check (method in ('Efectivo', 'Transferencia', 'Tarjeta')),
  customer_id text,
  customer_name text not null default '',
  customer_phone text not null default '',
  note text not null default '',
  mp jsonb,                                            -- cobro en terminal: orderId, paymentId, tarjeta
  status text not null default 'pendiente' check (status in ('pendiente', 'aplicada', 'conflicto', 'rechazada')),
  sale_id text,
  error text,
  applied_at timestamptz
);
create index if not exists sales_status on public.sales (status, created_at);
create index if not exists sales_seller on public.sales (seller_id, created_at);
alter table public.sales enable row level security;
drop policy if exists sales_read on public.sales;
create policy sales_read on public.sales for select using (seller_id = auth.uid() or public.is_owner());
drop policy if exists sales_insert on public.sales;
create policy sales_insert on public.sales for insert
  with check (public.is_member() and seller_id = auth.uid() and status = 'pendiente' and sale_id is null and applied_at is null);
drop policy if exists sales_owner_update on public.sales;
create policy sales_owner_update on public.sales for update using (public.is_owner()) with check (public.is_owner());
drop policy if exists sales_owner_delete on public.sales;
create policy sales_owner_delete on public.sales for delete using (public.is_owner());

-- ---------- Códigos de invitación (1.1.1) ----------
-- El dueño genera un código corto (GNS-XXXX-XXXX) para cada vendedor. Sirve una
-- sola vez, vence (7 días por omisión) y se puede revocar. Al usarlo, el
-- vendedor queda dado de alta, aprobado y ligado a su teléfono. Las cuentas
-- nuevas SOLO se crean así (registro abierto apagado en Supabase).
create table if not exists public.invites (
  code text primary key,                               -- sin guiones, en mayúsculas
  name text not null default 'Vendedor',
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  revoked boolean not null default false,
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz
);
alter table public.invites enable row level security;
drop policy if exists invites_owner on public.invites;
create policy invites_owner on public.invites for all using (public.is_owner()) with check (public.is_owner());

-- Intentos fallidos (por dirección de internet): después de 20 en una hora se bloquea.
create table if not exists public.invite_failures (
  key text not null,
  at timestamptz not null default now()
);
create index if not exists invite_failures_key on public.invite_failures (key, at);
alter table public.invite_failures enable row level security;

create or replace function public.invite_code_normalize(p text) returns text
language sql immutable as $$ select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) $$;

-- Solo para el servidor (función cobro-terminal, acción "alta"): aparta el código
-- de forma atómica. Devuelve ok | invalid | used | expired | locked.
create or replace function public.invite_claim(p_code text, p_key text) returns text
language plpgsql security definer set search_path = public as $$
declare inv record; c text := public.invite_code_normalize(p_code); k text := nullif(trim(coalesce(p_key, '')), '');
begin
  -- Límite por dirección de internet. Si no se conoce la dirección no se usa un
  -- contador compartido (evita que alguien bloquee el alta de todos); el código
  -- tiene 32^8 combinaciones, vence y sirve una vez, así que adivinarlo no es viable.
  if k is not null and (select count(*) from public.invite_failures where key = k and at > now() - interval '1 hour') >= 20 then
    return 'locked';
  end if;
  select * into inv from public.invites where code = c and coalesce(kind, 'seller') = 'seller' for update;
  if not found or inv.revoked then
    if k is not null then insert into public.invite_failures (key) values (k); end if;
    return 'invalid';
  end if;
  if inv.used_at is not null then return 'used'; end if;
  if inv.expires_at < now() then return 'expired'; end if;
  update public.invites set used_at = now() where code = c;
  return 'ok';
end $$;

-- Completa el alta: el vendedor queda activo y ligado al teléfono donde canjeó el código.
create or replace function public.invite_finish(p_code text, p_user uuid, p_name text, p_device text) returns text
language plpgsql security definer set search_path = public as $$
declare inv record; c text := public.invite_code_normalize(p_code);
begin
  select * into inv from public.invites where code = c for update;
  if not found or inv.used_at is null or inv.used_by is not null then raise exception 'Código no apartado'; end if;
  update public.invites set used_by = p_user where code = c;
  insert into public.members (user_id, name, role, active, device_id, device_at)
  values (p_user, coalesce(nullif(trim(p_name), ''), inv.name), 'seller', true, nullif(p_device, ''), now());
  return 'active';
end $$;

-- Si falla la creación de la cuenta, el código vuelve a quedar disponible.
create or replace function public.invite_release(p_code text) returns void
language sql security definer set search_path = public as $$
  update public.invites set used_at = null where code = public.invite_code_normalize(p_code) and used_by is null;
$$;

drop function if exists public.redeem_invite(text, text);

-- =====================================================================
-- 1.2 · Ventas validadas en el servidor, cobros por quien los creó, clientes
-- protegidos y cambio de teléfono con código.
-- =====================================================================

-- Códigos: además de invitaciones, cambios de teléfono y recuperación del dueño.
alter table public.invites add column if not exists kind text not null default 'seller';
alter table public.invites add column if not exists target uuid references auth.users (id) on delete cascade;
do $$ begin
  alter table public.invites add constraint invites_kind check (kind in ('seller', 'device', 'owner_recovery'));
exception when duplicate_object then null; end $$;

create or replace function public.gen_code(p_prefix text) returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  idx constant int[] := array[0, 1, 2, 3, 4, 5, 9, 10];
  b bytea; c text; i int;
begin
  loop
    b := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    c := p_prefix;
    for i in 1..8 loop c := c || substr(alphabet, (get_byte(b, idx[i]) % 32) + 1, 1); end loop;
    exit when not exists (select 1 from public.invites where code = c);
  end loop;
  return c;
end $$;

create or replace function public.create_invite(p_name text, p_days integer default 7) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_owner() then raise exception 'Solo el dueño puede crear invitaciones'; end if;
  c := public.gen_code('GNS');
  insert into public.invites (code, name, kind, expires_at)
  values (c, coalesce(nullif(trim(p_name), ''), 'Vendedor'), 'seller', now() + make_interval(days => greatest(1, least(coalesce(p_days, 7), 30))));
  return c;
end $$;

-- Cambio de teléfono de un vendedor: el dueño genera un código de un solo uso
-- (vence en 2 días) y SOLO esa cuenta puede usarlo. No hay "ventana" abierta.
create or replace function public.create_device_code(p_user uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text; m record;
begin
  if not public.is_owner() then raise exception 'Solo el dueño puede autorizar cambios de teléfono'; end if;
  select * into m from public.members where user_id = p_user and role = 'seller';
  if not found then raise exception 'Vendedor no encontrado'; end if;
  update public.invites set revoked = true where kind = 'device' and target = p_user and used_at is null;
  c := public.gen_code('CAM');
  insert into public.invites (code, name, kind, target, expires_at) values (c, m.name, 'device', p_user, now() + interval '2 days');
  return c;
end $$;

-- Código de recuperación del dueño (para cambiar SU teléfono). Uno vigente a la vez.
create or replace function public.create_owner_recovery() returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_owner() then raise exception 'Solo el dueño'; end if;
  update public.invites set revoked = true where kind = 'owner_recovery' and target = auth.uid() and used_at is null;
  c := public.gen_code('REC');
  insert into public.invites (code, name, kind, target, expires_at) values (c, 'Recuperación', 'owner_recovery', auth.uid(), now() + interval '5 years');
  return c;
end $$;

-- Usar un código de cambio/recuperación en el teléfono nuevo (ya con sesión iniciada).
-- Devuelve ok | invalid | expired | locked | update_app
create or replace function public.redeem_device_code(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare inv record; d text := public.current_device(); c text := public.invite_code_normalize(p_code); k text;
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero'; end if;
  if d is null then return 'update_app'; end if;
  k := 'u:' || auth.uid()::text;
  if (select count(*) from public.invite_failures where key = k and at > now() - interval '1 hour') >= 10 then return 'locked'; end if;
  select * into inv from public.invites where code = c and kind in ('device', 'owner_recovery') and target = auth.uid() for update;
  if not found or inv.revoked or inv.used_at is not null then
    insert into public.invite_failures (key) values (k);
    return 'invalid';
  end if;
  if inv.expires_at < now() then return 'expired'; end if;
  update public.invites set used_at = now(), used_by = auth.uid() where code = c;
  update public.members set device_id = d, device_at = now() where user_id = auth.uid();
  return 'ok';
end $$;

-- Cobros de la terminal creados por la función: quién los creó y si se aprobaron.
create table if not exists public.terminal_orders (
  order_id text primary key,
  created_by uuid not null references auth.users (id),
  amount integer not null,
  status text not null default 'creada',
  reference text,
  sale_id text unique,
  created_at timestamptz not null default now()
);
alter table public.terminal_orders enable row level security;
drop policy if exists terminal_orders_read on public.terminal_orders;
create policy terminal_orders_read on public.terminal_orders for select using (created_by = auth.uid() or public.is_owner());

-- Ventas: hora del teléfono (informativa) y un cobro de tarjeta no se usa dos veces.
alter table public.sales add column if not exists client_time timestamptz;
alter table public.sales add column if not exists transfer_id text;
alter table public.members add column if not exists transfer_ids text[];
create unique index if not exists sales_mp_order_unique on public.sales ((mp ->> 'orderId')) where mp ? 'orderId';
-- Los vendedores ya NO insertan ventas directo: solo con submit_sale().
drop policy if exists sales_insert on public.sales;

-- Clientes: el vendedor ya no lee la tabla completa (solo búsquedas enmascaradas).
drop policy if exists customers_read on public.customers;
drop policy if exists customers_owner_read on public.customers;
create policy customers_owner_read on public.customers for select using (public.is_owner());

-- Unidades apartadas por ventas de vendedores que el dueño aún no registra
-- (también las que está revisando: la mercancía ya se entregó).
create or replace function public.pending_qty(p_product text) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum((i ->> 'qty')::int), 0)::int
  from public.sales s, jsonb_array_elements(s.items) i
  where s.status in ('pendiente', 'conflicto') and i ->> 'productId' = p_product;
$$;

-- Catálogo para vendedores, con existencias ya descontando lo apartado por todos.
-- 2.1: categoría de venta (para promociones) y código de barras (lector) publicados por el dueño.
alter table public.catalog add column if not exists segment text not null default '';
alter table public.catalog add column if not exists barcode text not null default '';
drop function if exists public.seller_catalog();
create or replace function public.seller_catalog()
returns table (product_id text, sku text, name text, brand text, category text, price integer, available integer, image_key text, segment text, barcode text)
language sql stable security definer set search_path = public as $$
  select c.product_id, c.sku, c.name, c.brand, c.category, c.price,
         greatest(0, c.available - public.pending_qty(c.product_id))::int, c.image_key, c.segment, c.barcode
  from public.catalog c
  where public.is_member() and not c.archived
  order by c.name;
$$;

-- Normaliza y valida los renglones contra el catálogo. Devuelve los renglones con
-- nombre y precio del catálogo (el teléfono no decide precios).
drop function if exists public.priced_items(jsonb);
create or replace function public.priced_items(p_items jsonb)
returns table (product_id text, name text, qty integer, price integer, available integer, segment text)
language sql stable security definer set search_path = public as $$
  with raw as (
    select i ->> 'productId' pid, sum((i ->> 'qty')::int)::int q
    from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) i
    where (i ->> 'qty') ~ '^[0-9]{1,4}$' and (i ->> 'qty')::int between 1 and 999
    group by 1
  )
  select c.product_id, c.name, r.q, c.price, greatest(0, c.available - public.pending_qty(c.product_id))::int, c.segment
  from raw r join public.catalog c on c.product_id = r.pid and not c.archived;
$$;

-- 2.0 · El cliente absorbe la comisión: el precio de catálogo es TU precio y el
-- servidor cobra, con cualquier forma de pago, el total que después de la
-- comisión de Mercado Pago (config.fee.bps, 4.06%) te deja tu precio completo.
-- Ej.: $499.00 → el cliente paga $520.12 → −$21.12 → recibes $499.00.
-- pass_fee (apps 1.6) se conserva solo para que apps anteriores lo lean en falso.
alter table public.members add column if not exists pass_fee boolean not null default false;
alter table public.members alter column pass_fee set default false;
update public.members set pass_fee = false where pass_fee is distinct from false;
create or replace function public.store_fee_bps() returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((select case when (value -> 'bps') is not null and (value ->> 'bps') ~ '^[0-9]{1,4}$' and (value ->> 'bps')::int <= 2000
                               then (value ->> 'bps')::int end from public.config where key = 'fee'), 406);
$$;
-- Lo que ya no se usa (cálculos de comisión por plan, MSI y cobro de comisión al cliente).
drop function if exists public.mp_fee(integer, jsonb);
drop function if exists public.mp_gross_up(integer, jsonb);
drop function if exists public.card_plan_problem(jsonb);
drop function if exists public.gross_up(integer, integer);
drop function if exists public.card_fee(integer, integer);
drop function if exists public.my_pass_fee();

-- Mismo cálculo que la app (src/business.ts → cardFee y grossUp), en centavos.
drop function if exists public.store_commission(integer);
create or replace function public.fee_of(p_amount integer, p_bps integer) returns integer
language sql immutable as $$ select round(p_amount::numeric * p_bps / 10000)::int $$;
create or replace function public.client_price(p_base integer, p_bps integer) returns integer
language plpgsql immutable as $$
declare t int;
begin
  if p_base <= 0 or p_bps <= 0 then return greatest(p_base, 0); end if;
  t := round(p_base::numeric * 10000 / (10000 - p_bps))::int;
  while t - public.fee_of(t, p_bps) < p_base loop t := t + 1; end loop;
  while (t - 1) - public.fee_of(t - 1, p_bps) >= p_base loop t := t - 1; end loop;
  return t;
end $$;
-- 2.1 · Promociones (config 'promos' = {list: [...]}, las publica el dueño). Mismo cálculo
-- que la app (src/business.ts → promoLineDiscount): la mejor promoción por renglón.
create or replace function public.promo_line_discount(p_product text, p_segment text, p_qty integer, p_price integer, p_day date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pr jsonb; best int := 0; best_name text := null; amt int; n int; m int; pct numeric; v int := p_qty * p_price;
begin
  for pr in
    select x from public.config c, jsonb_array_elements(case when jsonb_typeof(c.value -> 'list') = 'array' then c.value -> 'list' else '[]'::jsonb end) x
    where c.key = 'promos'
  loop
    -- Datos mal formados nunca rompen una venta: esa promoción simplemente no aplica.
    continue when coalesce(pr ->> 'active', 'false') <> 'true';
    -- Fechas AAAA-MM-DD: se comparan como texto (igual que la app).
    continue when coalesce(pr ->> 'from', '') <> '' and to_char(p_day, 'YYYY-MM-DD') < (pr ->> 'from');
    continue when coalesce(pr ->> 'to', '') <> '' and to_char(p_day, 'YYYY-MM-DD') > (pr ->> 'to');
    continue when pr ->> 'target' = 'product' and coalesce(pr ->> 'ref', '') <> p_product;
    continue when pr ->> 'target' = 'segment' and coalesce(pr ->> 'ref', '') <> p_segment;
    amt := 0;
    if pr ->> 'kind' = 'nxm' then
      n := case when (pr ->> 'n') ~ '^[0-9]{1,3}$' then (pr ->> 'n')::int end;
      m := case when (pr ->> 'm') ~ '^[0-9]{1,3}$' then (pr ->> 'm')::int end;
      if n >= 2 and m >= 1 and m < n then amt := (p_qty / n) * (n - m) * p_price; end if;
    elsif pr ->> 'kind' in ('percent', 'volume') and (pr ->> 'percent') ~ '^[0-9]{1,2}$' then
      pct := (pr ->> 'percent')::numeric;
      if pct > 0 and pct <= 90 and (pr ->> 'kind' <> 'volume' or p_qty >= case when (pr ->> 'minQty') ~ '^[0-9]{1,3}$' then (pr ->> 'minQty')::int else 0 end) then
        amt := least(v, round(v * pct / 100)::int);
      end if;
    end if;
    if amt > best then best := amt; best_name := pr ->> 'name'; end if;
  end loop;
  return jsonb_build_object('amount', best, 'name', best_name);
end $$;
create or replace function public.store_day() returns date
language sql stable as $$ select (now() at time zone 'America/Mexico_City')::date $$;
alter table public.sales add column if not exists promo integer not null default 0;
alter table public.sales add column if not exists subtotal integer;
alter table public.sales add column if not exists commission integer not null default 0;
alter table public.sales add column if not exists fee_bps integer;
-- Lo que el vendedor realmente cobró (si difiere del total del servidor, la venta queda en revisión).
alter table public.sales add column if not exists client_total integer;

-- Revisión antes de cobrar: subtotal (tus precios), comisión, total y faltantes.
-- total = mayor entre el precio al cliente del subtotal y la suma de cada producto
-- a precio al cliente (así cuadra con lo que ve el cliente). p_card se ignora.
drop function if exists public.check_sale(jsonb);
create or replace function public.check_sale(p_items jsonb, p_card jsonb default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n int; sub int; per int; disc int; total int; bps int := public.store_fee_bps(); day date := public.store_day(); short jsonb;
begin
  if not public.is_member() then raise exception 'Tu teléfono no está autorizado'; end if;
  select count(*), coalesce(sum(qty * price), 0), coalesce(sum(qty * public.client_price(price, bps)), 0),
         coalesce(sum((public.promo_line_discount(product_id, segment, qty, price, day) ->> 'amount')::int), 0)
    into n, sub, per, disc from public.priced_items(p_items);
  if n = 0 or n <> jsonb_array_length(p_items) then return jsonb_build_object('ok', false, 'error', 'Productos no válidos'); end if;
  -- Con promoción: el cliente paga lo necesario para que recibas tu precio ya con el descuento.
  total := case when disc > 0 then public.client_price(sub - disc, bps) else greatest(public.client_price(sub, bps), per) end;
  select coalesce(jsonb_agg(jsonb_build_object('productId', product_id, 'name', name, 'available', available)), '[]'::jsonb)
    into short from public.priced_items(p_items) where qty > available;
  return jsonb_build_object('ok', jsonb_array_length(short) = 0, 'subtotal', sub, 'promo', disc, 'commission', total - (sub - disc), 'total', total, 'pricing', 'grossup',
                            'short', short, 'pass_fee', false, 'fee_bps', bps, 'card_total', total);
end $$;

-- Venta del vendedor: el servidor pone precios, total y hora, revisa existencias y,
-- si es con tarjeta, que el cobro sea suyo, esté aprobado, sea por ese total y no
-- se haya usado. Idempotente por id (reintentos sin internet).
drop function if exists public.submit_sale(text, jsonb, text, text, jsonb, text, timestamptz, text);
drop function if exists public.submit_sale(text, jsonb, text, text, jsonb, text, timestamptz, text, integer);
drop function if exists public.submit_sale(text, jsonb, text, text, jsonb, text, timestamptz, text, integer, text);
-- p_card: lo mandan las apps 1.6; se acepta y se ignora.
create or replace function public.submit_sale(
  p_id text, p_items jsonb, p_method text, p_customer_id text default null, p_new_customer jsonb default null,
  p_order_id text default null, p_client_time timestamptz default null, p_note text default '', p_client_total integer default null,
  p_transfer_id text default null, p_card jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me record; prev record; ord record; n int; sub int; per int; disc int; comm int; bps int := public.store_fee_bps(); day date := public.store_day(); total int; short text; items jsonb; status text := 'pendiente'; err text := null;
  cid text := nullif(p_customer_id, ''); cname text := ''; cphone text := ''; v_order text := null; v_ref text := null;
begin
  -- Bloqueo por vendedor: una venta y un cierre de caja nunca se cruzan.
  select * into me from public.members where user_id = auth.uid() for update;
  if not public.is_member() then raise exception 'Tu teléfono no está autorizado para vender'; end if;
  if p_id !~ '^[A-Za-z0-9_-]{6,80}$' then raise exception 'Venta inválida'; end if;
  select * into prev from public.sales where id = p_id;
  if found then
    if prev.seller_id <> auth.uid() then raise exception 'Venta inválida'; end if;
    return jsonb_build_object('status', prev.status, 'total', prev.total, 'error', prev.error, 'duplicate', true);
  end if;
  if p_method not in ('Efectivo', 'Transferencia', 'Tarjeta') then raise exception 'Forma de pago inválida'; end if;
  if me.role = 'seller' and not (p_method = any (coalesce(me.methods, array['Tarjeta', 'Efectivo', 'Transferencia']))) then
    raise exception 'El dueño no te habilitó cobrar con %', lower(p_method);
  end if;
  -- Transferencia: a qué cuenta de la tienda pagó el cliente (Mercado Pago, Banamex…).
  if p_method <> 'Transferencia' then p_transfer_id := null; end if;
  if p_transfer_id is not null and not exists (
    select 1 from public.config c, jsonb_array_elements(coalesce(c.value -> 'accounts', '[]'::jsonb)) a
    where c.key = 'transfer' and a ->> 'id' = p_transfer_id
      and (me.transfer_ids is null or p_transfer_id = any (me.transfer_ids))
  ) then raise exception 'Esa cuenta de transferencia no está disponible'; end if;
  select count(*), coalesce(sum(qty * price), 0), coalesce(sum(qty * public.client_price(price, bps)), 0),
         coalesce(sum((public.promo_line_discount(product_id, segment, qty, price, day) ->> 'amount')::int), 0)
    into n, sub, per, disc from public.priced_items(p_items);
  if n = 0 or n <> jsonb_array_length(p_items) then raise exception 'Productos no válidos o archivados'; end if;
  -- El cliente absorbe la comisión (con cualquier forma de pago): tú recibes tu precio completo (con promociones, ya con el descuento).
  total := case when disc > 0 then public.client_price(sub - disc, bps) else greatest(public.client_price(sub, bps), per) end;
  comm := total - (sub - disc);
  select jsonb_agg(jsonb_build_object('productId', product_id, 'name', name, 'qty', qty, 'price', price,
                                      'discount', (d ->> 'amount')::int, 'promo', d ->> 'name'))
    into items from (select x.*, public.promo_line_discount(x.product_id, x.segment, x.qty, x.price, day) d from public.priced_items(p_items) x) y;
  select string_agg(name || ' (hay ' || available || ')', ', ') into short from public.priced_items(p_items) where qty > available;
  if p_method = 'Tarjeta' then
    select * into ord from public.terminal_orders where order_id = coalesce(p_order_id, '') for update;
    if not found or ord.created_by <> auth.uid() then raise exception 'Ese cobro con tarjeta no es tuyo'; end if;
    if ord.sale_id is not null then raise exception 'Ese cobro con tarjeta ya se usó en otra venta'; end if;
    if ord.status <> 'aprobada' then raise exception 'El cobro con tarjeta no está aprobado'; end if;
    if ord.amount <> total then
      -- Ya se cobró: no se pierde. Se guarda por lo cobrado y el dueño la revisa.
      status := 'conflicto';
      err := 'Se cobró con tarjeta $' || to_char(ord.amount / 100.0, 'FM999,999,990.00') || ' y con los precios actuales son $' || to_char(total / 100.0, 'FM999,999,990.00');
      total := ord.amount;
      comm := greatest(total - (sub - disc), 0);
    end if;
    update public.terminal_orders set sale_id = p_id where order_id = ord.order_id;
    v_order := ord.order_id;
    v_ref := ord.reference;
  end if;
  if short is not null then
    -- Ya se cobró: se guarda para que el dueño la resuelva (no se pierde el registro).
    status := 'conflicto';
    err := concat_ws(' · ', err, 'Sin existencias suficientes: ' || short);
  end if;
  -- El teléfono cobró con un precio anterior (venta sin internet): la revisa el dueño.
  if p_client_total is not null and p_client_total <> total then
    status := 'conflicto';
    err := concat_ws(' · ', err, 'El vendedor cobró $' || to_char(p_client_total / 100.0, 'FM999,999,990.00') || ' y con los precios actuales son $' || to_char(total / 100.0, 'FM999,999,990.00'));
  end if;
  if p_new_customer is not null and coalesce(trim(p_new_customer ->> 'name'), '') <> '' then
    cid := coalesce(nullif(p_new_customer ->> 'id', ''), 'c-' || replace(gen_random_uuid()::text, '-', ''));
    cname := left(trim(p_new_customer ->> 'name'), 120);
    cphone := left(regexp_replace(coalesce(p_new_customer ->> 'phone', ''), '[^0-9+]', '', 'g'), 20);
    insert into public.customers (id, name, phone, created_by) values (cid, cname, cphone, auth.uid()) on conflict (id) do nothing;
  elsif cid is not null then
    select name into cname from public.customers where id = cid;
    if not found then cid := null; cname := ''; end if;
  end if;
  insert into public.sales (id, seller_id, seller_name, created_at, client_time, items, total, method, customer_id, customer_name, customer_phone, note, mp, status, error, transfer_id, subtotal, commission, fee_bps, client_total, promo)
  values (p_id, auth.uid(), me.name, now(),
          case when p_client_time between now() - interval '7 days' and now() + interval '5 minutes' then p_client_time end,
          items, total, p_method, cid, cname, cphone, left(coalesce(p_note, ''), 300),
          case when v_order is not null then jsonb_build_object('orderId', v_order, 'referenceId', v_ref) end,
          status, err, p_transfer_id, sub, comm, bps, p_client_total, disc);
  return jsonb_build_object('status', status, 'subtotal', sub, 'promo', disc, 'commission', comm, 'total', total, 'error', err);
end $$;

-- Búsqueda de clientes para el vendedor: nombre y solo los últimos 4 dígitos.
create or replace function public.seller_customers(p_query text)
returns table (id text, name text, phone_hint text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, case when length(c.phone) >= 4 then '•••' || right(c.phone, 4) else '' end
  from public.customers c
  where public.is_member()
    and (case when length(trim(coalesce(p_query, ''))) >= 2
              then c.name ilike '%' || trim(p_query) || '%'
                   or (length(regexp_replace(p_query, '[^0-9]', '', 'g')) >= 4
                       and right(regexp_replace(c.phone, '[^0-9]', '', 'g'), 4) = right(regexp_replace(p_query, '[^0-9]', '', 'g'), 4))
              else c.created_by = auth.uid() end)
  order by c.name
  limit 20;
$$;

-- Teléfono completo SOLO para mandar el comprobante de una venta propia reciente.
create or replace function public.receipt_phone(p_sale_id text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(s.customer_phone, ''), c.phone, '')
  from public.sales s left join public.customers c on c.id = s.customer_id
  where s.id = p_sale_id and s.seller_id = auth.uid() and public.is_member() and s.created_at > now() - interval '2 days';
$$;

-- Permisos de tabla (las políticas de arriba deciden qué filas).
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.members, public.catalog, public.customers, public.config, public.sales, public.invites to authenticated;
grant select on public.terminal_orders to authenticated;
revoke all on public.members, public.catalog, public.customers, public.config, public.sales, public.invites, public.invite_failures, public.terminal_orders from anon;
revoke all on public.invite_failures from authenticated;
revoke insert, update, delete on public.terminal_orders from authenticated;
revoke all on function public.create_invite(text, integer), public.invite_claim(text, text), public.invite_finish(text, uuid, text, text), public.invite_release(text),
  public.gen_code(text), public.create_device_code(uuid), public.create_owner_recovery(), public.redeem_device_code(text), public.pending_qty(text), public.seller_catalog(),
  public.priced_items(jsonb), public.check_sale(jsonb, jsonb), public.submit_sale(text, jsonb, text, text, jsonb, text, timestamptz, text, integer, text, jsonb), public.seller_customers(text), public.receipt_phone(text)
  from public, anon, authenticated;
grant execute on function public.claim_owner(text), public.request_join(text), public.is_owner(), public.is_member(), public.current_device(), public.create_invite(text, integer), public.invite_code_normalize(text),
  public.create_device_code(uuid), public.create_owner_recovery(), public.redeem_device_code(text), public.seller_catalog(), public.check_sale(jsonb, jsonb),
  public.submit_sale(text, jsonb, text, text, jsonb, text, timestamptz, text, integer, text, jsonb), public.seller_customers(text), public.receipt_phone(text) to authenticated;
grant execute on function public.invite_claim(text, text), public.invite_finish(text, uuid, text, text), public.invite_release(text) to service_role;

-- =====================================================================
-- 1.3 · Cierre de caja del vendedor, formas de pago por vendedor y baja de
-- usuarios desde la app (el historial de ventas se conserva).
-- =====================================================================

-- Al borrar una cuenta, sus ventas, clientes y cobros se quedan (sin dueño de registro).
alter table public.sales alter column seller_id drop not null;
alter table public.customers alter column created_by drop not null;
alter table public.terminal_orders alter column created_by drop not null;
alter table public.invites alter column created_by drop not null;
alter table public.sales drop constraint if exists sales_seller_id_fkey;
alter table public.sales add constraint sales_seller_id_fkey foreign key (seller_id) references auth.users (id) on delete set null;
alter table public.customers drop constraint if exists customers_created_by_fkey;
alter table public.customers add constraint customers_created_by_fkey foreign key (created_by) references auth.users (id) on delete set null;
alter table public.terminal_orders drop constraint if exists terminal_orders_created_by_fkey;
alter table public.terminal_orders add constraint terminal_orders_created_by_fkey foreign key (created_by) references auth.users (id) on delete set null;
alter table public.invites drop constraint if exists invites_created_by_fkey;
alter table public.invites add constraint invites_created_by_fkey foreign key (created_by) references auth.users (id) on delete set null;

-- Cortes de caja: los hace el vendedor y NADIE los puede modificar ni borrar.
create table if not exists public.seller_closings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid references auth.users (id) on delete set null,
  seller_name text not null default '',
  period_from timestamptz,
  period_to timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sales_count integer not null,
  units integer not null,
  total integer not null,
  by_method jsonb not null,
  items jsonb not null,
  review_count integer not null default 0
);
alter table public.seller_closings add column if not exists card_fee integer not null default 0;
create index if not exists seller_closings_seller on public.seller_closings (seller_id, created_at desc);
alter table public.seller_closings enable row level security;
drop policy if exists seller_closings_read on public.seller_closings;
create policy seller_closings_read on public.seller_closings for select using ((seller_id = auth.uid() and public.is_member()) or public.is_owner());
alter table public.sales add column if not exists closing_id uuid references public.seller_closings (id);
create index if not exists sales_open on public.sales (seller_id) where closing_id is null;

-- Resumen de las ventas de un vendedor: las de un corte o, sin corte, las aún sin cerrar.
create or replace function public.closing_summary(p_seller uuid, p_closing uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with s as (
    select * from public.sales
    where seller_id = p_seller and status <> 'rechazada'
      and (case when p_closing is null then closing_id is null else closing_id = p_closing end)
  ), i as (
    select x ->> 'productId' pid, max(x ->> 'name') pname, sum((x ->> 'qty')::int) q, sum((x ->> 'qty')::int * (x ->> 'price')::int) t
    from s, jsonb_array_elements(s.items) x group by 1
  )
  select jsonb_build_object(
    'sales_count', (select count(*) from s),
    'units', coalesce((select sum(q) from i), 0),
    'total', coalesce((select sum(coalesce(client_total, total)) from s), 0),
    'review_count', (select count(*) from s where status = 'conflicto'),
    'period_from', (select min(created_at) from s),
    'period_to', (select max(created_at) from s),
    'by_method', coalesce((select jsonb_object_agg(method, t) from (select method, sum(coalesce(client_total, total)) t from s group by method) m), '{}'::jsonb),
    'card_fee', coalesce((select sum(coalesce(s.client_total, s.total)) from s), 0) - coalesce((select sum(t) from i), 0),
    'items', coalesce((select jsonb_agg(jsonb_build_object('productId', pid, 'name', pname, 'qty', q, 'total', t) order by pname) from i), '[]'::jsonb)
  );
$$;

-- Lo que el vendedor lleva vendido desde su último corte (vista previa).
create or replace function public.register_preview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member() then raise exception 'Tu teléfono no está autorizado'; end if;
  return public.closing_summary(auth.uid(), null);
end $$;

-- Cierre de caja: congela las ventas desde el último corte. No se puede editar.
create or replace function public.close_register() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record; cid uuid := gen_random_uuid(); sm jsonb;
begin
  select * into me from public.members where user_id = auth.uid() for update;
  if not public.is_member() then raise exception 'Tu teléfono no está autorizado'; end if;
  if me.role <> 'seller' then raise exception 'El cierre de caja es para vendedores'; end if;
  sm := public.closing_summary(auth.uid(), null);
  if (sm ->> 'sales_count')::int = 0 then raise exception 'No hay ventas nuevas desde tu último cierre de caja'; end if;
  insert into public.seller_closings (id, seller_id, seller_name, period_from, period_to, sales_count, units, total, by_method, items, review_count, card_fee)
  values (cid, auth.uid(), me.name, (sm ->> 'period_from')::timestamptz, now(), (sm ->> 'sales_count')::int, (sm ->> 'units')::int,
          (sm ->> 'total')::int, sm -> 'by_method', sm -> 'items', (sm ->> 'review_count')::int, (sm ->> 'card_fee')::int);
  update public.sales set closing_id = cid where seller_id = auth.uid() and closing_id is null and status <> 'rechazada';
  return (select to_jsonb(c) from public.seller_closings c where c.id = cid);
end $$;

-- Si perdiste tu código de recuperación: ejecútalo en el SQL Editor de Supabase
-- (solo ahí funciona) y te devuelve uno nuevo:   select public.nuevo_codigo_recuperacion();
create or replace function public.nuevo_codigo_recuperacion() returns text
language plpgsql security definer set search_path = public as $$
declare c text; o uuid;
begin
  select user_id into o from public.members where role = 'owner' limit 1;
  if o is null then raise exception 'La tienda aún no tiene dueño'; end if;
  update public.invites set revoked = true where kind = 'owner_recovery' and target = o and used_at is null;
  c := public.gen_code('REC');
  insert into public.invites (code, name, kind, target, created_by, expires_at) values (c, 'Recuperación', 'owner_recovery', o, o, now() + interval '5 years');
  return substr(c, 1, 3) || '-' || substr(c, 4, 4) || '-' || substr(c, 8, 4);
end $$;

grant select on public.seller_closings to authenticated;
revoke insert, update, delete on public.seller_closings from authenticated;
revoke all on public.seller_closings from anon;
revoke all on function public.closing_summary(uuid, uuid), public.register_preview(), public.close_register(), public.nuevo_codigo_recuperacion() from public, anon, authenticated;
grant execute on function public.register_preview(), public.close_register() to authenticated;

revoke all on function public.store_fee_bps() from public, anon, authenticated;
revoke all on function public.fee_of(integer, integer), public.client_price(integer, integer) from public, anon;

-- =====================================================================
-- 1.4 · Entrar solo con correo y contraseña. Iniciar sesión en un teléfono
-- lo vuelve el teléfono de esa cuenta (el anterior se desconecta solo).
-- =====================================================================
create or replace function public.login_device() returns text
language plpgsql security definer set search_path = public as $$
declare r record; d text := public.current_device();
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero'; end if;
  if d is null then return 'update_app'; end if;
  select * into r from public.members where user_id = auth.uid() for update;
  if not found then return 'none'; end if;
  if r.device_id is distinct from d then
    update public.members set device_id = d, device_at = now() where user_id = auth.uid();
  end if;
  return case when r.role = 'owner' then 'owner' when r.active then 'active' else 'pending' end;
end $$;
-- Datos de transferencia que ve cada vendedor (null = todos los que publica el dueño).
alter table public.members add column if not exists transfer_ids text[];
revoke all on function public.login_device() from public, anon;
grant execute on function public.login_device() to authenticated;

-- =====================================================================
-- 2.0.3 · Terminal en modo normal: el vendedor cobra directo en la terminal y la
-- función cobro-terminal liga ese pago (PAY-<número>) a su venta. Un pago de
-- Mercado Pago solo puede ligarse a un cobro (la función ya lo revisa; esto lo
-- refuerza en la base).
-- =====================================================================
do $$ begin
  create unique index if not exists terminal_orders_reference_unique on public.terminal_orders (reference) where reference is not null;
exception when unique_violation then
  raise notice 'Hay pagos repetidos en terminal_orders; el índice no se creó (la función sigue evitando repetidos).';
end $$;

-- =====================================================================
-- 2.1 · Promociones, datos de transferencia por vendedor y respaldo
-- automático en la nube (solo el dueño).
-- =====================================================================
revoke all on function public.promo_line_discount(text, text, integer, integer, date), public.store_day() from public, anon;

-- Cada vendedor recibe solo los datos de transferencia que el dueño le asignó.
create or replace function public.seller_transfer_accounts() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(a), '[]'::jsonb)
  from public.config c
  cross join jsonb_array_elements(coalesce(c.value -> 'accounts', '[]'::jsonb)) a
  join public.members m on m.user_id = auth.uid()
  where c.key = 'transfer' and public.is_member() and (m.transfer_ids is null or a ->> 'id' = any (m.transfer_ids));
$$;
revoke all on function public.seller_transfer_accounts() from public, anon;
grant execute on function public.seller_transfer_accounts() to authenticated;

-- Respaldo automático: una copia comprimida al día, en partes, que solo el dueño
-- (desde su teléfono registrado) puede guardar, ver o restaurar.
create table if not exists public.owner_backups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  device text not null default '',
  bytes integer not null default 0,
  parts integer not null default 0,
  sha256 text not null default '',
  complete boolean not null default false,
  app_version text not null default ''
);
create table if not exists public.owner_backup_parts (
  backup_id uuid not null references public.owner_backups (id) on delete cascade,
  part integer not null,
  data text not null,
  primary key (backup_id, part)
);
alter table public.owner_backups enable row level security;
alter table public.owner_backup_parts enable row level security;
drop policy if exists owner_backups_all on public.owner_backups;
create policy owner_backups_all on public.owner_backups for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists owner_backup_parts_all on public.owner_backup_parts;
create policy owner_backup_parts_all on public.owner_backup_parts for all using (public.is_owner()) with check (public.is_owner());
grant select, insert, update, delete on public.owner_backups, public.owner_backup_parts to authenticated;
revoke all on public.owner_backups, public.owner_backup_parts from anon;
-- Conserva solo los más recientes (y borra los que quedaron a medias hace más de una hora).
create or replace function public.prune_owner_backups(p_keep integer default 14) returns integer
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_owner() then raise exception 'Solo el dueño'; end if;
  with keep as (select id from public.owner_backups where complete order by created_at desc limit greatest(coalesce(p_keep, 14), 3))
  delete from public.owner_backups b
  where b.id not in (select id from keep) and (b.complete or b.created_at < now() - interval '1 hour');
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.prune_owner_backups(integer) from public, anon;
grant execute on function public.prune_owner_backups(integer) to authenticated;

-- =====================================================================
-- 2.2 · Avisos push (Firebase, a través del servicio de avisos de Expo). Cada cuenta
-- guarda el identificador de avisos de su teléfono registrado. La base avisa al dueño
-- cuando un vendedor registra una venta, cierra caja o se da de alta, y al vendedor
-- cuando el dueño rechaza una venta suya. Si el envío falla, la venta sigue igual.
-- =====================================================================
do $$ begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net no está disponible: no se mandarán avisos push (%).', sqlerrm;
end $$;

create table if not exists public.push_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null,
  platform text not null default '',
  device text,
  updated_at timestamptz not null default now()
);
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;

create or replace function public.save_push_token(p_token text, p_platform text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member() then raise exception 'Tu teléfono no está autorizado'; end if;
  if coalesce(p_token, '') !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$' then raise exception 'Identificador de avisos inválido'; end if;
  -- Serializa el cambio de cuenta del mismo teléfono, incluso con dos solicitudes a la vez.
  perform pg_advisory_xact_lock(hashtextextended(p_token, 22));
  -- Un identificador es de un solo teléfono: si ese teléfono cambió de cuenta, se quita de la anterior.
  delete from public.push_tokens where token = p_token and user_id <> auth.uid();
  insert into public.push_tokens (user_id, token, platform, device, updated_at)
  values (auth.uid(), p_token, left(coalesce(p_platform, ''), 20), public.current_device(), now())
  on conflict (user_id) do update set token = excluded.token, platform = excluded.platform, device = excluded.device, updated_at = now();
end $$;

create or replace function public.delete_push_token() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member() then raise exception 'Tu teléfono no está autorizado'; end if;
  delete from public.push_tokens where user_id = auth.uid() and device = public.current_device();
end
$$;

-- Manda los avisos (uno por cuenta) al servicio de Expo. Solo al teléfono registrado de
-- cada cuenta: un teléfono anterior deja de recibirlos.
create or replace function public.send_push(p_users uuid[], p_title text, p_body text, p_data jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare msgs jsonb;
begin
  select jsonb_agg(jsonb_build_object('to', t.token, 'title', left(p_title, 120), 'body', left(p_body, 240), 'data', coalesce(p_data, '{}'::jsonb),
                                      'sound', 'default', 'channelId', 'ventas', 'priority', 'high'))
    into msgs
  from public.push_tokens t
  join public.members m on m.user_id = t.user_id and m.active and m.device_id is not distinct from t.device
  where t.user_id = any (p_users);
  if msgs is null then return; end if;
  perform net.http_post(url := 'https://exp.host/--/api/v2/push/send', body := msgs,
                        headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb);
exception when others then
  raise notice 'Aviso no enviado: %', sqlerrm;
end $$;

create or replace function public.push_money(p integer) returns text
language sql immutable as $$ select '$' || to_char(coalesce(p, 0) / 100.0, 'FM999,999,990.00') $$;

create or replace function public.notify_sale() returns trigger
language plpgsql security definer set search_path = public as $$
declare owners uuid[]; who text := coalesce(nullif(new.seller_name, ''), 'Un vendedor');
begin
  select array_agg(user_id) into owners from public.members where role = 'owner' and active;
  if tg_op = 'INSERT' and owners is not null then
    perform public.send_push(owners,
      case when new.status = 'conflicto' then '⚠️ Venta en revisión · ' else '🛒 Nueva venta · ' end || who,
      public.push_money(coalesce(new.client_total, new.total)) || ' · ' || new.method
        || case when new.status = 'conflicto' and new.error is not null then ' · ' || left(new.error, 140) else '' end,
      jsonb_build_object('kind', 'sale', 'saleId', new.id));
  elsif tg_op = 'UPDATE' and new.status = 'conflicto' and old.status is distinct from 'conflicto' and owners is not null then
    perform public.send_push(owners, '⚠️ Venta en revisión · ' || who,
      public.push_money(coalesce(new.client_total, new.total)) || coalesce(' · ' || left(new.error, 140), ''),
      jsonb_build_object('kind', 'sale', 'saleId', new.id));
  elsif tg_op = 'UPDATE' and new.status = 'rechazada' and old.status is distinct from 'rechazada' and new.seller_id is not null then
    perform public.send_push(array[new.seller_id], 'Venta rechazada',
      'El dueño rechazó tu venta de ' || public.push_money(coalesce(new.client_total, new.total)) || coalesce(' · ' || left(new.error, 140), ''),
      jsonb_build_object('kind', 'sale_rejected', 'saleId', new.id));
  end if;
  return new;
exception when others then
  raise notice 'Aviso de venta no enviado: %', sqlerrm;
  return new;
end $$;
drop trigger if exists sales_push on public.sales;
create trigger sales_push after insert or update of status on public.sales for each row execute function public.notify_sale();

create or replace function public.notify_closing() returns trigger
language plpgsql security definer set search_path = public as $$
declare owners uuid[];
begin
  select array_agg(user_id) into owners from public.members where role = 'owner' and active;
  if owners is not null then
    perform public.send_push(owners, '🧾 Cierre de caja · ' || coalesce(nullif(new.seller_name, ''), 'Vendedor'),
      new.sales_count || case when new.sales_count = 1 then ' venta · ' else ' ventas · ' end || public.push_money(new.total)
        || case when new.review_count > 0 then ' · ' || new.review_count || ' en revisión' else '' end,
      jsonb_build_object('kind', 'closing', 'closingId', new.id));
  end if;
  return new;
exception when others then
  raise notice 'Aviso de cierre no enviado: %', sqlerrm;
  return new;
end $$;
drop trigger if exists seller_closings_push on public.seller_closings;
create trigger seller_closings_push after insert on public.seller_closings for each row execute function public.notify_closing();

create or replace function public.notify_member() returns trigger
language plpgsql security definer set search_path = public as $$
declare owners uuid[];
begin
  if new.role <> 'seller' then return new; end if;
  select array_agg(user_id) into owners from public.members where role = 'owner' and active;
  if owners is not null then
    perform public.send_push(owners, '👤 Nuevo vendedor', new.name || ' ya tiene su cuenta.', jsonb_build_object('kind', 'member'));
  end if;
  return new;
exception when others then
  raise notice 'Aviso de vendedor no enviado: %', sqlerrm;
  return new;
end $$;
drop trigger if exists members_push on public.members;
create trigger members_push after insert on public.members for each row execute function public.notify_member();

revoke all on function public.save_push_token(text, text), public.delete_push_token(), public.send_push(uuid[], text, text, jsonb), public.push_money(integer),
  public.notify_sale(), public.notify_closing(), public.notify_member() from public, anon, authenticated;
grant execute on function public.save_push_token(text, text), public.delete_push_token() to authenticated;

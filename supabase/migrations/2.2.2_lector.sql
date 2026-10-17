-- Nova Negocio 2.2.2: códigos adicionales y vista previa para vendedores.
-- Ejecutar después del SQL 2.2. No modifica ventas ni existencias.
begin;
alter table public.catalog add column if not exists scan_data jsonb not null default '{}';
drop function if exists public.seller_catalog();
create function public.seller_catalog()
returns table (product_id text, sku text, name text, brand text, category text, price integer,
  available integer, image_key text, segment text, barcode text, scan_data jsonb)
language sql stable security definer set search_path = public as $$
  select c.product_id, c.sku, c.name, c.brand, c.category, c.price,
    greatest(0, c.available - public.pending_qty(c.product_id))::int,
    c.image_key, c.segment, c.barcode, c.scan_data
  from public.catalog c
  where public.is_member() and not c.archived
  order by c.name;
$$;
revoke all on function public.seller_catalog() from public, anon;
grant execute on function public.seller_catalog() to authenticated;
notify pgrst, 'reload schema';
commit;

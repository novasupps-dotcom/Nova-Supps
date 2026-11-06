-- =============================================================================
-- NOVA SUPPS · 2.10.7 · RESPALDO EN TIEMPO REAL (SUPABASE REALTIME + SNAPSHOT BD)
-- Ejecuta este archivo en Supabase → SQL Editor → New query → Run
-- (También está integrado de forma idempotente al final de supabase/schema.sql)
-- =============================================================================

-- 1. Habilitar Replica Identity FULL y Publicación Realtime (supabase_realtime)
--    para sincronización instantánea entre Dueño, Modo Kiosco y Vendedores.
alter table if exists public.catalog replica identity full;
alter table if exists public.sales replica identity full;
alter table if exists public.customers replica identity full;
alter table if exists public.config replica identity full;
alter table if exists public.seller_closings replica identity full;
alter table if exists public.members replica identity full;

do $$
declare
  tbl text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach tbl in array array['catalog', 'sales', 'customers', 'config', 'seller_closings', 'members'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    exception
      when duplicate_object then null;
      when undefined_table then null;
    end;
  end loop;
end $$;

-- 2. Tabla de instantáneas de Base de Datos en Tiempo Real (public.realtime_backups)
create table if not exists public.realtime_backups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  device_id text not null default '',
  app_version text not null default '2.10.7',
  summary jsonb not null default '{}'::jsonb,
  payload jsonb not null
);

alter table public.realtime_backups enable row level security;

drop policy if exists realtime_backups_owner on public.realtime_backups;
create policy realtime_backups_owner on public.realtime_backups
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

grant select, insert, delete on public.realtime_backups to authenticated;

-- 3. Función RPC para guardar un respaldo completo de BD + estado Realtime
create or replace function public.save_realtime_snapshot(
  p_payload jsonb,
  p_version text default '2.10.7'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_summary jsonb;
begin
  if not public.is_owner() then
    raise exception 'Solo el dueño puede generar un respaldo Realtime de la base de datos';
  end if;
  v_summary := jsonb_build_object(
    'catalog_count', (select count(*) from public.catalog),
    'sales_count', (select count(*) from public.sales),
    'customers_count', (select count(*) from public.customers),
    'members_count', (select count(*) from public.members where active),
    'saved_at', now()
  );
  insert into public.realtime_backups (created_by, device_id, app_version, summary, payload)
  values (auth.uid(), public.req_device(), coalesce(nullif(p_version, ''), '2.10.7'), v_summary, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;

  -- Conserva las últimas 20 instantáneas Realtime en tabla para no saturar almacenamiento
  delete from public.realtime_backups
  where id in (
    select id from public.realtime_backups
    order by created_at desc
    offset 20
  );
  return v_id;
end $$;

revoke all on function public.save_realtime_snapshot(jsonb, text) from public, anon;
grant execute on function public.save_realtime_snapshot(jsonb, text) to authenticated;

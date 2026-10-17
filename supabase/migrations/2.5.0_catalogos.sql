-- Nova Negocio 2.5: catálogo en PDF por WhatsApp.
-- Crea el espacio público "catalogos" (solo PDF, máximo 25 MB). Solo la cuenta del dueño
-- puede subir; cualquiera con el enlace puede ver el PDF (es el catálogo para clientes).
-- Ejecutar una vez en Supabase → SQL Editor. No toca ventas, existencias ni clientes.
begin;

create or replace function public.is_owner_account() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members
    where user_id = auth.uid() and role = 'owner' and active
  );
$$;
revoke all on function public.is_owner_account() from public, anon;
grant execute on function public.is_owner_account() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalogos', 'catalogos', true, 26214400, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists catalogos_owner_insert on storage.objects;
create policy catalogos_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'catalogos' and public.is_owner_account());

drop policy if exists catalogos_owner_select on storage.objects;
create policy catalogos_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'catalogos' and public.is_owner_account());

drop policy if exists catalogos_owner_delete on storage.objects;
create policy catalogos_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'catalogos' and public.is_owner_account());

commit;

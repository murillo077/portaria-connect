-- PORTARIA CONNECT | schema inicial para um condomínio, preparado para múltiplos condomínios
create extension if not exists pgcrypto;

create table if not exists public.condominiums (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  condominium_id uuid not null references public.condominiums(id) on delete restrict,
  full_name text not null,
  role text not null default 'guard' check (role in ('admin','guard')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete restrict,
  recipient_name text not null,
  block text not null,
  apartment text not null,
  description text,
  photo_url text,
  status text not null default 'received' check (status in ('received','collected')),
  received_by uuid not null references public.profiles(id),
  received_at timestamptz not null default now(),
  collected_by uuid references public.profiles(id),
  collected_at timestamptz,
  constraint collected_fields_consistent check (
    (status = 'received' and collected_at is null) or
    (status = 'collected' and collected_at is not null and collected_by is not null)
  )
);

create index if not exists deliveries_condominium_received_idx on public.deliveries(condominium_id, received_at desc);
create index if not exists deliveries_condominium_status_idx on public.deliveries(condominium_id, status);

create or replace function public.current_condominium_id()
returns uuid language sql stable security definer
set search_path = public
as $$
  select condominium_id from public.profiles
  where id = auth.uid() and active = true limit 1;
$$;

create or replace function public.current_user_role()
returns text language sql stable security definer
set search_path = public
as $$
  select role from public.profiles
  where id = auth.uid() and active = true limit 1;
$$;

alter table public.condominiums enable row level security;
alter table public.profiles enable row level security;
alter table public.deliveries enable row level security;

drop policy if exists "members read own condominium" on public.condominiums;
create policy "members read own condominium" on public.condominiums
for select to authenticated using (id = public.current_condominium_id());

drop policy if exists "members read profiles in condominium" on public.profiles;
create policy "members read profiles in condominium" on public.profiles
for select to authenticated using (condominium_id = public.current_condominium_id());

drop policy if exists "admins manage profiles in condominium" on public.profiles;
create policy "admins manage profiles in condominium" on public.profiles
for all to authenticated using (
  condominium_id = public.current_condominium_id() and public.current_user_role() = 'admin'
) with check (
  condominium_id = public.current_condominium_id() and public.current_user_role() = 'admin'
);

drop policy if exists "members read deliveries in condominium" on public.deliveries;
create policy "members read deliveries in condominium" on public.deliveries
for select to authenticated using (condominium_id = public.current_condominium_id());

drop policy if exists "members create deliveries in condominium" on public.deliveries;
create policy "members create deliveries in condominium" on public.deliveries
for insert to authenticated with check (
  condominium_id = public.current_condominium_id() and received_by = auth.uid()
);

drop policy if exists "members update deliveries in condominium" on public.deliveries;
create policy "members update deliveries in condominium" on public.deliveries
for update to authenticated using (condominium_id = public.current_condominium_id())
with check (condominium_id = public.current_condominium_id());

-- Fotos privadas: o caminho do arquivo começa pelo UUID do condomínio.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-photos', 'delivery-photos', false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 8388608,
allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "condo members upload delivery photos" on storage.objects;
create policy "condo members upload delivery photos" on storage.objects
for insert to authenticated with check (
  bucket_id = 'delivery-photos'
  and (storage.foldername(name))[1] = public.current_condominium_id()::text
);

drop policy if exists "condo members read delivery photos" on storage.objects;
create policy "condo members read delivery photos" on storage.objects
for select to authenticated using (
  bucket_id = 'delivery-photos'
  and (storage.foldername(name))[1] = public.current_condominium_id()::text
);

-- CONFIGURAÇÃO INICIAL:
-- 1) Crie o primeiro usuário em Authentication > Users.
-- 2) Execute este bloco, substituindo os valores. Faça isso apenas uma vez:
-- insert into public.condominiums (name) values ('Nome do Condomínio') returning id;
-- insert into public.profiles (id, condominium_id, full_name, role)
-- values ('UUID_DO_USUARIO_AUTH', 'UUID_DO_CONDOMINIO', 'Administrador', 'admin');
-- Depois, crie os usuários da portaria e vincule-os ao mesmo condominium_id com role='guard'.

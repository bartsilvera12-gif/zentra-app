-- =============================================================================
-- SÓLO PARA PROBAR EN LOCAL. No correr esto en Supabase: allá `auth` ya existe.
--
-- Recrea lo mínimo que Supabase aporta, para poder validar el esquema y los
-- permisos contra un Postgres común antes de tocar el proyecto real.
-- =============================================================================

create schema if not exists auth;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

-- En Supabase, auth.uid() sale del JWT que manda PostgREST.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;

do $$ begin create role anon nologin;          exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
grant usage on schema auth to anon, authenticated;

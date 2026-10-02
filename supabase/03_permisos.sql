-- =============================================================================
-- Zentra Móvil · 03 · Permisos (Row Level Security)
--
-- Esto es lo que separa a una empresa de otra. Sin esto, cualquiera con la clave
-- pública leería los datos de todos. La clave pública NO protege nada: protege
-- esto.
-- =============================================================================

-- El rol anónimo puede ver el schema, pero cada tabla decide qué deja ver.
grant usage on schema zentra to anon, authenticated;

alter table zentra.empresas       enable row level security;
alter table zentra.usuarios       enable row level security;
alter table zentra.clientes       enable row level security;
alter table zentra.proveedores    enable row level security;
alter table zentra.productos      enable row level security;
alter table zentra.movimientos    enable row level security;
alter table zentra.ventas         enable row level security;
alter table zentra.venta_lineas   enable row level security;
alter table zentra.compras        enable row level security;
alter table zentra.compra_lineas  enable row level security;
alter table zentra.numeracion     enable row level security;

-- Nadie entra sin sesión: `anon` no recibe permisos sobre las tablas.
grant select, insert, update, delete on all tables in schema zentra to authenticated;
grant usage, select on all sequences in schema zentra to authenticated;
grant execute on function zentra.siguiente_numero(uuid, text) to authenticated;

-- ---------- empresas ----------
-- Cada uno ve y edita sólo la suya. Nadie crea ni borra empresas desde la app:
-- las crea el disparador de registro.

drop policy if exists empresas_ver on zentra.empresas;
create policy empresas_ver on zentra.empresas
  for select to authenticated
  using (id = zentra.empresa_actual());

drop policy if exists empresas_editar on zentra.empresas;
create policy empresas_editar on zentra.empresas
  for update to authenticated
  using (id = zentra.empresa_actual())
  with check (id = zentra.empresa_actual());

-- ---------- usuarios ----------
-- Se ven entre compañeros de empresa. Cada uno edita sólo su propia fila, así
-- nadie se cambia el rol ni se muda de empresa.

drop policy if exists usuarios_ver on zentra.usuarios;
create policy usuarios_ver on zentra.usuarios
  for select to authenticated
  using (empresa_id = zentra.empresa_actual());

drop policy if exists usuarios_editar_propio on zentra.usuarios;
create policy usuarios_editar_propio on zentra.usuarios
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and empresa_id = zentra.empresa_actual());

-- ---------- tablas con empresa_id ----------
-- Mismo patrón para todas: se ve y se escribe sólo lo de la empresa propia.
-- El `with check` es tan importante como el `using`: sin él, alguien podría
-- insertar filas con el empresa_id de otro.

do $$
declare t text;
begin
  foreach t in array array['clientes','proveedores','productos','movimientos','ventas','compras','numeracion']
  loop
    execute format('drop policy if exists %I on zentra.%I', t || '_propias', t);
    execute format($f$
      create policy %I on zentra.%I
        for all to authenticated
        using (empresa_id = zentra.empresa_actual())
        with check (empresa_id = zentra.empresa_actual())
    $f$, t || '_propias', t);
  end loop;
end $$;

-- ---------- líneas ----------
-- No tienen empresa_id propio: cuelgan de su cabecera. La política pregunta por
-- la cabecera, así no se puede colar una línea en una venta ajena.

drop policy if exists venta_lineas_propias on zentra.venta_lineas;
create policy venta_lineas_propias on zentra.venta_lineas
  for all to authenticated
  using (exists (
    select 1 from zentra.ventas v
     where v.id = venta_id and v.empresa_id = zentra.empresa_actual()))
  with check (exists (
    select 1 from zentra.ventas v
     where v.id = venta_id and v.empresa_id = zentra.empresa_actual()));

drop policy if exists compra_lineas_propias on zentra.compra_lineas;
create policy compra_lineas_propias on zentra.compra_lineas
  for all to authenticated
  using (exists (
    select 1 from zentra.compras c
     where c.id = compra_id and c.empresa_id = zentra.empresa_actual()))
  with check (exists (
    select 1 from zentra.compras c
     where c.id = compra_id and c.empresa_id = zentra.empresa_actual()));

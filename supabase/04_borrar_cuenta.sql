-- =============================================================================
-- Zentra Móvil · 04 · Borrado de cuenta
--
-- Las dos tiendas lo exigen si la app permite crear cuenta, y Apple lo hace
-- cumplir. Sin esto no se pasa revisión.
--
-- El borrado tiene que hacerlo una función del servidor: el cliente de la app
-- usa la clave pública y ésa no puede tocar `auth.users`. Por eso va con
-- `security definer`, igual que el resto, y con el `search_path` fijo.
-- =============================================================================

create or replace function zentra.eliminar_mi_cuenta()
returns void
language plpgsql
volatile
security definer
set search_path = zentra, pg_catalog
as $$
declare
  v_uid     uuid := auth.uid();
  v_empresa uuid;
  v_otros   int;
begin
  if v_uid is null then
    raise exception 'No hay sesión iniciada.';
  end if;

  select empresa_id into v_empresa from zentra.usuarios where id = v_uid;

  -- ¿Queda alguien más en la empresa? Si el que se va es el último, la empresa
  -- y todos sus datos se borran con él. Si quedan compañeros, la empresa sigue
  -- viva y sólo se va esta persona.
  select count(*) into v_otros
    from zentra.usuarios
   where empresa_id = v_empresa and id <> v_uid;

  -- Borrar de auth.users arrastra la fila de zentra.usuarios por la clave foránea.
  delete from auth.users where id = v_uid;

  if v_empresa is not null and v_otros = 0 then
    -- Y borrar la empresa arrastra clientes, productos, ventas, compras y
    -- movimientos, todos con `on delete cascade`.
    delete from zentra.empresas where id = v_empresa;
  end if;
end;
$$;

grant execute on function zentra.eliminar_mi_cuenta() to authenticated;

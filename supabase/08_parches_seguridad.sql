-- =============================================================================
-- Zentra Móvil · 08 · Tres agujeros de la auditoría
--
-- Los tres son de lo mismo: cosas que la app puede hacer desde el teléfono y
-- que nadie del otro lado está revisando. La clave pública viaja adentro del
-- APK y del .ipa, así que cualquiera que descompile el paquete puede hablarle
-- a PostgREST con ella. Lo único que separa una empresa de otra es lo de acá.
--
-- Es idempotente: se puede correr de nuevo sin romper nada.
--
-- Y es tolerante: cada parche mira si existe lo que va a tocar. En una base que
-- no tiene el schema de la instalación propia —por ejemplo, una que sólo guarda
-- los planes y los cobros— los tres salen por NOTICE diciendo que saltearon, en
-- vez de cortar con "relation does not exist".
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. `zentra.instalacion` quedó sin RLS, y es escribible por cualquiera
--
-- `03_permisos.sql` hace `grant ... on all tables in schema zentra` y después
-- enciende RLS tabla por tabla. `instalacion` no está en esa lista, así que
-- quedó con permiso de escritura y sin ninguna política que la frene.
--
-- Lo que se puede hacer con eso no es menor. `compartida` es el flag que
-- decide cómo se comporta el borrado de cuenta: en una instalación dentro del
-- proyecto de un ERP tiene que estar en `true` para que borrar la cuenta de la
-- app NO borre el login del ERP. Cualquier vendedor logueado puede hacer
--
--     update zentra.instalacion set compartida = false;
--
-- y a partir de ahí el próximo que se dé de baja de la app pierde el acceso al
-- sistema de su empresa. El propio README lo marca como "peligroso".
--
-- No lleva política de lectura a propósito: nadie necesita leer esta tabla
-- desde el cliente. `es_compartida()` es `security definer` y la lee por su
-- cuenta.
-- -----------------------------------------------------------------------------

do $$
begin
  if to_regclass('zentra.instalacion') is null then
    raise notice 'SALTEADO 1 · zentra.instalacion no existe en esta base';
    return;
  end if;
  execute 'alter table zentra.instalacion enable row level security';
  execute 'revoke insert, update, delete on zentra.instalacion from authenticated';
  begin
    execute 'revoke insert, update, delete on zentra.instalacion from anon';
  exception when undefined_object then null;  -- base sin el rol `anon`
  end;
  raise notice 'LISTO 1 · zentra.instalacion ahora tiene RLS y nadie la escribe';
end $$;


-- -----------------------------------------------------------------------------
-- 2. `siguiente_numero()` no comprueba de quién es la empresa
--
-- Es `security definer` y está concedida a `authenticated`, pero recibe la
-- empresa como parámetro y nunca la valida. Cualquier usuario puede llamarla
-- con el id de otra empresa y avanzarle el correlativo, en un bucle si quiere.
--
-- No lee datos ajenos, pero deja huecos en la numeración de facturas de otro
-- cliente. Con timbrado y SIFEN de por medio, un hueco no es cosmético: hay
-- que explicárselo a la SET.
--
-- El parámetro se conserva para no romper a quien ya la llama; lo que cambia
-- es que ahora tiene que coincidir con la empresa de quien llama.
-- -----------------------------------------------------------------------------

do $$
begin
  if to_regclass('zentra.numeracion') is null then
    raise notice 'SALTEADO 2 · zentra.numeracion no existe en esta base';
    return;
  end if;

  execute $f$
create or replace function zentra.siguiente_numero(p_empresa uuid, p_tipo text)
returns text
language plpgsql
volatile
security definer
set search_path = zentra, pg_catalog
as $b$
declare
  v_n       bigint;
  v_prefijo text;
begin
  -- Lo nuevo. El id sigue viniendo por parámetro, pero ya no se le cree.
  if p_empresa is distinct from zentra.empresa_actual() then
    raise exception 'No podés numerar comprobantes de otra empresa.'
      using errcode = '42501';
  end if;

  insert into zentra.numeracion (empresa_id, tipo, proximo)
  values (p_empresa, p_tipo, 1)
  on conflict (empresa_id, tipo) do nothing;

  update zentra.numeracion
     set proximo = proximo + 1
   where empresa_id = p_empresa and tipo = p_tipo
  returning proximo - 1 into v_n;

  v_prefijo := case p_tipo
    when 'venta'  then 'VTA'
    when 'compra' then 'COMP'
    when 'ajuste' then 'AJU'
    else upper(p_tipo)
  end;

  return v_prefijo || '-' || lpad(v_n::text, 6, '0');
end;
$b$;
  $f$;
  raise notice 'LISTO 2 · siguiente_numero() ahora valida la empresa';
end $$;


-- -----------------------------------------------------------------------------
-- 3. El stock sí se puede desincronizar, al contrario de lo que promete el README
--
-- `supabase/README.md` dice: "el stock nunca queda desincronizado del libro".
-- Hoy no es cierto, por dos motivos distintos:
--
--   a) El disparador es `after insert or delete`. No cubre UPDATE, y la app
--      tiene permiso de update sobre `movimientos`. Un
--      `update movimientos set cantidad = 500` cambia el libro y deja
--      `productos.stock` como estaba.
--
--   b) `movimientos.producto_id` no está atado a la misma empresa. La política
--      valida `empresa_id = empresa_actual()`, pero nadie comprueba que el
--      producto sea de esa empresa. Como el disparador es `security definer` y
--      actualiza `productos` sin filtrar, un insert con el `producto_id` de
--      otro tenant le mueve el stock. Hace falta conocer el UUID, que el RLS
--      no deja leer, así que es difícil de explotar — pero el camino existe.
--
-- Se arreglan los dos: el disparador pasa a cubrir UPDATE y a comprobar la
-- empresa del producto.
-- -----------------------------------------------------------------------------

do $$
begin
  if to_regclass('zentra.movimientos') is null or to_regclass('zentra.productos') is null then
    raise notice 'SALTEADO 3 · zentra.movimientos o zentra.productos no existen en esta base';
    return;
  end if;

  execute $f$
create or replace function zentra.aplicar_movimiento()
returns trigger
language plpgsql
security definer
set search_path = zentra, pg_catalog
as $b$
declare
  v_empresa_prod uuid;
begin
  -- El producto tiene que ser de la misma empresa que el movimiento. Sin esto
  -- el disparador, que corre con permisos elevados, mueve stock ajeno.
  if tg_op in ('INSERT', 'UPDATE') then
    select empresa_id into v_empresa_prod
      from zentra.productos where id = new.producto_id;
    if v_empresa_prod is distinct from new.empresa_id then
      raise exception 'El producto no es de esta empresa.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' then
    update zentra.productos
       set stock = stock + new.cantidad
     where id = new.producto_id;
    return new;

  elsif tg_op = 'UPDATE' then
    -- Se descuenta lo viejo y se suma lo nuevo, en vez de recalcular: así
    -- funciona igual si cambió la cantidad, el producto, o los dos.
    update zentra.productos
       set stock = stock - old.cantidad
     where id = old.producto_id;
    update zentra.productos
       set stock = stock + new.cantidad
     where id = new.producto_id;
    return new;

  elsif tg_op = 'DELETE' then
    update zentra.productos
       set stock = stock - old.cantidad
     where id = old.producto_id;
    return old;
  end if;

  return null;
end;
$b$;
  $f$;

  execute 'drop trigger if exists movimientos_aplicar on zentra.movimientos';
  execute 'create trigger movimientos_aplicar
             after insert or update or delete on zentra.movimientos
             for each row execute function zentra.aplicar_movimiento()';
  raise notice 'LISTO 3 · el disparador de stock cubre UPDATE y valida la empresa';
end $$;


-- -----------------------------------------------------------------------------
-- Comprobación
--
-- Las tres consultas de abajo tienen que devolver lo que dice el comentario.
-- Si alguna no coincide, el parche no quedó aplicado.
-- -----------------------------------------------------------------------------

-- Tiene que decir `t`:
--   select relrowsecurity from pg_class where oid = 'zentra.instalacion'::regclass;

-- Tiene que decir `INSERT OR UPDATE OR DELETE`:
--   select string_agg(e, ' OR ') from (
--     select unnest(array['INSERT','DELETE','UPDATE']) e) x
--   where false;  -- ver el disparador con \d zentra.movimientos

-- Tiene que fallar con "No podés numerar comprobantes de otra empresa.":
--   select zentra.siguiente_numero(gen_random_uuid(), 'venta');

-- =============================================================================
-- Vistas sobre un ERP existente
--
-- Para que la app muestre los datos que un cliente YA tiene, sin copiar nada:
-- un schema con **vistas** que traducen las tablas del ERP a la forma que la app
-- espera. PostgREST sirve una vista igual que una tabla.
--
-- Se genera uno por empresa, con una función. Escribirlos a mano sería un schema
-- por cada cliente, y a la décima empresa alguien se olvida de una columna.
--
-- POR QUÉ UNO POR EMPRESA Y NO UNO SOLO QUE LAS VEA A TODAS:
--
-- Un único schema con vistas que unan todos los schemas del ERP obligaría a
-- filtrar por empresa dentro de la vista, y ahí un error se paga con los datos
-- de un cliente apareciendo en el teléfono de otro. Con un schema por empresa,
-- la separación la da la conexión: el que entra con el código de JM se conecta a
-- las vistas de JM y las de otra empresa no están a su alcance. Es más difícil
-- de romper, y no hace falta acordarse de nada al escribir una vista nueva.
--
-- El costo —un schema más por cliente— lo paga la función, no una persona.
--
-- SÓLO LECTURA. Estas vistas no crean, modifican ni borran nada del ERP.
-- =============================================================================

create schema if not exists zentra_erp;

-- Qué columna del ERP corresponde a cada campo que la app espera.
--
-- Vive en una tabla y no adentro de la función porque es lo único que cambia
-- entre un ERP y otro: cuando un cliente tenga las columnas con otros nombres,
-- se agregan filas acá y la misma función genera sus vistas.
create table if not exists zentra_erp.mapeo (
  vista     text not null,   -- la tabla como la ve la app: clientes, productos…
  campo     text not null,   -- el campo que la app espera: nombre, doc…
  expresion text not null,   -- de dónde sale en el ERP: una columna o una expresión SQL
  orden     int  not null default 0,
  primary key (vista, campo)
);

-- De qué tabla del ERP sale cada vista.
create table if not exists zentra_erp.origen (
  vista  text primary key,
  tabla  text not null,
  -- Filtro opcional, por si el ERP marca bajas con una columna en vez de borrar.
  filtro text
);

/**
 * Crea (o rehace) el schema de vistas de una empresa.
 *
 *   select zentra_erp.generar('JM', 'distribuidorajmerp');
 *
 * Deja un schema `zentra_jm` con una vista por cada entrada de `origen`.
 * Es idempotente: correrla de nuevo rehace las vistas con el mapeo actual, que
 * es lo que hay que hacer después de tocarlo.
 */
create or replace function zentra_erp.generar(p_codigo text, p_schema_erp text)
returns text
language plpgsql
volatile
security definer
set search_path = zentra_erp, pg_catalog
as $$
declare
  v_codigo  text := lower(regexp_replace(p_codigo, '[^a-zA-Z0-9]', '', 'g'));
  v_destino text;
  v_vista   text;
  v_cols    text;
  v_sql     text;
  v_origen  record;
begin
  if coalesce(v_codigo, '') = '' then
    raise exception 'El código no puede quedar vacío después de limpiarlo: %', p_codigo;
  end if;
  -- El schema del ERP tiene que existir: si no, las vistas se crearían rotas y
  -- el error aparecería recién cuando alguien abra la app.
  if not exists (select 1 from information_schema.schemata where schema_name = p_schema_erp) then
    raise exception 'El schema % no existe en esta base', p_schema_erp;
  end if;

  v_destino := 'zentra_' || v_codigo;
  execute format('create schema if not exists %I', v_destino);

  for v_origen in select * from zentra_erp.origen loop
    v_vista := v_origen.vista;

    -- Las columnas salen del mapeo, en orden. `format` con %I/%L escapa todo:
    -- acá se arma SQL con datos de una tabla y no hay que dejar rendija.
    select string_agg(format('%s as %I', m.expresion, m.campo), ', ' order by m.orden, m.campo)
      into v_cols
      from zentra_erp.mapeo m
     where m.vista = v_vista;

    if v_cols is null then
      raise exception 'No hay mapeo para la vista %', v_vista;
    end if;

    v_sql := format(
      'create or replace view %I.%I as select %s from %I.%I',
      v_destino, v_vista, v_cols, p_schema_erp, v_origen.tabla
    );
    if v_origen.filtro is not null and btrim(v_origen.filtro) <> '' then
      v_sql := v_sql || ' where ' || v_origen.filtro;
    end if;
    execute v_sql;

    -- `security_invoker` es lo que hace que la vista respete el RLS de la tabla
    -- del ERP en vez de saltárselo con los permisos del dueño. Sin esto, una
    -- vista es un agujero: deja leer lo que la tabla no deja.
    execute format('alter view %I.%I set (security_invoker = true)', v_destino, v_vista);

    -- Sólo lectura, y sólo para quien inició sesión.
    execute format('revoke all on %I.%I from public, anon', v_destino, v_vista);
    execute format('grant select on %I.%I to authenticated', v_destino, v_vista);
  end loop;

  execute format('grant usage on schema %I to authenticated', v_destino);
  execute format('revoke all on schema %I from anon', v_destino);

  return v_destino;
end;
$$;

/**
 * Genera las vistas de TODAS las empresas de una sola vez.
 *
 *   select * from zentra_erp.generar_todas('public.empresas', 'codigo', 'data_schema');
 *
 * Lee la tabla de empresas del propio ERP, así que alta una empresa nueva allá y
 * volver a correr esto alcanza: no hay una lista nuestra que mantener en paralelo
 * y que se desincronice.
 *
 * Devuelve qué hizo con cada una, incluidas las que falló, en vez de cortar en la
 * primera: con veinte empresas, que una tenga el schema mal no puede dejar a las
 * otras diecinueve sin vistas.
 */
create or replace function zentra_erp.generar_todas(
  p_tabla_empresas text,
  p_col_codigo     text,
  p_col_schema     text
)
returns table (codigo text, schema_erp text, destino text, error text)
language plpgsql
volatile
security definer
set search_path = zentra_erp, pg_catalog
as $$
declare
  r record;
begin
  for r in execute format(
    'select %I::text as codigo, %I::text as schema_erp from %s where %I is not null and btrim(%I) <> %L',
    p_col_codigo, p_col_schema, p_tabla_empresas, p_col_schema, p_col_schema, ''
  )
  loop
    codigo := r.codigo;
    schema_erp := r.schema_erp;
    destino := null;
    error := null;
    begin
      destino := zentra_erp.generar(r.codigo, r.schema_erp);
    exception when others then
      error := sqlerrm;
    end;
    return next;
  end loop;
end;
$$;

/** Qué códigos quedaron listos, para armar el directorio de la app. */
create or replace view zentra_erp.directorio as
  select replace(n.nspname, 'zentra_', '') as codigo,
         n.nspname                         as schema,
         count(c.oid)                      as vistas
    from pg_namespace n
    left join pg_class c on c.relnamespace = n.oid and c.relkind = 'v'
   where n.nspname like 'zentra\_%' and n.nspname <> 'zentra_erp'
   group by n.nspname
   order by 1;

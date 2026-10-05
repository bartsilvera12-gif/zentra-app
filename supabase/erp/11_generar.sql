-- Zentra · vistas sobre un ERP · 2 de 4: la función que genera un schema.
-- Correr DESPUÉS de 10_tablas.sql, en una pegada aparte.

/**
 * Crea (o rehace) el schema de vistas de una empresa.
 *
 *   select zentra_movil.generar('JM', 'erp_jm');
 *   select zentra_movil.generar('JM', 'distribuidorajmerp', '...-uuid-...');
 *
 * Deja un schema `zentra_jm` con una vista por cada entrada de `origen`.
 * Es idempotente: correrla de nuevo rehace las vistas con el mapeo actual, que
 * es lo que hay que hacer después de tocarlo.
 *
 * `p_empresa_id` es obligatorio cuando el schema del ERP guarda varias empresas
 * juntas, separadas por una columna `empresa_id`. Es el caso del schema
 * compartido del ERP —el que no es `erp_*`—, y sin el filtro la app de una
 * empresa vería los datos de todas. Si la tabla tiene `empresa_id` y no se pasa
 * el id, esto falla a propósito en vez de generar una vista que filtra nada.
 */
create or replace function zentra_movil.generar(
  p_codigo     text,
  p_schema_erp text,
  p_empresa_id uuid default null
)
returns text
language plpgsql
volatile
security definer
set search_path = zentra_movil, pg_catalog
as $fn$
declare
  v_codigo  text := lower(regexp_replace(p_codigo, '[^a-zA-Z0-9]', '', 'g'));
  v_destino text;
  v_vista   text;
  v_cols    text;
  v_sql     text;
  v_donde   text;
  v_tiene_empresa boolean;
  v_schema  text;
  v_filtro  text;
  v_origen  record;
  -- La marca que distingue un schema generado por nosotros de uno ajeno.
  MARCA constant text := 'zentra-movil: vistas generadas, no editar a mano';
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

  -- Nunca escribir adentro de un schema que no es nuestro.
  --
  -- `create or replace view` sobre un schema ajeno pisaría lo que haya. Y pasa:
  -- en este mismo ERP ya existe un `zentra_erp` suyo, que no tiene nada que ver
  -- con esto. Por eso cada schema que generamos queda marcado con un comentario,
  -- y si el destino existe sin esa marca, esto se niega.
  if exists (select 1 from information_schema.schemata where schema_name = v_destino) then
    if coalesce(obj_description(v_destino::regnamespace, 'pg_namespace'), '') <> MARCA then
      raise exception
        'El schema % ya existe y no lo creamos nosotros. Elegi otro codigo para % o renombra ese schema.',
        v_destino, p_codigo;
    end if;
  else
    execute format('create schema %I', v_destino);
  end if;
  execute format('comment on schema %I is %L', v_destino, MARCA);

  for v_origen in select * from zentra_movil.origen loop
    v_vista := v_origen.vista;
    -- El catálogo del ERP (usuarios, empresas) vive aparte de los datos de cada
    -- empresa, así que cada vista puede decir de qué schema sale.
    v_schema := coalesce(nullif(btrim(v_origen.schema_origen), ''), p_schema_erp);
    if not exists (select 1 from information_schema.schemata where schema_name = v_schema) then
      raise exception 'El schema % de la vista % no existe en esta base', v_schema, v_vista;
    end if;

    -- ¿Esta tabla del ERP mezcla empresas?
    v_tiene_empresa := exists (
      select 1 from information_schema.columns
       where table_schema = v_schema
         and table_name   = v_origen.tabla
         and column_name  = 'empresa_id'
    );
    if v_tiene_empresa and p_empresa_id is null then
      raise exception
        '%.% tiene empresa_id: hay varias empresas en ese schema. Pasá el empresa_id de % o la app las vería todas.',
        v_schema, v_origen.tabla, p_codigo;
    end if;

    -- Las columnas salen del mapeo, en orden. `format` con %I/%L escapa todo:
    -- acá se arma SQL con datos de una tabla y no hay que dejar rendija.
    select string_agg(format('%s as %I', m.expresion, m.campo), ', ' order by m.orden, m.campo)
      into v_cols
      from zentra_movil.mapeo m
     where m.vista = v_vista;

    if v_cols is null then
      raise exception 'No hay mapeo para la vista %', v_vista;
    end if;

    v_sql := format(
      'create or replace view %I.%I as select %s from %I.%I',
      v_destino, v_vista, v_cols, v_schema, v_origen.tabla
    );
    -- El filtro de empresa va primero y se arma con %L: es lo único que separa a
    -- una empresa de otra en un schema compartido.
    v_donde := null;
    if v_tiene_empresa then
      v_donde := format('empresa_id = %L::uuid', p_empresa_id);
    end if;
    if v_origen.filtro is not null and btrim(v_origen.filtro) <> '' then
      -- `{{empresa_id}}` en el filtro se reemplaza por el uuid de la empresa.
      --
      -- Hace falta para las tablas que identifican a la empresa con otra columna:
      -- `empresas` la tiene en `id`, no en `empresa_id`, así que la detección
      -- automática no la agarra y sin esto la app vería TODAS las empresas del
      -- ERP. El uuid entra por %L, igual que el otro filtro.
      v_filtro := replace(v_origen.filtro, '{{empresa_id}}',
                          coalesce(quote_literal(p_empresa_id::text) || '::uuid', 'null'));
      if v_filtro <> v_origen.filtro and p_empresa_id is null then
        raise exception
          'La vista % filtra por {{empresa_id}} y no se paso ningun empresa_id.', v_vista;
      end if;
      v_donde := coalesce(v_donde || ' and ', '') || '(' || v_filtro || ')';
    end if;
    if v_donde is not null then
      v_sql := v_sql || ' where ' || v_donde;
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
$fn$;

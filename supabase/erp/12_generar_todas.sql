-- Zentra · vistas sobre un ERP · 3 de 4: generar para todas las empresas.
-- Correr DESPUÉS de 11_generar.sql, en una pegada aparte.

/**
 * Genera las vistas de TODAS las empresas de una sola vez.
 *
 *   select * from zentra_movil.generar_todas(
 *     'distribuidorajmerp.empresas', 'nombre_empresa', 'data_schema', 'id', 'distribuidorajmerp');
 *
 * Lee la tabla de empresas del propio ERP, así que alta una empresa nueva allá y
 * volver a correr esto alcanza: no hay una lista nuestra que mantener en paralelo
 * y que se desincronice.
 *
 * `p_schema_defecto` es a dónde van las empresas que tienen `data_schema` vacío.
 * El ERP ya funciona así —vacío significa el schema compartido—, y sin esto esas
 * empresas quedarían sin vistas sin que nadie se entere.
 *
 * `p_col_id` es la columna del id de la empresa, que se usa para filtrar cuando
 * varias comparten schema.
 *
 * Devuelve qué hizo con cada una, incluidas las que falló, en vez de cortar en la
 * primera: con veinte empresas, que una tenga el schema mal no puede dejar a las
 * otras diecinueve sin vistas.
 */
create or replace function zentra_movil.generar_todas(
  p_tabla_empresas  text,
  p_col_codigo      text,
  p_col_schema      text,
  p_col_id          text default 'id',
  p_schema_defecto  text default null
)
returns table (codigo text, schema_erp text, destino text, error text)
language plpgsql
volatile
security definer
set search_path = zentra_movil, pg_catalog
as $fn$
declare
  r record;
begin
  for r in execute format(
    'select %I::text as codigo, coalesce(nullif(btrim(%I), %L), %L) as schema_erp, %I::uuid as id from %s',
    p_col_codigo, p_col_schema, '', coalesce(p_schema_defecto, ''), p_col_id, p_tabla_empresas
  )
  loop
    codigo := r.codigo;
    schema_erp := nullif(r.schema_erp, '');
    destino := null;
    error := null;
    if schema_erp is null then
      error := 'sin data_schema y sin p_schema_defecto: no sé dónde están sus datos';
    else
      begin
        destino := zentra_movil.generar(r.codigo, schema_erp, r.id);
      exception when others then
        error := sqlerrm;
      end;
    end if;
    return next;
  end loop;
end;
$fn$;

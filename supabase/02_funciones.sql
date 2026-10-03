-- =============================================================================
-- Zentra Móvil · 02 · Funciones y disparadores
-- =============================================================================

-- ---------- a qué empresa pertenece quien está pidiendo ----------
-- Toda la seguridad cuelga de acá. `security definer` para que pueda leer
-- `usuarios` sin que la propia política de `usuarios` la llame en bucle.
-- El `search_path` va fijo: si no, alguien podría anteponer un schema propio
-- con una tabla `usuarios` falsa y hacerse pasar por otra empresa.

create or replace function zentra.empresa_actual()
returns uuid
language sql
stable
security definer
set search_path = zentra, pg_catalog
as $$
  select empresa_id from zentra.usuarios where id = auth.uid()
$$;

-- ---------- numeración correlativa ----------
-- La asigna el servidor. Si dos vendedores facturan a la vez, el bloqueo de fila
-- de `update ... returning` serializa: nunca se repite un número.

create or replace function zentra.siguiente_numero(p_empresa uuid, p_tipo text)
returns text
language plpgsql
volatile
security definer
set search_path = zentra, pg_catalog
as $$
declare
  v_n      bigint;
  v_prefijo text;
begin
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
$$;

-- ---------- stock ----------
-- El stock del producto lo mantiene este disparador, no la app: así no puede
-- quedar desincronizado del libro de movimientos.

create or replace function zentra.aplicar_movimiento()
returns trigger
language plpgsql
security definer
set search_path = zentra, pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
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
$$;

drop trigger if exists movimientos_aplicar on zentra.movimientos;
create trigger movimientos_aplicar
  after insert or delete on zentra.movimientos
  for each row execute function zentra.aplicar_movimiento();

-- ---------- alta automática al registrarse ----------
-- Quien baja la app de la tienda y se registra necesita su empresa y su perfil
-- creados en el mismo acto; si no, entra a una app que no sabe quién es.
--
-- En una instalación compartida el disparador tiene que distinguir: en ese
-- proyecto también se crean los usuarios del ERP, y a ésos no hay que armarles
-- una empresa en zentra. Se reconocen por los metadatos: el registro de la app
-- siempre manda `empresa` o `empresa_id`, y el ERP no.

create or replace function zentra.registrar_usuario()
returns trigger
language plpgsql
security definer
set search_path = zentra, pg_catalog
as $$
declare
  v_empresa uuid;
  v_nombre  text;
begin
  -- Usuario del ERP en una instalación compartida: no es de la app, se ignora.
  if zentra.es_compartida()
     and coalesce(nullif(btrim(new.raw_user_meta_data ->> 'empresa'), ''), '') = ''
     and nullif(new.raw_user_meta_data ->> 'empresa_id', '') is null then
    return new;
  end if;

  -- Si el usuario fue creado por soporte para una empresa existente, viene con
  -- empresa_id en los metadatos y no se crea una nueva.
  v_empresa := nullif(new.raw_user_meta_data ->> 'empresa_id', '')::uuid;
  v_nombre  := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1));

  if v_empresa is null then
    insert into zentra.empresas (nombre)
    values (coalesce(nullif(btrim(new.raw_user_meta_data ->> 'empresa'), ''), v_nombre))
    returning id into v_empresa;
  end if;

  insert into zentra.usuarios (id, empresa_id, nombre, email, rol)
  values (
    new.id,
    v_empresa,
    v_nombre,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'rol', ''), 'ADMIN')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists usuarios_al_registrarse on auth.users;
create trigger usuarios_al_registrarse
  after insert on auth.users
  for each row execute function zentra.registrar_usuario();

-- ---------- totales ----------
-- El IVA va CONTENIDO en el precio de venta: bruto * r / (1 + r), no bruto * r.
-- Para ₲33.500 al 10% el IVA es ₲3.045, no ₲3.350.

create or replace function zentra.tasa_iva(p zentra.iva)
returns numeric
language sql
immutable
as $$
  select case p when '10%' then 0.10 when '5%' then 0.05 else 0 end
$$;

-- Se suma sin redondear y se redondea UNA sola vez al final. Redondear por línea
-- y después sumar da un guaraní de diferencia (3.046 en vez de 3.045 sobre
-- ₲33.500 al 10%), y entonces la factura y la base dejan de coincidir.

create or replace function zentra.total_venta(p_venta uuid)
returns bigint
language sql
stable
as $$
  select coalesce(round(sum(cantidad * precio)), 0)::bigint
    from zentra.venta_lineas where venta_id = p_venta
$$;

create or replace function zentra.iva_venta(p_venta uuid)
returns bigint
language sql
stable
as $$
  select coalesce(round(sum(
    cantidad * precio * zentra.tasa_iva(iva) / (1 + zentra.tasa_iva(iva))
  )), 0)::bigint
    from zentra.venta_lineas where venta_id = p_venta
$$;

-- Desglose por tasa, que es lo que necesitan el reporte de facturación y SIFEN:
-- no alcanza con el IVA total, hay que declarar gravado e impuesto por cada tasa.
create or replace function zentra.iva_venta_por_tasa(p_venta uuid)
returns table (tasa zentra.iva, gravado bigint, impuesto bigint)
language sql
stable
as $$
  select
    iva,
    round(sum(cantidad * precio / (1 + zentra.tasa_iva(iva))))::bigint,
    round(sum(cantidad * precio * zentra.tasa_iva(iva) / (1 + zentra.tasa_iva(iva))))::bigint
  from zentra.venta_lineas
  where venta_id = p_venta
  group by iva
$$;

-- En compras el IVA va POR ENCIMA del costo: el proveedor cotiza neto.
create or replace function zentra.total_compra(p_compra uuid)
returns bigint
language sql
stable
as $$
  select coalesce(round(sum(
    cantidad * costo * (1 + zentra.tasa_iva(iva))
  )), 0)::bigint
    from zentra.compra_lineas where compra_id = p_compra
$$;

-- ---------- la prueba gratis de Max ----------
--
-- Toda empresa nueva arranca con 7 días de Max, para que pruebe todo antes de
-- decidir. Terminados, la app vuelve sola a lo que corresponda —el plan pago
-- si lo hay, si no el gratis— sin que nadie toque nada: la fecha llega y
-- listo. Es el mismo criterio que `vence`.
--
-- Va en una columna aparte y no reutiliza `plan`/`vence` a propósito. `vence`
-- es lo pagado: de ahí salen los avisos de "renová" y las notificaciones de
-- cobro, y `registrar_pago_pasarela` lo empuja con cada pago. Meter la prueba
-- ahí mezclaría las dos cosas, y alguien que pagara durante la prueba
-- perdería los días que le quedaban o se llevaría de regalo los de la prueba.
--
-- "7 días" son hoy y seis más: `prueba_hasta` es el último día con Max,
-- inclusive, igual que `vence`. Quien se registra un lunes la tiene hasta el
-- domingo.
--
-- Es idempotente: se puede correr de nuevo.

alter table zentra.empresas
  add column if not exists prueba_hasta date;

comment on column zentra.empresas.prueba_hasta is
  'Último día de la prueba gratis de Max, inclusive. Nulo = sin prueba. No lo toca ningún pago.';

-- ---------- las empresas que ya existen ----------
-- Las cuentas creadas antes de esto —las de la prueba cerrada— también
-- reciben sus 7 días, una sola vez: `prueba_hasta is null` hace que correr
-- este archivo de nuevo no regale otra semana. No se les da a las que ya
-- tienen un plan pago vigente, que no la necesitan.
update zentra.empresas
   set prueba_hasta = current_date + 6
 where prueba_hasta is null
   and not (plan in ('emprendedor', 'max') and vence is not null and vence >= current_date);

-- ---------- el alta ----------
-- Mismo disparador que `16_registro_datos.sql`, con la prueba agregada a la
-- empresa nueva. Se reescribe entero porque `create or replace` no parchea.

create or replace function zentra.registrar_usuario()
returns trigger
language plpgsql
security definer
set search_path = zentra, pg_catalog
as $$
declare
  v_empresa    uuid;
  v_nombre     text;
  v_nacimiento date;
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

  -- Una fecha mal escrita no puede tumbar el alta: la persona se quedaría sin
  -- cuenta por un dato que no hace falta para usar la app.
  begin
    v_nacimiento := nullif(btrim(new.raw_user_meta_data ->> 'nacimiento'), '')::date;
  exception when others then
    v_nacimiento := null;
  end;

  if v_empresa is null then
    -- La empresa nueva arranca con la prueba gratis de Max: 7 días
    -- contando hoy. Sólo la empresa nueva: un usuario que soporte agrega a
    -- una empresa que ya existe (empresa_id en los metadatos) no le regala
    -- otra prueba a esa empresa.
    insert into zentra.empresas (nombre, rubro, tamano, prueba_hasta)
    values (
      coalesce(nullif(btrim(new.raw_user_meta_data ->> 'empresa'), ''), v_nombre),
      nullif(btrim(new.raw_user_meta_data ->> 'rubro'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'tamano'), ''),
      current_date + 6
    )
    returning id into v_empresa;
  end if;

  insert into zentra.usuarios (id, empresa_id, nombre, email, rol, nacimiento, como_conocio)
  values (
    new.id,
    v_empresa,
    v_nombre,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'rol', ''), 'ADMIN'),
    v_nacimiento,
    nullif(btrim(new.raw_user_meta_data ->> 'como_conocio'), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists usuarios_al_registrarse on auth.users;
create trigger usuarios_al_registrarse
  after insert on auth.users
  for each row execute function zentra.registrar_usuario();

-- Cuántas empresas quedaron en prueba, y hasta cuándo.
select prueba_hasta, count(*) as empresas
  from zentra.empresas
 where prueba_hasta is not null
 group by prueba_hasta
 order by prueba_hasta;

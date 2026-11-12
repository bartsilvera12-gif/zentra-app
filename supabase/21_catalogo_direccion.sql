-- ---------- la dirección del catálogo se reserva al crear la cuenta ----------
--
-- Toda empresa nueva queda con su dirección tomada: "Velas Ana" → `velas-ana`.
-- El catálogo **no** se prende solo: para prenderlo hace falta el WhatsApp a
-- donde llegan los pedidos, y eso no se pregunta en el registro. Una vidriera
-- sin puerta no sirve, y publicar un catálogo vacío el día que alguien se dio
-- de alta es peor que no tener ninguno.
--
-- Lo que esto consigue es que la app pueda decir, desde el primer día, "tu
-- catálogo va a estar en .../velas-ana". Una dirección que se ve antes de
-- existir es la diferencia entre una función que se entiende y una que hay que
-- ir a buscar.
--
-- A las empresas que ya existen también se les reserva, una sola vez.
--
-- Es idempotente: se puede correr de nuevo.

-- ---------- de un nombre a una dirección ----------
--
-- Acentos fuera, espacios a guiones, lo que no es letra ni número afuera.
-- `unaccent` no está en todas las instalaciones, así que la traducción va a
-- mano: son cinco vocales y la eñe, y una extensión que falte no puede dejar
-- sin dirección a nadie.

create or replace function zentra.direccion_de(p_nombre text)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(
      regexp_replace(
        regexp_replace(
          lower(translate(coalesce(p_nombre, ''),
                          'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
                          'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')),
          '[^a-z0-9]+', '-', 'g'),
        '(^-+|-+$)', '', 'g'),
      '-'),
    '');
$$;

-- ---------- la dirección libre más parecida ----------
--
-- Si `velas-ana` está tomada, prueba `velas-ana-2`, `-3`, y así. El tope de 40
-- es el del `check` de la columna; un nombre largo se corta antes de numerar
-- para que el número no quede afuera.
--
-- Sin nombre utilizable —un negocio llamado "..." o escrito en otro alfabeto—
-- devuelve `negocio-<algo>`: una dirección fea es mejor que ninguna, y se
-- puede cambiar desde la app.

create or replace function zentra.direccion_libre(p_nombre text)
returns text
language plpgsql
volatile
as $$
declare
  v_base text;
  v_try  text;
  v_n    int := 1;
begin
  v_base := left(coalesce(zentra.direccion_de(p_nombre), ''), 32);
  v_base := btrim(v_base, '-');
  if length(coalesce(v_base, '')) < 3 then
    v_base := 'negocio-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end if;

  v_try := v_base;
  while exists (select 1 from zentra.empresas e where e.catalogo_slug = v_try) loop
    v_n := v_n + 1;
    v_try := v_base || '-' || v_n;
    -- Cien intentos y se corta con algo único. Un bucle que no termina en un
    -- disparador de alta deja a alguien sin poder registrarse.
    if v_n > 100 then
      v_try := 'negocio-' || replace(gen_random_uuid()::text, '-', '');
      v_try := left(v_try, 38);
      exit;
    end if;
  end loop;

  return v_try;
end;
$$;

-- ---------- el alta la reserva ----------
--
-- Mismo disparador de `17_prueba_gratis.sql`, con la dirección agregada. Se
-- reescribe entero porque `create or replace` no sabe parchear.

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
  v_empnombre  text;
begin
  -- Usuario del ERP en una instalación compartida: no es de la app, se ignora.
  if zentra.es_compartida()
     and coalesce(nullif(btrim(new.raw_user_meta_data ->> 'empresa'), ''), '') = ''
     and nullif(new.raw_user_meta_data ->> 'empresa_id', '') is null then
    return new;
  end if;

  v_empresa := nullif(new.raw_user_meta_data ->> 'empresa_id', '')::uuid;
  v_nombre  := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1));

  begin
    v_nacimiento := nullif(btrim(new.raw_user_meta_data ->> 'nacimiento'), '')::date;
  exception when others then
    v_nacimiento := null;
  end;

  if v_empresa is null then
    v_empnombre := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'empresa'), ''), v_nombre);

    insert into zentra.empresas (nombre, rubro, tamano, prueba_hasta, catalogo_slug)
    values (
      v_empnombre,
      nullif(btrim(new.raw_user_meta_data ->> 'rubro'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'tamano'), ''),
      -- La prueba gratis de Max: 7 días contando hoy.
      current_date + 6,
      -- La dirección queda tomada; el catálogo sigue apagado hasta que el
      -- negocio cargue su WhatsApp y lo prenda.
      zentra.direccion_libre(v_empnombre)
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

-- ---------- a las que ya existen, también ----------
-- Una sola vez: `catalogo_slug is null` hace que correr esto de nuevo no le
-- cambie la dirección a nadie. Cambiarla después rompería los enlaces que el
-- negocio ya repartió.

do $$
declare r record;
begin
  for r in select id, nombre from zentra.empresas where catalogo_slug is null loop
    update zentra.empresas
       set catalogo_slug = zentra.direccion_libre(r.nombre)
     where id = r.id;
  end loop;
end $$;

-- ---------- para ver que quedó ----------

select nombre, catalogo_slug, catalogo_activo
  from zentra.empresas
 order by creado_en desc
 limit 10;

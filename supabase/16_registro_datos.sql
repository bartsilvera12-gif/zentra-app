-- ---------- lo que se pregunta al crear la cuenta ----------
--
-- El alta pedía nombre, correo y contraseña. Ahora pregunta cuatro cosas más:
--
--   nacimiento     la fecha de nacimiento de la persona
--   como_conocio   de dónde salió (un conocido, Instagram, Google…)
--   rubro          a qué se dedica el negocio
--   tamano         cuánta gente trabaja ahí
--
-- Las dos primeras son de la persona y van en `usuarios`; las dos últimas son
-- del negocio y van en `empresas`. Separarlas importa: el día que una empresa
-- tenga dos usuarios, el rubro es uno solo y la fecha de nacimiento son dos.
--
-- Todas son nulas y se quedan nulas: las cuentas que ya existen no se tocan y
-- nada en la app depende de que estén. Son para saber quién nos usa, no para
-- decidir qué puede hacer.
--
-- Los nombres de las claves de metadatos tienen que coincidir con los que
-- manda la app en `src/lib/registro.ts` (`metadatosDeRegistro`). Si cambia uno
-- hay que cambiar los dos: nadie avisa, el dato simplemente llega nulo.
--
-- Es idempotente: se puede correr de nuevo.

alter table zentra.usuarios
  add column if not exists nacimiento   date,
  add column if not exists como_conocio text;

alter table zentra.empresas
  add column if not exists rubro  text,
  add column if not exists tamano text;

-- Una fecha de nacimiento futura, o de hace 130 años, es un año mal tipeado.
-- La app ya lo valida; esto es para que no entre por otro camino.
do $$ begin
  alter table zentra.usuarios
    add constraint usuarios_nacimiento_posible
    check (nacimiento is null or (nacimiento > current_date - interval '110 years' and nacimiento < current_date));
exception when duplicate_object then null; end $$;

-- ---------- el disparador guarda lo nuevo ----------
-- Mismo disparador de siempre, con los cuatro campos agregados. Se reescribe
-- entero porque `create or replace function` no sabe parchear: lo de antes
-- queda igual, y lo nuevo es `v_nacimiento` y las dos columnas de cada tabla.

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
    insert into zentra.empresas (nombre, rubro, tamano)
    values (
      coalesce(nullif(btrim(new.raw_user_meta_data ->> 'empresa'), ''), v_nombre),
      nullif(btrim(new.raw_user_meta_data ->> 'rubro'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'tamano'), '')
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

-- Para ver que quedaron las cuatro.
select table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'zentra'
   and (table_name, column_name) in (
     ('usuarios', 'nacimiento'), ('usuarios', 'como_conocio'),
     ('empresas', 'rubro'), ('empresas', 'tamano')
   )
 order by table_name, column_name;

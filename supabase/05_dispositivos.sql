-- =============================================================================
-- Zentra Móvil · 05 · Dispositivos (notificaciones push)
--
-- Firebase Cloud Messaging le da a cada instalación de la app un token. Para
-- mandarle un aviso a alguien hay que saber qué tokens le corresponden, y eso es
-- lo que guarda esta tabla.
--
-- El token identifica al teléfono, no a la persona: cambia si reinstalan la app o
-- limpian los datos, y el mismo teléfono puede pasar de un usuario a otro. De ahí
-- las dos reglas de abajo: el token es único (no se duplica) y la app lo vuelve a
-- guardar en cada arranque.
--
-- Es idempotente: se puede correr de nuevo.
-- =============================================================================

create table if not exists zentra.dispositivos (
  -- El token es la clave natural: un teléfono, una fila. Si el aparato cambia de
  -- dueño, la fila se reasigna en vez de duplicarse; dos filas con el mismo token
  -- harían llegar el aviso dos veces, o al usuario que ya no usa ese teléfono.
  token        text primary key,
  usuario_id   uuid not null references zentra.usuarios(id) on delete cascade,
  empresa_id   uuid not null references zentra.empresas(id) on delete cascade,
  plataforma   text not null check (plataforma in ('android', 'ios', 'web')),
  -- Último arranque que confirmó este token. Sirve para limpiar los que ya no
  -- vuelven: FCM no avisa cuando un token muere, sólo falla al enviarle.
  visto        timestamptz not null default now(),
  creado       timestamptz not null default now()
);

-- Para "a quién le aviso": por usuario y por empresa (un aviso de stock bajo va a
-- todos los de la empresa).
create index if not exists dispositivos_usuario_idx on zentra.dispositivos(usuario_id);
create index if not exists dispositivos_empresa_idx on zentra.dispositivos(empresa_id);

-- ---------- permisos ----------

alter table zentra.dispositivos enable row level security;

-- Sólo lectura y baja. El alta va por la función de abajo: un teléfono que pasa
-- de un empleado a otro necesita reasignar una fila que todavía es de otro, y
-- ninguna política que valga la pena permite eso desde la app.
grant select, delete on zentra.dispositivos to authenticated;
revoke insert, update on zentra.dispositivos from authenticated;

drop policy if exists dispositivos_propios on zentra.dispositivos;

-- Cada uno maneja sólo los suyos. A propósito es más estricto que el resto de las
-- tablas: un compañero de empresa no tiene por qué poder dar de baja el teléfono
-- de otro, ni redirigir sus avisos al suyo.
create policy dispositivos_propios on zentra.dispositivos
  for all
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid() and empresa_id = zentra.empresa_actual());

-- ---------- alta ----------

-- La app llama a esto en cada entrada. Pasa sólo el token y la plataforma: de
-- quién es la fila lo decide el servidor con la sesión, así que no hay forma de
-- registrar un teléfono a nombre de otro ni colgarlo de otra empresa.
--
-- Borra antes de insertar porque el teléfono puede haber sido de otro empleado.
-- Dos filas con el mismo token harían llegar el aviso dos veces, o a quien ya no
-- usa ese teléfono.
create or replace function zentra.registrar_dispositivo(p_token text, p_plataforma text)
returns void
language plpgsql
volatile
security definer
set search_path = zentra, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_empresa uuid;
begin
  if v_uid is null then
    raise exception 'No hay sesión iniciada.';
  end if;
  if coalesce(p_token, '') = '' then
    raise exception 'Falta el token del dispositivo.';
  end if;
  if p_plataforma not in ('android', 'ios', 'web') then
    raise exception 'Plataforma desconocida: %', p_plataforma;
  end if;

  v_empresa := zentra.empresa_actual();
  if v_empresa is null then
    raise exception 'Tu cuenta no tiene empresa en esta instalación.';
  end if;

  delete from zentra.dispositivos where token = p_token;
  insert into zentra.dispositivos (token, usuario_id, empresa_id, plataforma)
  values (p_token, v_uid, v_empresa, p_plataforma);
end;
$$;

grant execute on function zentra.registrar_dispositivo(text, text) to authenticated;

-- ---------- a quién mandarle ----------

-- La usa el servidor que envía los avisos (con la clave de servicio, nunca la
-- app). Devuelve los tokens vivos de una empresa.
create or replace function zentra.tokens_de_empresa(p_empresa uuid)
returns table (token text, plataforma text)
language sql
stable
security definer
set search_path = zentra, pg_catalog
as $$
  select d.token, d.plataforma
    from zentra.dispositivos d
   where d.empresa_id = p_empresa
   order by d.visto desc
$$;

-- No se le da a `authenticated`: es para el backend de envío. Un vendedor no
-- necesita la lista de teléfonos de sus compañeros.
revoke all on function zentra.tokens_de_empresa(uuid) from public, anon, authenticated;

-- ---------- plan y vencimiento ----------
--
-- La suscripción vive en la empresa, no en el usuario: lo que se contrata es
-- una empresa, y todos sus vendedores trabajan bajo el mismo plan.
--
-- `vence` es la única fecha que mira la app. Cada pago la empuja hacia
-- adelante; si los pagos paran, la fecha llega sola y la empresa cae a Free:
-- sigue viendo todo lo cargado y no puede editar ni cargar más.
--
-- No hay un estado "activa/vencida/cancelada" a propósito. Un estado hay que
-- mantenerlo sincronizado con la pasarela, y cada desincronización es un
-- cliente que pagó y no puede trabajar, o uno que no pagó y sigue entrando.
-- Una fecha que sólo se empuja hacia adelante no se desincroniza de nada.

alter table zentra.empresas
  add column if not exists plan  text not null default 'free'
    check (plan in ('free', 'emprendedor', 'max')),
  -- Nulo es "sin vencimiento": las empresas que todavía no contrataron nada, y
  -- las que tienen un acuerdo aparte. La app no bloquea por una fecha ausente.
  add column if not exists vence date;

comment on column zentra.empresas.plan is
  'Plan contratado. Al vencer, la app se comporta como free sin tocar este campo.';
comment on column zentra.empresas.vence is
  'Hasta cuándo está pago. Nulo = sin vencimiento. Cada pago lo empuja.';

-- ---------- pagos ----------
--
-- El libro de lo cobrado. Sirve para dos cosas, y la segunda es la que importa:
--
--   1. Responder por qué el vencimiento de una empresa dice lo que dice.
--   2. No cobrar dos veces lo mismo. La pasarela reintenta el aviso hasta
--      recibir un 200; si cada reintento empujara la fecha, una caída de media
--      hora le regala meses a un cliente. La clave única sobre la referencia
--      del pago es lo que lo impide, a nivel de base y no de código.

create table if not exists zentra.pagos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references zentra.empresas (id) on delete cascade,
  -- Identificador del pago en la pasarela (el `hash_pedido` de Pagopar).
  referencia     text not null,
  pasarela       text not null default 'pagopar',
  monto          numeric(14, 2) not null check (monto >= 0),
  plan           text not null check (plan in ('free', 'emprendedor', 'max')),
  -- A qué fecha quedó empujado el vencimiento con este pago.
  periodo_hasta  date not null,
  pagado_en      timestamptz not null default now(),
  creado_en      timestamptz not null default now(),
  unique (pasarela, referencia)
);

create index if not exists pagos_empresa_idx on zentra.pagos (empresa_id, pagado_en desc);

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

create schema if not exists zentra_movil;

-- Qué columna del ERP corresponde a cada campo que la app espera.
--
-- Vive en una tabla y no adentro de la función porque es lo único que cambia
-- entre un ERP y otro: cuando un cliente tenga las columnas con otros nombres,
-- se agregan filas acá y la misma función genera sus vistas.
create table if not exists zentra_movil.mapeo (
  vista     text not null,   -- la tabla como la ve la app: clientes, productos…
  campo     text not null,   -- el campo que la app espera: nombre, doc…
  expresion text not null,   -- de dónde sale en el ERP: una columna o una expresión SQL
  orden     int  not null default 0,
  primary key (vista, campo)
);

-- De qué tabla del ERP sale cada vista.
create table if not exists zentra_movil.origen (
  vista  text primary key,
  tabla  text not null,
  -- Filtro opcional, por si el ERP marca bajas con una columna en vez de borrar.
  filtro text,
  -- De qué schema sale esta vista, si no es el de la empresa. El ERP guarda el
  -- catálogo —usuarios, empresas— aparte de los datos de cada una.
  schema_origen text
);

-- Para una base donde 10_tablas.sql ya se había corrido sin esta columna.
alter table zentra_movil.origen add column if not exists schema_origen text;

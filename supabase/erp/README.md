# Mostrar los datos de un ERP existente

Cómo hacer que la app muestre los clientes, productos y ventas que un cliente ya
tiene en su ERP, **sin copiar nada y sin levantar ningún servidor**.

La idea: en el mismo proyecto de Supabase del ERP se crea un schema con **vistas**
que traducen sus tablas a la forma que la app espera. PostgREST sirve una vista
igual que una tabla, así que la app la lee sin enterarse.

Resuelve de paso el problema de los schemas `erp_*` que el ERP no publica en la
API: una vista puede leer de un schema no publicado.

## Un schema de vistas por empresa, generado

No se escriben a mano. `zentra_erp.generar()` los crea, y `generar_todas()` lo
hace para todas las empresas leyendo la tabla de empresas del propio ERP:

```sql
select * from zentra_erp.generar_todas('public.empresas', 'codigo', 'data_schema');
```

Devuelve qué hizo con cada una, incluidas las que fallaron. Una empresa con el
schema mal cargado no deja a las demás sin vistas.

Alta una empresa nueva en el ERP y volvé a correr eso: no hay una lista nuestra
en paralelo que se pueda desincronizar.

### Por qué uno por empresa y no uno solo que las vea a todas

Un único schema con vistas que unan todos los schemas del ERP obligaría a filtrar
por empresa **dentro** de la vista. Ahí un error se paga con los datos de un
cliente apareciendo en el teléfono de otro.

Con un schema por empresa la separación la da la conexión: el que entra con el
código de JM se conecta a las vistas de JM, y las de otra empresa no están a su
alcance. Es más difícil de romper, y no hay que acordarse de nada al escribir una
vista nueva.

El costo —un schema más por cliente— lo paga la función, no una persona.

## El mapeo

Lo único que cambia entre un ERP y otro son dos tablas:

```sql
-- De qué tabla del ERP sale cada vista
insert into zentra_erp.origen (vista, tabla, filtro) values
  ('clientes', 'clientes', 'activo is not false');

-- Qué columna corresponde a cada campo que la app espera
insert into zentra_erp.mapeo (vista, campo, expresion, orden) values
  ('clientes', 'id',     'id::text',                                1),
  ('clientes', 'nombre', 'coalesce(razon_social, nombre_contacto)', 2),
  ('clientes', 'doc',    'ruc',                                     3);
```

`expresion` es SQL, no sólo un nombre de columna: sirve `coalesce(...)`, un
`case`, una constante. Después de tocar el mapeo hay que volver a generar.

Los campos que espera la app están en [`docs/BACKEND.md`](../../docs/BACKEND.md).

## Lo que garantiza, y está probado

`test_generador.sql` corre contra un ERP simulado y verifica:

| | |
|---|---|
| 1 | la vista traduce las columnas y aplica el filtro |
| 2 | cada schema de vistas ve sólo su empresa |
| 3 | sólo lectura, y el ERP queda intacto |
| 4 | sin sesión no se llega a las vistas |
| 5 | **la vista hereda el RLS de la tabla del ERP** |
| 6 | cambiar el mapeo y regenerar alcanza |
| 7 | genera todas de una vez, y una rota no frena a las demás |

La 5 es la que no puede fallar. Una vista normal corre con los permisos de quien
la creó y **se saltea** el RLS de la tabla: dejaría leer lo que la tabla no deja.
Por eso cada vista se marca `security_invoker = true`.

```bash
psql -f supabase/erp/test_generador.sql   # sobre una base limpia
```

## Conectarlo con la app

1. Exponer los schemas generados en **Settings → API → Exposed schemas**
   (`zentra_jm`, `zentra_ferre`, …).
2. Cargar cada empresa en el directorio, con su schema:

```bash
npm run empresa -- JM "Distribuidora JM" https://api.ejemplo.com eyJ... zentra_jm
```

El quinto dato es el schema. Sin él la app busca `zentra`, que es el de una
instalación nuestra.

## Lo que esto NO hace

- **No escribe.** Las vistas son de sólo lectura. Que la app registre una venta
  en el ERP es otro trabajo: necesita disparadores `instead of` y, sobre todo,
  respetar las reglas del ERP. Conviene no mezclarlo.
- **No crea cuentas.** El login sigue siendo el del ERP; la app valida contra el
  mismo `auth`.
- **No toca nada del ERP.** Crea schemas nuevos al lado. Aun así: hacelo con una
  copia de seguridad hecha, como cualquier DDL en producción.

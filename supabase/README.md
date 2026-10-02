# Base de datos — Zentra Móvil

SQL para la instalación **pública**: la que usa quien baja la app de la tienda,
se registra y arranca con todo en blanco.

Todo vive en el schema `zentra`, no en `public`. Así estas mismas tablas se pueden
instalar más adelante dentro del proyecto de un cliente que ya tiene ERP sin
pisarle nada de lo suyo.

## Cómo correrlo

En el panel de Supabase, **SQL Editor** → pegar cada archivo y ejecutar, **en este
orden y uno por vez**:

1. `01_schema.sql` — tablas, tipos e índices
2. `02_funciones.sql` — numeración, stock, alta automática al registrarse, totales
3. `03_permisos.sql` — Row Level Security

Los tres son **idempotentes**: si tenés que correrlos de nuevo no rompen nada ni
borran datos. Van a aparecer avisos tipo `does not exist, skipping`; son normales.

No corras `test/00_stub_auth.sql` en Supabase: ese archivo recrea lo que Supabase
ya trae, y sirve sólo para probar en una máquina local.

## Después de correrlo: exponer el schema

Como las tablas no están en `public`, hay un paso más en el panel:

**Settings → API → Exposed schemas** → agregar `zentra`.

Sin esto la app recibe un error de "schema no encontrado" aunque las tablas estén
creadas.

## Qué hace cada cosa

### Registro automático

Cuando alguien se registra, un disparador sobre `auth.users` le crea su empresa y
su perfil en el mismo acto. Sin eso entraría a una app que no sabe quién es.

Si el usuario lo crea soporte para una empresa que ya existe, se le pasa
`empresa_id` en los metadatos y entonces no se crea una empresa nueva.

### Separación entre empresas

Todo cuelga de `zentra.empresa_actual()`, que resuelve a qué empresa pertenece
quien está pidiendo. Cada tabla tiene una política que filtra por eso.

Dos detalles que importan:

- Las políticas llevan `with check` además de `using`. Sin el `with check` alguien
  podría **insertar** filas con el `empresa_id` de otra empresa, aunque no pudiera
  leerlas.
- `empresa_actual()` tiene el `search_path` fijo. Sin eso, alguien podría
  anteponer un schema propio con una tabla `usuarios` falsa y hacerse pasar por
  otra empresa.

### Numeración de comprobantes

`zentra.siguiente_numero(empresa, tipo)` devuelve `VTA-000001`, `COMP-000001`, etc.
La asigna el servidor, nunca la app: si dos vendedores facturan al mismo tiempo, el
bloqueo de fila los serializa y no se repiten números.

### Stock

Lo mantiene un disparador sobre `movimientos`. La app **no** escribe `productos.stock`
directamente; registra el movimiento y el stock se acomoda solo. Así el stock nunca
queda desincronizado del libro.

### Plata

- Montos en `bigint`. El guaraní no tiene centavos, y los enteros evitan los
  errores de redondeo de los decimales.
- Cantidades en `numeric(14,3)`, porque las unidades pesables admiten decimales.
- **El IVA va contenido en el precio de venta**: `bruto × r / (1 + r)`. Para ₲33.500
  al 10% son ₲3.045, no ₲3.350.
- **En compras el IVA va por encima del costo**, porque el proveedor cotiza neto.
- Se suma sin redondear y se redondea una sola vez al final. Redondear por línea y
  después sumar da un guaraní de diferencia, y entonces la factura y la base dejan
  de coincidir.

### Reglas que garantiza la base

No dependen de que la app se porte bien:

- Una venta a crédito **exige cliente identificado**. Las ventas sin nombre sólo
  pueden ser al contado.
- Contado exige método de cobro; crédito exige plazo.
- Una compra en dólares exige tipo de cambio.
- El SKU es único por empresa.

## Probarlo en local

Hay pruebas que corren contra un Postgres común, sin tocar Supabase:

```bash
# con un Postgres levantado y una base vacía
psql -f supabase/test/00_stub_auth.sql   # recrea lo que aporta Supabase
psql -f supabase/01_schema.sql
psql -f supabase/02_funciones.sql
psql -f supabase/03_permisos.sql
psql -f supabase/test/01_pruebas.sql     # las pruebas
```

Verifican el alta al registrarse, que una empresa no vea ni escriba lo de otra, la
numeración correlativa, el IVA contenido, el stock y las reglas de crédito. Cada
una falla ruidosamente si la regla se rompe.

## Lo que falta

- **Facturación electrónica (SIFEN)**: las tablas tienen `sifen_activo` y
  `timbrado`, pero el envío no está. El ERP ya lo tiene resuelto en `lib/sifen/`,
  así que conviene reusar eso en vez de rehacerlo.
- **Paginación**: con miles de movimientos, los listados van a necesitar cursor.
- **Saldo de clientes**: hoy se calcula sumando ventas pendientes. Si crece mucho,
  conviene materializarlo.

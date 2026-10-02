# Base de datos — Zentra Móvil

SQL para la instalación **pública**: la que usa quien baja la app de la tienda,
se registra y arranca con todo en blanco.

Todo vive en el schema `zentra`, no en `public`. Así estas mismas tablas se pueden
instalar más adelante dentro del proyecto de un cliente que ya tiene ERP sin
pisarle nada de lo suyo.

## Cómo correrlo

### Opción recomendada: desde la terminal

Evita los problemas de pegado en el editor web. En el panel, botón **Connect** →
copiar la cadena de conexión (la de *Session pooler* o *Direct connection*), y:

```bash
psql "LA_CADENA_DE_CONEXION" -f supabase/todo_en_uno.sql
```

La contraseña de la base va en esa cadena: es local tuya, no la compartas.

### Opción B: el editor web

`supabase/todo_en_uno.sql` tiene todos los scripts juntos, así es un solo pegado.
Antes de ejecutar, asegurate de que **no haya texto seleccionado** en el editor:
si hay una selección, Supabase corre sólo eso y el script se parte al medio.

### Opción C: de a uno

En **SQL Editor**, pegar cada archivo y ejecutar, **en este orden y uno por vez**:

1. `01_schema.sql` — tablas, tipos e índices
2. `02_funciones.sql` — numeración, stock, alta automática al registrarse, totales
3. `03_permisos.sql` — Row Level Security
4. `04_borrar_cuenta.sql` — borrado de cuenta (requisito de las tiendas)
5. `05_dispositivos.sql` — tokens de notificaciones push

`todo_en_uno.sql` se genera a partir de los sueltos: si cambiás algo, cambialo ahí
y volvé a correr `./generar_todo_en_uno.sh`.

Todos son **idempotentes**: si tenés que correrlos de nuevo no rompen nada ni
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
psql -f supabase/04_borrar_cuenta.sql
psql -f supabase/05_dispositivos.sql

psql -f supabase/test/01_pruebas.sql            # las pruebas
```

Hay tres juegos, y cada uno quiere una base limpia (dejan datos de prueba):

| | |
|---|---|
| `test/01_pruebas.sql` | alta al registrarse, aislamiento entre empresas, numeración correlativa, IVA contenido, stock, reglas de crédito |
| `test/02_pruebas_borrado.sql` | el último usuario se lleva la empresa; si quedan compañeros, no |
| `test/03_pruebas_dispositivos.sql` | un token es un teléfono, el alta pasa por el servidor, se van con la cuenta |

Cada prueba falla ruidosamente si la regla se rompe.

## Borrado de cuenta

`zentra.eliminar_mi_cuenta()` borra la cuenta y sus datos. Las dos tiendas lo
exigen cuando la app permite registrarse, y Apple lo hace cumplir.

Lo hace una función del servidor porque la clave pública de la app no puede tocar
`auth.users`. La regla: si el que se va es el **último** usuario de su empresa, se
borra la empresa entera y con ella clientes, productos, ventas, compras y
movimientos. Si quedan compañeros, sólo se va esa persona y la empresa sigue.

En la app está en **Configuración → Cuenta**, y pide escribir ELIMINAR para
habilitar el botón: un toque accidental no puede borrar un negocio.

## Notificaciones push

`zentra.dispositivos` guarda qué token de Firebase corresponde a qué usuario y
empresa. El token identifica al teléfono, no a la persona: cambia al reinstalar la
app, así que es la clave primaria y la app lo vuelve a guardar en cada entrada.

La política es más estricta que la del resto de las tablas: cada uno ve y da de
baja sólo sus propios dispositivos. Un compañero de empresa no tiene por qué poder
dar de baja el teléfono de otro ni redirigirle los avisos al suyo.

El alta va por `zentra.registrar_dispositivo(token, plataforma)` y no por un
`insert`: la app pasa sólo esos dos datos y el servidor decide de quién es la fila.
Si la app pudiera escribirla, podría poner el id de otro y robarle los avisos; y
reasignar el teléfono que era de otro empleado exige tocar una fila ajena, que
ninguna política razonable permite desde el cliente. Por eso `insert` y `update`
están revocados para `authenticated`.

`zentra.tokens_de_empresa(empresa)` es para el servidor que envía, con la clave de
servicio. A propósito **no** tiene permiso para `authenticated`: un vendedor no
necesita la lista de teléfonos de sus compañeros.

El detalle completo está en [`docs/NOTIFICACIONES.md`](../docs/NOTIFICACIONES.md).

## Lo que falta

- **Facturación electrónica (SIFEN)**: las tablas tienen `sifen_activo` y
  `timbrado`, pero el envío no está. El ERP ya lo tiene resuelto en `lib/sifen/`,
  así que conviene reusar eso en vez de rehacerlo.
- **Paginación**: con miles de movimientos, los listados van a necesitar cursor.
- **Saldo de clientes**: hoy se calcula sumando ventas pendientes. Si crece mucho,
  conviene materializarlo.

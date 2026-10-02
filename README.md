# Zentra Móvil

App móvil de ventas, implementada a partir del prototipo `Zentra Movil.dc.html`
exportado desde [Claude Design](https://claude.ai/design). Es un producto: la misma
app sirve a varias empresas, y los datos de ejemplo del diseño son de Distribuidora
JM sólo porque fue el caso con el que se dibujó.

Next.js 15 (App Router) + React 19 + TypeScript, con **export estático** para poder
empaquetarla como app Android con Capacitor.

## Arrancar

```bash
npm install
npm run dev        # http://localhost:3000
npm run dev:lan    # además accesible desde el celular en la misma red
```

Para verlo en un celular sin deployar: `npm run dev:lan`, averiguá la IP de la
computadora (`ipconfig` en Windows) y abrí `http://TU_IP:3000` desde el teléfono.
Si no carga, suele ser el firewall de Windows bloqueando el puerto 3000.

Otros comandos:

```bash
npm run build      # build de producción → ./out (export estático)
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```

## Pantallas

Las 13 pantallas del prototipo, con sus sub-flujos:

| Pantalla | Sub-pantallas |
|---|---|
| Login | validación de usuario/contraseña |
| Recuperar contraseña | envío de enlace |
| Inicio | dashboard con carrusel (inventario / ventas) y grilla de módulos |
| Configuración | modo claro/oscuro, notificaciones, soporte, cerrar sesión |
| Nueva venta | asistente Cliente → Productos → Resumen → Pago → Comprobante → Factura |
| Clientes | listado, ficha, alta con consulta a la SET |
| Proveedores | listado, ficha con cuenta corriente, alta |
| Compras | listado, ficha, asistente Proveedor → Producto → Condiciones |
| Inventario | listado, ficha, movimientos, ajuste de stock, alta de producto |
| Conversaciones | listado, chat (texto, pedidos, stickers, notas de voz, adjuntos), nueva |
| Reportes | series, dona, ranking y tablas por Ventas / Inventario / Compras |
| Detalle de ventas | listado de facturas y factura individual |
| Módulo (placeholder) | para módulos aún sin diseñar |

## Reglas de negocio

Portadas del prototipo, siguiendo la normativa paraguaya:

- **El IVA está contenido en el precio.** El impuesto se calcula como
  `bruto × r / (1 + r)`, nunca `bruto × r`. Tasas: 10 %, 5 % y exenta.
  Ver `src/lib/calc.ts`.
- **Las compras suman IVA sobre el costo**, porque el proveedor cotiza neto.
- **Contado vs. crédito**: el crédito exige plazo en días; en ventas sólo está
  disponible para clientes identificados (no para ventas "sin nombre").
- **Compras en PYG o USD**, con tipo de cambio aplicado antes de guardar la línea.
- **Valuación de inventario** por CPP / FIFO / LIFO.
- El alta de clientes y proveedores simula la **consulta de RUC en la SET**.

Los importes se formatean en guaraníes con `es-PY` (`₲ 1.250.000`).

## Estructura

```
src/
  app/              # App Router: layout, estilos globales, página raíz
  lib/
    types.ts        # tipos del dominio
    data.ts         # datos de ejemplo (reemplazar por la API)
    calc.ts         # reglas de negocio (IVA, totales, stock)
    reportes.ts     # agregación de reportes
    format.ts       # gs(), norm(), fechas
    theme.ts        # tokens de tema claro/oscuro, colores de módulo
  store/
    state.ts        # AppState + estado inicial
    AppContext.tsx  # provider, acciones y timers
  mobile/
    ZentraApp.tsx   # router de pantallas
    layout/         # marco del teléfono, status bar, tab bar
    screens/        # una pantalla por módulo
    ui/             # primitivas compartidas e íconos
public/assets/      # marca Zentra
```

### Sobre los datos

`src/lib/data.ts` tiene los datos del mock, copiados tal cual para que las cifras
coincidan con el diseño. Son el único punto a reemplazar cuando esté el backend:
las pantallas los leen siempre a través del store, nunca directamente de la red.

### Sobre los estilos

El diseño define todo con estilos inline y valores exactos. La implementación los
mantiene así, en vez de traducirlos a utilidades, para que el resultado sea fiel al
píxel y el diff contra futuros exports de Claude Design siga siendo legible. Los
tokens de color viven en `src/lib/theme.ts` y el tema claro/oscuro se resuelve en
tiempo de render desde `useApp().t`.

## App Android

El proyecto compila como sitio estático (`output: "export"` en `next.config.ts`),
que es lo que necesita Capacitor, y `capacitor.config.ts` ya está configurado:

```bash
npm install
npm run build
npx cap add android   # sólo la primera vez en cada máquina
npm run android       # build + cap sync + abre Android Studio
```

Desde ahí se compila el APK/AAB como cualquier proyecto Gradle. Después de cada
cambio, `npm run sync`.

**Antes de compilar hay que tener `.env.local` completo**: Next hornea las
variables adentro del JavaScript, así que un APK compilado en `mock` queda con
datos de ejemplo para siempre. Los pasos completos y qué probar primero están en
[`docs/APK.md`](docs/APK.md).

La carpeta `android/` está en `.gitignore`: se genera, no se versiona. La única
excepción es `android/app/google-services.json`, la configuración de Firebase: ésa
no se regenera, se descarga de la consola, y sin ella no llegan las notificaciones.

## Código de empresa

La app sirve a dos públicos con un solo APK. En el login se pregunta si la empresa
ya tiene un ERP con nosotros, y el campo del código aparece sólo si contesta que sí:

- **No** → instalación pública (registro abierto, arranca en blanco).
- **Sí + código** → instalación del cliente que ya tiene ERP (sus datos, su login).

El código se normaliza, se guarda en el dispositivo y tolera que el directorio se
caiga. Está en `src/lib/tenant/`; el contrato del directorio está en
[`docs/BACKEND.md`](docs/BACKEND.md).

## Datos

Hoy la app corre con datos de ejemplo. El acceso a datos está detrás de una capa de
puertos (`src/lib/repo/ports.ts`), así que conectar el backend real no toca ninguna
pantalla:

- `src/lib/repo/mock.ts` — implementación con los datos de ejemplo (la activa)
- `src/lib/repo/http.ts` — implementación contra la API real (esqueleto)
- `src/lib/repo/index.ts` — elige una según `NEXT_PUBLIC_BACKEND`

Para apuntar a la API real, copiar `.env.example` a `.env.local` y poner
`NEXT_PUBLIC_BACKEND=http` más la URL.

**[`docs/BACKEND.md`](docs/BACKEND.md) tiene el contrato completo**: entidades,
campos, operaciones, reglas de negocio que el backend debe respetar y las
decisiones que quedan pendientes.

> La app se empaqueta como APK y un APK se puede descompilar, así que **no puede
> conectarse directo a la base de datos**: las credenciales quedarían expuestas.
> Siempre tiene que haber una capa HTTP en el medio (API propia, la del ERP, o un
> BaaS tipo Supabase).

## Conectar con Supabase

El SQL de la base está en [`supabase/`](supabase/). Una vez corrido, en `.env.local`:

```
NEXT_PUBLIC_BACKEND=supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Con eso el login, el registro y los datos salen del proyecto real. Volvé a
`NEXT_PUBLIC_BACKEND=mock` para trabajar sin red.

El código de empresa decide a qué proyecto se conecta: vacío va al de arriba, con
código va al que devuelva el directorio.

Para probar los dos caminos con dos empresas de verdad —sin levantar ningún
servicio ni tocar ningún ERP— están los pasos en
[`docs/PRUEBA-COMPLETA.md`](docs/PRUEBA-COMPLETA.md).

## Deploy

La app compila a estático, así que se sirve con nginx y no necesita Node en el
servidor. Hay `Dockerfile` y `nginx.conf` listos para Coolify; los pasos y el
error más común (las variables tienen que estar disponibles en **build**, no sólo
en runtime) están en [`docs/DEPLOY.md`](docs/DEPLOY.md).

Para el APK no hace falta deployar nada: el código va adentro del paquete y habla
directo con Supabase.

Las notificaciones push van por Firebase Cloud Messaging, con la tabla
`zentra.dispositivos` guardando qué teléfono es de quién:
[`docs/NOTIFICACIONES.md`](docs/NOTIFICACIONES.md).

Cómo actualizar la app sin pasar por la revisión de las tiendas, qué permiten
realmente Apple y Google, y por qué Android e iOS van en el mismo repositorio:
[`docs/ACTUALIZACIONES.md`](docs/ACTUALIZACIONES.md).

## Pendiente

- Conectar la API real: completar `src/lib/repo/http.ts` (ver `docs/BACKEND.md`).
- Migrar las pantallas a leer de `repo` en vez de `lib/data.ts` — es mecánico, pero
  conviene hacerlo sabiendo ya cuál es el backend, para no rehacerlo dos veces.
- Persistencia del estado de pantalla: vive en memoria y se reinicia al recargar
  (la sesión y las preferencias sí se guardan).
- Los inputs de fecha en Reportes usan el control nativo del navegador, así que su
  formato depende del idioma del dispositivo.

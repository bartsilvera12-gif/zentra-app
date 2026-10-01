# Zentra Móvil

App móvil de ventas para **Distribuidora JM**, implementada a partir del prototipo
`Zentra Movil.dc.html` exportado desde [Claude Design](https://claude.ai/design).

Next.js 15 (App Router) + React 19 + TypeScript, con **export estático** para poder
empaquetarla como app Android con Capacitor.

## Arrancar

```bash
npm install
npm run dev        # http://localhost:3000
```

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

El proyecto ya compila como sitio estático (`output: "export"` en `next.config.ts`),
que es lo que necesita Capacitor:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Zentra Móvil" py.com.zentra.movil --web-dir=out
npm run build
npx cap add android
npx cap open android      # abre el proyecto en Android Studio
```

Desde ahí se compila el APK/AAB como cualquier proyecto Gradle. Después de cada
`npm run build`, correr `npx cap sync` para copiar el web build al proyecto nativo.

La carpeta `android/` está en `.gitignore`: se genera, no se versiona.

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

## Pendiente

- Conectar la API real: completar `src/lib/repo/http.ts` (ver `docs/BACKEND.md`).
- Migrar las pantallas a leer de `repo` en vez de `lib/data.ts` — es mecánico, pero
  conviene hacerlo sabiendo ya cuál es el backend, para no rehacerlo dos veces.
- Autenticación real (hoy el login sólo valida que los campos no estén vacíos).
- Persistencia: el estado vive en memoria y se reinicia al recargar.
- Los inputs de fecha en Reportes usan el control nativo del navegador, así que su
  formato depende del idioma del dispositivo.

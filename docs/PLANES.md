# Planes de Zentra

Qué incluye cada plan. Sale de *"Zentra APP · Documentación de planes"*, versión
del 6 de octubre de 2026.

Esto existe porque el mismo plan llegó a tener tres descripciones distintas al
mismo tiempo —una en la app, otra en la base y otra en iOS— y ninguna decía de
dónde salía. Cuando haya que cambiar un plan, se cambia acá primero.

## Los tres planes

| | Gratis | Emprendedor | Max |
|---|---|---|---|
| **Precio** | Free | ₲ 49.000 | ₲ 89.000 |
| | Punto de entrada | Negocio en crecimiento | Todo desbloqueado |

**Se llama "Gratis", no "Básico".** El documento del 6 de octubre lo llama
Básico, y la base lo llamó `Gratis` desde el principio: el mismo plan con dos
nombres. Queda "Gratis", que es lo que decidió Ivan y lo que ya muestra la
página de pago. El código es `free`.

No se paga. Una empresa que no paga —o a la que se le venció— queda ahí: sigue
viendo todo lo que cargó y no puede escribir más de lo que este plan permite.

## Tabla

| Funcionalidad | Gratis | Emprendedor | Max |
|---|---|---|---|
| **Módulos** | | | |
| Inventario | Sí | Sí | Sí |
| Ventas | Sí | Sí | Sí |
| Compras | No | Sí | Sí |
| Proveedores | No | Sí | Sí |
| Conversaciones (chat) | No | No | Sí |
| **Dashboards** | | | |
| De ventas | Sí | Sí | Sí |
| De compras | No | Sí | Sí |
| De inventario | No | No | Sí |
| **Inventario** | | | |
| Máximo de productos | 20 | 50 | Sin tope |
| Actualización de stock | 1×/mes | 1×/mes | Libre |
| Asignar categoría | No | Parcial | Sí |
| Crear categoría desde la carga | No | No | Sí |
| Stock mínimo (carga y aviso) | No | No | Sí |
| Código de barras | No | No | Sí |
| Precio minorista / mayorista | No | No | Sí |
| Fecha de vencimiento | No | No | Sí |
| **Ventas y compras** | | | |
| Venta al contado | Sí | Sí | Sí |
| Venta a crédito | No | No | Sí |
| Compras en guaraníes | No | Sí | Sí |
| Compras en dólares | No | No | Sí |
| Crear proveedor desde compras | No | No | Sí |
| **Facturación** | | | |
| Auto-impresor | No | Sí | Sí |
| Factura electrónica | No | No | Sí |

El "1×/mes" del documento está implementado como **30 días entre dos ajustes del
mismo producto**, y no como "una vez por mes calendario": un ajuste el 31 y otro
el 1 serían dos meses distintos con horas de diferencia, y eso no es lo que se
vendió.

## Dónde vive cada cosa

| | Dónde | Quién manda |
|---|---|---|
| Qué deja hacer cada plan | `src/lib/planes.ts` (y `ios-nativo/.../Planes.swift`) | este documento |
| El precio | `zentra.planes` en la base | — |
| Qué plan tiene una empresa | `zentra.empresas.plan` | los pagos |
| Hasta cuándo está pago | `zentra.empresas.vence` | los pagos |

**El precio no está en el código, en ningún lado.** Vive sólo en la base, por
una razón de seguridad: si el monto lo manda la app, cualquiera abre las
herramientas de desarrollo y se compra un mes de Max por mil guaraníes. El
server lo lee de `zentra.planes` y nunca le cree al cliente. La página de pago
muestra el mismo número que se va a cobrar porque lo lee del mismo lugar.

Para cambiar un precio no hace falta desplegar nada:

```sql
update zentra.planes set precio_mensual = 49000, vendible = true where codigo = 'emprendedor';
update zentra.planes set precio_mensual = 89000, vendible = true where codigo = 'max';
```

El plan gratuito queda en 0 y `vendible = false`: no se vende, se cae a él.

## Con ERP propio no hay plan

La primera línea de `motivoBloqueo()` es `if (ctx.conErp) return null`. Una
empresa que entra con su propio ERP tiene todo y no se le cobra nada desde la
app: ya paga su ERP. Los planes son para quien usa Zentra sola.

## Lo que el documento deja a confirmar

Están implementados como **Sí para Max**, que es lo que dice la tabla:

- Inventario sin tope de productos.
- Actualización de stock libre, sin la espera mensual.
- Factura electrónica.
- Conversaciones (chat).
- "Asignar categoría · Parcial" en Emprendedor: hoy puede asignar una categoría
  existente, y crear una nueva desde la carga es de Max.

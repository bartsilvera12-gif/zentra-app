# Crear las suscripciones en App Store Connect

Los dos productos que la app vende. Sin ellos el botón de comprar no aparece
—ni en TestFlight ni en la App Store— porque StoreKit pide la lista a Apple y
vuelve vacía.

Esto se hace una sola vez. Lo que sigue es el orden en que hay que hacerlo y,
sobre todo, las partes que no se pueden deshacer.

Lo técnico de cómo se cobra y cómo se verifica está en `docs/COBROS.md`. Acá
está nada más que el trámite.

## Antes de empezar

| | |
|---|---|
| Contrato de apps de pago | **Activo**. Sin eso no se pueden crear productos ni probar en sandbox, aunque la app ya esté subida |
| Datos bancarios y fiscales | Cargados y aceptados en Acuerdos, Impuestos y Operaciones Bancarias |
| La app | Creada en App Store Connect, con el bundle `py.com.zentra.movil.nativo` |

Si el contrato figura "Pendiente", lo demás no tiene sentido: los productos se
crean pero quedan inutilizables.

## 1. El grupo de suscripción

App Store Connect → tu app → **Monetización → Suscripciones** → crear grupo.

Nombre: **Zentra**

**Por qué importa y no es un detalle.** El grupo es lo que convierte a
Emprendedor y Max en el mismo producto en dos niveles. Quien está en uno y
compra el otro **cambia de plan**: Apple le cobra la diferencia y cancela el
anterior solo.

Si se crean en grupos distintos, alguien puede terminar **pagando los dos a la
vez**, y la app no tiene forma de impedirlo. Eso no se arregla después: hay que
borrar los productos y volver a crearlos, y un ID de producto borrado no se
puede reusar.

## 2. El primer producto

Dentro del grupo, "Crear".

| Campo | Qué poner |
|---|---|
| Nombre de referencia | `Emprendedor mensual` — interno, no lo ve nadie |
| **ID de producto** | **`zentra_emprendedor_mensual`** |
| Duración | 1 mes |

**El ID no se puede cambiar nunca.** Ni corregir una letra. Si no coincide
carácter por carácter con lo que está en `Compras.swift`, la app no lo
encuentra, StoreKit devuelve una lista vacía y no hay nada en pantalla que
diga por qué. Escribilo dos veces antes de guardar.

Es el mismo ID que en Google Play, a propósito: así una sola línea de un
registro alcanza para saber qué se compró, sin tener dos mapas en la cabeza.

### El precio

Elegís el precio para Paraguay. El más cercano a **49.000 ₲**.

Dos cosas que conviene tener claras:

- **El precio de Apple no es el de `zentra.planes`.** Apple cobra en la moneda
  de la cuenta y le suma sus impuestos. Por eso la app muestra el de Apple
  cuando lo tiene: es el que se le va a cobrar a la persona. El de la base es
  el que se anota en el libro.
- **Los dos hay que mantenerlos a mano.** Es la única duplicación del circuito
  y no se puede evitar. Si cambiás uno, cambiá el otro el mismo día.

De lo que cobra Apple se queda una comisión. El porcentaje exacto depende de
si estás en el Programa para Pequeñas Empresas y de hace cuánto está suscrita
cada persona, así que no lo escribo acá de memoria: se confirma en App Store
Connect → Acuerdos, Impuestos y Operaciones Bancarias.

### Lo que Apple no deja saltear

Dentro del mismo producto, dos secciones que si quedan vacías lo dejan en
"Falta metadata" y no se puede enviar:

**Localización** (español). Es lo que ve la persona en la pantalla de compra de
Apple, no en nuestra app:

```
Nombre:       Emprendedor
Descripción:  Compras, proveedores e inventario hasta 50 productos,
              con dashboard de compras y facturación con auto-impresor.
```

**Información de revisión.** Una captura y una nota. Sirve la captura de la
hoja de planes que está en `ios-nativo/capturas/`. En la nota alcanza con
decir dónde se compra:

```
El plan se compra desde la hoja de planes, que aparece al tocar un módulo
con candado o desde Configuración → Ver planes.
```

## 3. El segundo producto

Lo mismo, en **el mismo grupo**:

| Campo | Qué poner |
|---|---|
| Nombre de referencia | `Max mensual` |
| **ID de producto** | **`zentra_max_mensual`** |
| Duración | 1 mes |
| Precio | el más cercano a 89.000 ₲ |

Localización:

```
Nombre:       Max
Descripción:  Todo lo de Emprendedor sin topes, con reportes, precios
              mayoristas, código de barras, vencimientos y el chat de
              WhatsApp de tu negocio.
```

### El orden dentro del grupo

El grupo tiene un orden de niveles. Max tiene que estar **arriba** de
Emprendedor, porque es el plan mayor. Eso es lo que hace que pasar de uno a
otro sea una mejora —cobro inmediato con prorrateo— y no una degradación, que
Apple aplica recién al final del período pagado.

## 4. Esperar

Los dos quedan en **"Listo para enviar"**. No hace falta enviarlos aparte: se
revisan junto con la primera versión de la app.

**Pero desde "Listo para enviar" ya los encuentra StoreKit**, que es lo que
hace falta para probar. Tarda un rato en propagarse: si probás a los dos
minutos y la lista vuelve vacía, no es la app.

## 5. Probar la compra

Hacen falta tres cosas, y las tres se olvidan:

1. **Una cuenta de sandbox.** App Store Connect → Usuarios y Accesos → Sandbox
   → Cuentas de prueba. Es una cuenta de Apple aparte, que no se usa para nada
   más. En el iPhone se pone en Ajustes → App Store → Cuenta de Sandbox.
2. **Destildar la tienda local en Xcode.** Product → Scheme → Edit Scheme →
   Run → Options → StoreKit Configuration → None. Mientras esté puesta, la app
   habla con el catálogo de mentira y no con Apple.
3. **Que el server esté configurado.** `APPLE_BUNDLE_ID` en el `.env` de la
   VPS. Se comprueba sin comprar nada: `GET /apple/health` tiene que contestar
   `ok: true` y listar los dos productos.

Con eso, comprar en sandbox recorre lo mismo que una compra real: Apple cobra
(sin cobrar), la app manda el comprobante, el server comprueba la firma y
activa el plan. En el registro del server la compra queda marcada como del
entorno de pruebas, para que al revisar la facturación no haya que adivinar
por qué entró un Max gratis.

## Cuando no aparecen los productos

Es el problema más común y siempre es una de estas:

| Síntoma | Causa |
|---|---|
| La lista vuelve vacía | El ID no coincide carácter por carácter |
| La lista vuelve vacía | Todavía no se propagó. Esperá |
| La lista vuelve vacía | El contrato de apps de pago no está activo |
| La lista vuelve vacía | Está puesta la StoreKit Configuration del esquema |
| Sale el botón y la compra falla | El producto quedó en "Falta metadata" |
| Compra bien pero no se activa el plan | Mirá `GET /apple/health` y el registro del server |

En la app, cuando no hay productos el botón directamente no sale: queda la hoja
informativa con la salida de escribirnos. Es a propósito — un botón que no
puede funcionar es peor que no tener botón.

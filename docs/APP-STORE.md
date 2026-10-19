# La ficha de la App Store

Todo lo que pide App Store Connect para publicar la app iOS nativa, escrito.
Existe por lo mismo que `docs/PLAY-STORE.md`: la ficha se carga una vez, se
corrige a los apurones cuando rechazan la app, y después nadie se acuerda de
qué se declaró ni por qué.

**La regla que manda sobre todo lo de acá:** no se puede mencionar, insinuar ni
enlazar un pago fuera de la app. Es la misma política que la de Google y
Paraguay tampoco entra en la excepción. Por eso la app iOS no tiene ningún
camino a PagoPar —se sacó entero, ni siquiera queda el interruptor— y por eso
en los textos de abajo no aparece ninguna dirección de cobro. El plan se compra
adentro, con la caja de Apple. Ver `docs/COBROS.md`.

## Nombre y textos

Los límites de Apple no son los de Google, así que los textos no se copian tal
cual: el nombre es más corto y hay dos campos que en Play no existen.

**Nombre** (30 caracteres máx.)

    Zentra Móvil

**Subtítulo** (30 caracteres máx.) — campo que en Play no existe, se ve abajo
del nombre en los resultados de búsqueda.

    Ventas e inventario del local

**Texto promocional** (170 caracteres máx.) — se puede cambiar sin subir una
versión nueva, así que acá van los anuncios.

    Ahora podés comprar tu plan desde la misma app.

**Palabras clave** (100 caracteres máx., separadas por coma y sin espacios: el
espacio gasta un carácter y no sirve de nada).

    ventas,inventario,stock,clientes,facturacion,negocio,comercio,guaranies,caja,punto de venta

**Descripción** (4000 caracteres máx.)

    Zentra es la app para manejar la venta diaria de tu negocio desde el
    celular, pensada para comercios de Paraguay: en guaraníes, con IVA 10 % y
    5 %, y con los datos que pide una factura local.

    VENTAS
    Cargá una venta en cuatro pasos: cliente, productos, resumen y pago. El
    stock se descuenta solo. Venta al contado o a crédito, con plazo y cliente
    identificado.

    INVENTARIO
    Productos con costo, precio, IVA, unidad, depósito y categoría. Stock
    mínimo con aviso cuando un producto queda por debajo. Ajustes de stock con
    motivo: merma, rotura, inventario físico, devolución. Historial de
    movimientos por producto.

    CLIENTES
    Ficha con RUC o cédula, contacto, dirección y cuenta corriente. Saldo y
    compras de cada cliente a la vista.

    COMPRAS Y PROVEEDORES
    Cargá la compra, elegí el proveedor y el stock entra actualizado. En
    guaraníes o en dólares con tipo de cambio.

    REPORTES
    Ventas, compras e inventario por día, semana, mes o año, con gráficos y
    detalle exportable.

    CONVERSACIONES
    Atendé los mensajes de WhatsApp de tu negocio desde la misma app: fotos,
    audios, documentos y ubicación, con respuestas citadas.

    FUNCIONA CON TU ERP
    Si tu empresa ya usa un ERP de Neura, la app se conecta y trabaja con los
    mismos datos. Si no, Zentra funciona sola.

    PLANES
    Hay un plan gratuito para empezar, con hasta 20 productos, ventas al
    contado y el panel de ventas. Los planes pagos suman compras, proveedores,
    inventario sin tope, precios mayoristas, código de barras, vencimientos y
    el chat de WhatsApp.

**Categoría principal:** Negocios
**Categoría secundaria:** Productividad

## Qué NO decir

Lo mismo que en Play, con uno más que es propio de Apple.

| No poner | Por qué |
|---|---|
| Dónde o cómo se paga el plan, ni una dirección web de cobro | Guideline 3.1.1. Se paga con la baja de la app, no con un rechazo |
| "Factura electrónica" o "SIFEN" | No existe en la app. Declarar algo que no hace es motivo de baja |
| "Imprime en impresora térmica" | Tampoco existe todavía |
| "Consulta el RUC en la SET" | La consulta no está conectada |
| "Android", "Google Play", o el nombre de otra plataforma | Apple rechaza las fichas que nombran a la competencia |

## Permisos: qué pide y para qué

En iOS el texto del permiso lo ve la persona en el momento, así que es parte de
la ficha aunque viva en el proyecto. Están en `project.pbxproj` como
`INFOPLIST_KEY_NS...`:

| Permiso | Texto que se muestra | Cuándo se pide |
|---|---|---|
| Ubicación en uso | "Para mandarle tu ubicación a un cliente por el chat." | Al tocar "Ubicación" en el chat |
| Micrófono | "Para grabar notas de voz y mandarlas por el chat." | Al tocar el micrófono |
| Notificaciones | — (lo pone el sistema) | Al activarlas en Configuración |

Las fotos no piden permiso: se eligen con `PhotosPicker`, que le muestra a la
persona su propia galería sin darle acceso a la app. Ninguno se pide al abrir,
que además es lo que Apple quiere ver.

## Privacidad: el cuestionario y el manifiesto

Son **dos** cosas y tienen que decir lo mismo:

1. `ios-nativo/ZentraMovil/Recursos/PrivacyInfo.xcprivacy`, que viaja adentro
   del `.app`.
2. El cuestionario de App Privacy en App Store Connect, que se llena a mano.

Si se contradicen, el rechazo llega con "your app's privacy manifest does not
match" y sin decir cuál de los dos está mal. Por eso la tabla de abajo es la
traducción literal del manifiesto, campo por campo.

Para **todo**: se recolecta, está **vinculado a la identidad**, **no** se usa
para seguimiento, y la finalidad es **Funcionalidad de la app**.

| En el cuestionario | Qué es en la app |
|---|---|
| Nombre | El de la cuenta y el de los clientes que se cargan |
| Correo electrónico | El de la cuenta y el de los clientes |
| Número de teléfono | El de los clientes |
| Dirección física | La dirección y ciudad de los clientes |
| ID de usuario | El usuario de la sesión |
| ID de dispositivo | El token para mandar las notificaciones |
| Ubicación precisa | El enlace de mapa que se manda por el chat (a 10 m) |
| Datos de audio | Las notas de voz del chat |
| Fotos o videos | Los adjuntos del chat |
| Atención al cliente | Los mensajes del chat |
| Otro contenido del usuario | Los adjuntos y textos que no entran arriba |
| Historial de compras | Los pagos del plan, en `zentra.cobros` y `zentra.pagos` |

Los datos de los clientes del comercio son de terceros y cuentan igual: Apple
pregunta por lo que se recolecta, no por de quién es.

Las tres respuestas que siempre se olvidan:

- **Se cifra en tránsito:** sí, todo va por HTTPS.
- **Se puede pedir la eliminación:** sí. Está "Eliminar mi cuenta" en
  Configuración, adentro de la app, que es lo que Apple exige desde 2022 —no
  alcanza con una página web—. La URL igual existe:
  `https://cobros.neura.com.py/eliminar-cuenta`.
- **Nada se vende ni se comparte** con terceros para publicidad. No hay
  publicidad.

Firebase trae su propio manifiesto adentro del paquete, así que lo suyo no se
repite en el nuestro.

## Clasificación por edad

El cuestionario de Apple no es el IARC de Google, pero las respuestas son las
mismas: la app no tiene violencia, sexo, drogas, apuestas, lenguaje fuerte ni
contenido generado por usuarios visible para desconocidos —el chat es entre el
comercio y sus propios clientes—. Da **4+**.

## La cuenta de prueba para la revisión

**Es lo que más rechazos causa y es lo más fácil de resolver.** Quien revisa la
app está en California, no tiene un comercio, y si no puede entrar rechaza sin
mirar nada más.

La cuenta tiene que cumplir cuatro cosas:

- Entrar con usuario y contraseña, sin código por SMS ni por correo.
- Tener datos cargados: productos, clientes, alguna venta. Una cuenta vacía
  hace que la app parezca que no funciona.
- **No** estar en el plan Gratis. Si está, la mitad de la app aparece con
  candado y quien revisa no ve lo que la ficha promete.
- No caducar. Si vence durante la revisión, el siguiente intento rechaza.

En el campo de notas para la revisión va, además, cómo probar la compra: que
los planes se compran desde la hoja que sale al tocar un módulo con candado, o
desde Configuración → Ver planes.

## Lo que falta y no es texto

| | |
|---|---|
| Ícono | 1024 × 1024 PNG, sin transparencia y sin esquinas redondeadas |
| Capturas | **1320 × 2868** (iPhone 6,9"), entre 3 y 10. Las saca el simulador de **iPhone 17 Pro Max** — ojo que el iPhone 17 Pro da 1206 × 2622, que Apple no acepta |
| Política de privacidad | `https://cobros.neura.com.py/privacidad` — la sirve el mismo server de cobros (`server/src/pagina.js`) |
| URL de soporte | Obligatoria. Apple la muestra en la ficha |
| Correo de contacto | El de la cuenta de desarrollador |
| Los dos productos de suscripción | Ver `docs/COBROS.md`. Sin ellos la app no puede vender |

## Lo que cambia respecto de Play

Para no releer las dos fichas cuando haya que tocar una:

| | Google Play | App Store |
|---|---|---|
| Nombre | 30 caracteres | 30 caracteres |
| Subtítulo | no existe | 30 caracteres |
| Texto promocional | no existe | 170, se cambia sin subir versión |
| Descripción corta | 80 caracteres | no existe |
| Palabras clave | no existe (se deducen del texto) | 100 caracteres |
| Gráfico destacado | 1024 × 500 | no existe |
| Clasificación | cuestionario IARC | cuestionario propio de Apple |
| Baja de cuenta | puede ser una URL | tiene que estar **adentro** de la app |

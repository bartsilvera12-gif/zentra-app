# La ficha de Google Play

Todo lo que pide Play Console para publicar, escrito. Existe porque la ficha se
carga una vez, se corrige a los apurones cuando rechazan la app, y después nadie
se acuerda de qué se declaró ni por qué.

**La regla que manda sobre todo lo de acá:** no se puede mencionar, insinuar ni
enlazar un pago fuera de la app. Google prohíbe vender bienes digitales por
afuera y prohíbe dirigir a la gente a hacerlo, y Paraguay no entra en la
excepción que abrieron para EE.UU., Reino Unido y el Espacio Económico Europeo.
Por eso la compilación que va a Play lleva `NEXT_PUBLIC_LINK_DE_PAGO=0`, y por
eso en los textos de abajo no aparece ninguna dirección de cobro. Ver
`docs/COBROS.md`.

## Nombre y textos

**Nombre de la app** (30 caracteres máx.)

    Zentra Móvil

**Descripción corta** (80 caracteres máx.)

    Ventas, inventario y clientes de tu negocio, desde el celular.

**Descripción completa** (4000 caracteres máx.)

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

**Categoría:** Negocios
**Etiquetas:** ventas, inventario, punto de venta, negocios, comercio

## Qué NO decir

| No poner | Por qué |
|---|---|
| Dónde o cómo se paga el plan, ni una dirección web de cobro | Política de pagos de Google |
| "Factura electrónica" o "SIFEN" | No existe en la app. Declarar algo que no hace es motivo de baja |
| "Imprime en impresora térmica" | Tampoco existe todavía |
| "Consulta el RUC en la SET" | La consulta no está conectada |

## Permisos: qué pide y para qué

Cada uno tiene que poder explicarse en una frase. Si no, sobra.

| Permiso | Para qué | Cuándo se pide |
|---|---|---|
| `INTERNET` | Todo: la app trabaja contra un servidor | No se pide, es automático |
| `RECORD_AUDIO` | Grabar un audio para mandar por el chat | Al tocar el micrófono |
| `MODIFY_AUDIO_SETTINGS` | Reproducir los audios recibidos | No se pide |
| `ACCESS_COARSE_LOCATION` / `ACCESS_FINE_LOCATION` | Mandar la ubicación por el chat | Al tocar "Ubicación" |
| Notificaciones (Android 13+) | Avisos de mensajes nuevos y de stock mínimo | Al activarlas en Configuración |

Ninguno se pide al abrir la app: todos se piden en el momento en que se usan,
que además es lo que Google quiere ver.

## Seguridad de los datos (el formulario)

Lo que la app recolecta, con la respuesta que corresponde a cada pregunta:

| Dato | ¿Se recolecta? | ¿Se comparte? | ¿Obligatorio? | Para qué |
|---|---|---|---|---|
| Nombre y correo | Sí | No | Sí | La cuenta |
| Fecha de nacimiento | Sí | No | Sí | Verificar la edad mínima al crear la cuenta |
| Otra información personal (rubro del negocio, cantidad de empleados, cómo conoció la app) | Sí | No | Sí | Entender quién usa la app |
| Datos de clientes del comercio (nombre, RUC, dirección) | Sí | No | Sí | Función de la app |
| Fotos y archivos | Sí | No | No | Adjuntos del chat |
| Audio | Sí | No | No | Mensajes de voz |
| Ubicación aproximada y precisa | Sí | No | No | Mandar la ubicación por el chat |
| Mensajes | Sí | No | No | El chat |
| Identificador del dispositivo | Sí | No | No | Mandar las notificaciones |

La fecha de nacimiento va en **Información personal → Otra información
personal** y hay que marcarla: Play la revisa, y una app que la pide en el
alta y no la declara es un rechazo. Las tres preguntas del alta —rubro,
cantidad de personas y cómo conoció la app— entran en la misma fila.

Las tres respuestas que siempre se olvidan:

- **Se cifra en tránsito:** sí (todo va por HTTPS).
- **Se puede pedir la eliminación de los datos:** sí. La app tiene
  "Eliminar mi cuenta" en Configuración, y hay que declarar esa URL o ese
  camino en el formulario.
- **Nada se vende ni se comparte con terceros** para publicidad.

## Clasificación del contenido

Cuestionario de IARC. La app no tiene violencia, sexo, drogas, apuestas,
lenguaje fuerte ni contenido generado por usuarios visible para desconocidos
—el chat es entre el comercio y sus propios clientes—. Da apta para todo
público.

## Lo que falta y no es texto

| | |
|---|---|
| Ícono | 512 × 512 PNG, sin transparencia |
| Gráfico destacado | 1024 × 500 PNG o JPG |
| Capturas de teléfono | Entre 2 y 8, mínimo 320 px de lado corto |
| Política de privacidad | `https://cobros.neura.com.py/privacidad` — la sirve el mismo server de cobros (`server/src/pagina.js`) |
| URL de eliminación de cuenta | `https://cobros.neura.com.py/eliminar-cuenta` — misma idea. Google la muestra en la ficha, al lado de la de privacidad |
| Correo de contacto | Visible en la ficha |

La política de privacidad está escrita y servida en
`https://cobros.neura.com.py/privacidad`, por el mismo server de cobros: es el
único dominio nuestro que ya está publicado con certificado, y una política que
se cae el día que la revisan es peor que no tenerla.

**La página y la tabla de "Seguridad de los datos" de arriba se cambian
juntas.** Si dicen cosas distintas, es motivo de rechazo. El correo de contacto
de la página sale de `CONTACTO_EMAIL` en el `.env` del server; sin esa variable
queda sólo el WhatsApp, que es un contacto real.

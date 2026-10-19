# Cobros y suscripciones

Cómo se cobra el plan y cómo eso llega a la app.

## La idea en una línea

**La app mira una sola fecha: `vence`.** Cada pago la empuja un mes hacia
adelante. Si los pagos paran, la fecha llega sola y la empresa cae a Free:
sigue viendo todo lo cargado y no puede editar ni cargar más.

No hay un estado "activa / vencida / cancelada" en ninguna parte, y es a
propósito. Un estado hay que mantenerlo sincronizado con la pasarela, y cada
desincronización es un cliente que pagó y no puede trabajar, o uno que no pagó
y sigue entrando. Una fecha que sólo se empuja hacia adelante no se
desincroniza de nada.

## Las piezas

| Dónde | Qué hace |
|---|---|
| `zentra.empresas.plan` / `.vence` | Lo que mira la app |
| `zentra.cobros` | La intención: qué empresa va a pagar qué plan |
| `zentra.pagos` | El libro de lo que entró de verdad |
| `zentra.registrar_pago_pasarela()` | Registra el pago y empuja la fecha, todo junto |
| `server/` | El server de la VPS: crea el pedido, recibe el aviso y verifica las compras de Play |

Hay **dos cajas y una sola fecha**: en la web cobra Pagopar y en Android cobra
Google. Las dos terminan en `registrar_pago_pasarela`, que es lo único que
mueve `empresas.vence`, y se distinguen por la columna `pasarela`
(`'pagopar'` / `'play'`). Que activen por el mismo camino es a propósito: dos
funciones que empujan la misma fecha se desencuentran el día que se arregla una
y no la otra, y ahí el acceso de un cliente pasa a depender de por dónde pagó.

`cobros` existe por una razón concreta: el aviso de pago trae el `hash_pedido`
de Pagopar y nada más. **La relación entre ese hash y la empresa hay que
guardarla antes de mandar a la persona a pagar**, o cuando entre la plata no se
va a saber de quién es.

## El recorrido de un pago por la web (Pagopar)

1. Se crea el cobro en `zentra.cobros` con la empresa, el plan y el monto.
2. Se crea el pedido en Pagopar (`iniciar-transaccion`), que devuelve un hash.
   **Ese hash se guarda en el cobro.**
3. La persona paga, por el medio que sea.
4. Pagopar le pega a `POST /pagopar/webhook` del server.
5. El server verifica la firma, y `registrar_pago_pasarela` inserta el pago y
   empuja `vence`.
6. La app, al entrar, lee el `vence` nuevo.

Los pasos 1 y 2 los hace `POST /pagopar/crear-cobro`; del 4 al 5, `POST /pagopar/webhook`.

## Conectar la cuenta de Pagopar

En orden, y sin saltear el paso 2: casi todo lo que sale mal después se
diagnostica ahí en veinte segundos.

### 1. Sacar las claves

Del panel de Pagopar, en **Integrar con mi sitio web**: una pública y una
privada. Ojo con el ambiente — las de desarrollo no sirven en producción ni al
revés. Habilitar el comercio para producción lo hace el soporte de Pagopar, no
se destraba desde el código.

**La privada no va al repositorio, ni a la app, ni a un chat.** Con ella se
firman pedidos y se falsifican avisos de pago.

### 2. Probar las claves antes de desplegar nada

```bash
cd server && node --env-file=.env src/prueba.js
```

Crea un pedido de prueba de verdad contra Pagopar —de mil guaraníes, que
caduca solo en una hora— y dice si lo aceptó. Usa el mismo código que la
función, así que lo que pase acá es lo que va a pasar allá.

Esto separa dos preguntas que de otro modo se mezclan: *¿están bien mis
claves?* y *¿está bien desplegada mi función?*. Sin separarlas, un "token
inválido" puede ser la clave mal copiada, el ambiente equivocado o el comercio
sin habilitar, y no hay forma de saber cuál.

### 3. Correr las migraciones y cargar los precios

```sql
-- supabase/06_planes.sql, 07_cobros.sql, 08_precios.sql
update zentra.planes set precio_mensual = 150000, vendible = true where codigo = 'max';
```

Los precios arrancan en cero y sin vender a propósito: un precio por defecto
inventado es el que termina cobrándose el día que alguien se olvida de
cargarlo.

### 4. Desplegar

```bash
cd server && npm install
cp .env.example .env    # completar con las claves
npm start               # o con pm2 / systemd / Coolify, como el resto de la VPS
```

### 5. Decirle a Pagopar a dónde avisar

En el panel, **Integrar con mi sitio web → URL de respuesta**, la URL que
`https://tu-dominio/pagopar/webhook`.

### 6. Probar el circuito entero

Un pago de prueba, y después:

```sql
select estado, hash_pedido from zentra.cobros order by creado_en desc limit 1;
select * from zentra.pagos order by pagado_en desc limit 1;
select nombre, plan, vence from zentra.empresas where id = '...';
```

El cobro tiene que quedar `pagado`, el pago registrado, y `vence` un mes más
adelante. Si el cobro quedó `pendiente` con hash, el pedido se creó pero el
aviso no llegó: revisá la URL de respuesta y los logs de la función.

## Crear el pedido

`POST` a la función, con la sesión de la persona:

```
POST /pagopar/crear-cobro
Authorization: Bearer <access_token de Supabase>
{ "plan": "max", "documento": "1234567" }

→ { "url": "https://www.pagopar.com/pagos/<hash>", "monto": 150000, "plan": "Max" }
```

Se manda a la persona a esa URL. El resto lo hace Pagopar.

Dos cosas **no** se le creen nunca a quien llama, y son las que hacen que esto
sea seguro:

- **El monto** sale de `zentra.planes`. Si lo mandara el navegador, cualquiera
  abre las herramientas de desarrollo y se compra un mes de Max por mil
  guaraníes.
- **La empresa** sale de la sesión, no del cuerpo, para que nadie pueda crear
  un cobro a nombre de otro.

Y un detalle que cuesta encontrar solo: la firma del pedido es
`sha1(clave_privada + referencia + monto)`, donde el monto va escrito como lo
escribe PHP con `strval(floatval($monto))` — `"150000"`, no `"150000.00"`.
Mandar los dos decimales hace que Pagopar conteste "token inválido" sin decir
por qué. Está en `phpStrvalFloatval()` y tiene su prueba.

Tocar "Pagar" dos veces no crea dos pedidos: si hay uno pendiente del mismo
plan y monto de las últimas 48 horas, se devuelve el mismo link.

## Dónde corre

En la VPS, no en la app. **La clave privada no sale del `.env` de ahí.** Con ella se pueden firmar pedidos y
falsificar avisos de pago, así que no va en la app, ni en el ERP de nadie, ni
en el repositorio.

## Qué contesta la función, y por qué

Pagopar reintenta cada 10 minutos hasta recibir un 200 con el mismo `resultado`
que mandó.

| Situación | Respuesta | Por qué |
|---|---|---|
| Pago registrado | 200 | Listo |
| Aviso repetido | 200 | Ya estaba; no se toca nada |
| Todavía no pago, o cancelado | 200 | Llegó bien, no hay nada que hacer |
| Hash que no es de ningún cobro nuestro | 200 | No es nuestro; que no reintente para siempre |
| Firma que no corresponde | 401 | Si no es Pagopar, no hay nada que confirmarle |
| Error nuestro (base caída) | 500 | **Que reintente**: el pago ya se hizo y no se puede perder |

Esa última fila es la que importa: ante un error propio hay que fallar ruidoso
y dejar que la pasarela insista.

## Probar en producción sin pagar el precio entero

Una vez en producción no hay ambiente de prueba: cada cobro es plata real. Para
poder recorrer el circuito completo sin gastar Gs 89.000 por vez existe el
**cobro de prueba**.

```
COBRO_PRUEBA_CLAVE=una-clave-larga-que-nadie-adivine
COBRO_PRUEBA_MONTO=1000
```

Con eso puesto, `https://cobros.neura.com.py/pagar?clave=una-clave-larga-...`
muestra la misma página con el monto de prueba y un aviso arriba. El resto es
idéntico a una compra real: mismo plan, mismo PagoPar, mismo aviso firmado,
misma función que activa la empresa.

**No es un plan, y eso es a propósito.** Un "plan de mil guaraníes que da todo"
habría significado un cuarto código en `zentra.planes`, en los dos `check` de
la base y en `src/lib/planes.ts`, para siempre, a un descuido de aparecer en la
lista de planes. Acá se cobra `max`: la empresa queda en `max` igual que con una
compra real, y lo único distinto es el monto. Si probar activara otra cosa, no
estaría probando nada.

Lo que hay que tener claro:

- **Quien tenga la clave se compra un mes de Max por mil guaraníes.** Va sólo en
  el `.env` del server, nunca en un link que se comparta, nunca en la app.
- Sin `COBRO_PRUEBA_CLAVE`, o con una de menos de 16 caracteres, el camino no
  existe: no se puede pedir ni adivinando.
- Cada cobro así sale en el log como `[cobro-prueba]`, con empresa y usuario.
  Es para que al revisar la facturación no haya que adivinar por qué entró un
  Max por mil.
- La página no menciona que el camino existe a menos que se llegue con la
  clave.

Para apagarlo: borrar la línea del `.env` y reiniciar.

## Cobrar en Android con Google Play

Adentro de la app Android no se puede cobrar por otro lado: la política de
pagos de Google Play obliga a usar su facturación para vender una suscripción
digital, y la apertura a cobros externos de 2026 llega a Estados Unidos, el
Reino Unido y el EEE — Paraguay no está. Así que en Android cobra Google y en
la web sigue cobrando Pagopar, con el mismo precio y el mismo plan.

Google se queda con su comisión y nos avisa de la compra. Lo que llega a la app
es un `purchaseToken`, y con eso el server le pregunta a Google si la compra es
de verdad.

### El recorrido de una compra

1. La persona aprieta "Suscribirme" en la app y paga en la caja de Google.
2. Play le devuelve a la app un `productId` y un `purchaseToken`.
3. La app llama a `POST /play/verificar` con su sesión de Supabase.
4. El server le pregunta a Google por ese token
   (`purchases.subscriptionsv2.get`).
5. Si está activa, **la reconoce** (`acknowledge`).
6. Crea el cobro en `zentra.cobros` con `pasarela = 'play'` y registra el pago
   con `registrar_pago_pasarela`, que empuja `vence`.
7. La app, al entrar, lee el `vence` nuevo. Igual que con Pagopar.

```
POST /play/verificar
Authorization: Bearer <access_token de Supabase>
{ "productId": "zentra_max_mensual", "purchaseToken": "<lo que devolvió Play>" }

→ { "ok": true, "plan": "max", "vence": "2026-11-15" }
```

| Producto en Play Console | Plan |
|---|---|
| `zentra_emprendedor_mensual` | `emprendedor` |
| `zentra_max_mensual` | `max` |

Un `productId` que no esté en esa tabla se rechaza. **No hay plan por
defecto**: caer a uno sería activar Max porque alguien escribió mal un
identificador.

### Las reglas, que son las mismas de siempre

- **Nunca se le cree al cliente que la compra existe.** El `purchaseToken` sale
  de un APK, y un APK se descompila y se parchea: es exactamente igual de
  falsificable que un monto que manda el navegador. Lo que vale no es el token
  sino lo que Google contesta cuando le preguntamos por él.
- **El monto sale de `zentra.planes`.** Google cobra lo suyo en el teléfono y
  nosotros no vemos ese número; lo que se anota en el libro es lo que vale el
  plan. Mandar un monto en el cuerpo del pedido no cambia nada.
- **La empresa sale de la sesión, no del cuerpo.** Si no, con una compra propia
  se le activaría el plan a cualquiera.
- **El comprobante tiene que ser del plan que se pide.** El `productId` de la
  compra tiene que coincidir con el pedido: sin eso, un mes de Emprendedor
  pagado alcanza para pedir que se active Max.
- **Reconocer la compra no es opcional.** Una compra que no se reconoce dentro
  de los **tres días** Google se la reembolsa sola al cliente, y la plata se
  pierde sin que nadie se entere, porque del lado nuestro todo salió bien. Por
  eso el `acknowledge` va **antes** de registrar el pago: si después falla la
  base, la app reintenta y la segunda vez Google ya la da por reconocida. Al
  revés —activar primero y que falle el reconocimiento— la plata se va y el
  plan queda activo.
- **Mandar dos veces el mismo token no cobra ni activa dos veces.** El
  `purchaseToken` es la referencia y el hash a la vez, y la clave única
  `(pasarela, referencia)` de `zentra.pagos` es la que lo impide — a nivel de
  base y no de código. La segunda vez contesta `{ ok: true, repetido: true }`
  con la misma fecha. Importa porque la app reintenta de verdad: después de un
  corte de red, al reinstalar, al restaurar compras.

Qué estados de Google activan el plan, y por qué:

| Estado | ¿Activa? | Por qué |
|---|---|---|
| `ACTIVE` | Sí | Pagó y está corriendo |
| `CANCELED` | Sí | Apagó la renovación automática; el mes que pagó lo tiene |
| `IN_GRACE_PERIOD` | Sí | Falló el cobro de la renovación y Google sigue intentando: pide que conserve el acceso |
| `PENDING` | No | Todavía no pagó (así llega un pago en efectivo sin acreditar) |
| `ON_HOLD`, `PAUSED`, `EXPIRED` | No | No hay período pago corriendo |

Una compra de un probador autorizado (`testPurchase`) se activa igual —probar
tiene que recorrer lo mismo que recorre un cliente— pero queda gritada en el
log como `[play] compra de prueba`, igual que el cobro de prueba de Pagopar:
para que al revisar la facturación no haya que adivinar por qué entró un Max
gratis.

### Crear la cuenta de servicio

Es la parte que más pasos tiene y la que no se puede adivinar. Son dos consolas
distintas y hay que pasar por las dos.

**1. En Google Cloud Console**, en el proyecto de la app (el mismo del
`google-services.json` sirve):

1. **APIs y servicios → Biblioteca**: habilitar **Google Play Android Developer
   API**. Sin esto, todo lo demás contesta 403 y el mensaje no dice que falta
   habilitarla.
2. **IAM y administración → Cuentas de servicio → Crear**. Un nombre que se
   entienda dentro de un año: `zentra-play-cobros`. **No** hace falta darle
   ningún rol de Cloud: los permisos que importan se dan en Play Console.
3. En esa cuenta, **Claves → Agregar clave → Crear nueva → JSON**. Se descarga
   una sola vez y no se puede volver a bajar.

**El JSON no va al repositorio, ni a la app, ni a un chat.** De adentro se usan
dos campos: `client_email` y `private_key`.

**2. En Google Play Console**, con la cuenta de desarrollador:

1. **Usuarios y permisos → Invitar nuevo usuario**, con el `client_email` de la
   cuenta de servicio (termina en `.iam.gserviceaccount.com`).
2. Darle acceso **a la app `py.com.zentra.movil`** y nada más. Los permisos que
   necesita son dos:
   - **Ver información financiera, pedidos y respuestas de encuestas**
   - **Administrar pedidos y suscripciones**

   Alcanza y sobra para `subscriptionsv2.get` y `acknowledge`. No hace falta
   permiso de publicar ni de administrar la cuenta: una credencial que vive en
   una VPS no tiene por qué poder publicar una versión.
3. El permiso puede tardar **hasta 24 horas** en empezar a andar. Mientras no
   anda, la API contesta 401 como si la clave estuviera mal, y es el error que
   más tiempo hace perder de todo esto.

**3. En el `.env` del server:**

```
PLAY_SERVICE_ACCOUNT_EMAIL=zentra-play-cobros@proyecto.iam.gserviceaccount.com
PLAY_SERVICE_ACCOUNT_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
PLAY_PACKAGE_NAME=py.com.zentra.movil
```

El PEM tiene saltos de línea y un `.env` no, así que se pega con los saltos
escritos como `\n` (entre comillas) o el PEM entero en base64: las dos formas
se aceptan, porque las dos aparecen y la alternativa es un despliegue que falla
con "no es una clave" sin que nadie sospeche que el problema es un `\n`.

Para ver que quedó:

```bash
curl https://cobros.neura.com.py/play/health
```

Devuelve el paquete, la cuenta, el largo de la clave y los productos que
acepta, sin mostrar la clave. Si `ok` es `false`, dice qué falta.

**Si falta algo de esa configuración, `/play/verificar` contesta error y no
activa nada.** Un camino de pago que "funciona" sin poder verificar es peor que
uno apagado: activaría planes contra tokens que nadie miró.

### Los productos en Play Console

Los dos productos de suscripción se crean en **Monetizar → Suscripciones**, con
los ids de la tabla de arriba. El id **no se puede cambiar** después de
publicado, así que conviene escribirlo dos veces antes de guardar.

El precio en Play se carga aparte del de `zentra.planes` y **los dos hay que
mantenerlos a mano**. Es la única duplicación del circuito y no se puede evitar:
el precio que cobra Google lo decide Google Play, y el que se anota en el libro
sale de la base. Si se cambia uno, cambiar el otro el mismo día.

### Probarlo

Sin pagar no hay forma de probar una compra de verdad: hace falta Play Console,
un probador autorizado (**Configuración → Pruebas de licencia**) y un APK
firmado subido a un canal de prueba. Por eso el circuito entero está cubierto
con un Google de mentira:

```bash
cd server && npm run test:play
```

Levanta un Google y un Supabase locales —con una clave RSA generada en el
momento, nunca una de verdad— y prueba lo que, cuando está mal, se nota meses
después y en la plata: un token falsificado que activa un plan, una compra que
nunca se reconoce, un comprobante de Emprendedor que se lleva un Max, el mismo
token mandado dos veces.

## Cobrar en iOS con la App Store

Apple pide lo mismo que Google: vender una suscripcion adentro de una app de la
App Store obliga a cobrar con su sistema, y mandar a pagar afuera —con un boton,
un enlace o hasta un texto con la direccion— esta prohibido. Paraguay tampoco
entra en las excepciones. Asi que la app iOS vende con la caja de Apple.

La estructura es la misma que la de Play y las reglas son identicas, asi que lo
de arriba vale entero. Lo que cambia es **como se comprueba la compra**, y es la
unica diferencia que importa:

| | Google Play | App Store |
|---|---|---|
| Lo que recibe la app | un `purchaseToken` opaco | la transaccion firmada por Apple (un JWS) |
| Como se comprueba | preguntandole a Google por HTTP | verificando la firma, sin red |
| Que hace falta guardar | cuenta de servicio + su clave privada | nada |
| Donde vive | `server/src/play.js` | `server/src/apple.js` |

Un `purchaseToken` es un numero de guardarropa: no dice nada, hay que ir a
preguntar. Apple, en cambio, entrega la transaccion ya firmada, con la cadena de
certificados adentro. Comprobarla es verificar esa firma contra el certificado
raiz de Apple, que es publico y esta en `server/src/apple-root-ca-g3.pem`.
Resultado: **no hay ninguna credencial de Apple que guardar ni que rotar**.
Falsificar un comprobante es falsificar una firma de Apple.

### El recorrido de una compra

1. La persona toca "Suscribirme a Max" en la hoja de planes.
2. StoreKit abre la caja de Apple y cobra.
3. Apple le devuelve a la app la transaccion firmada.
4. La app llama a `POST /apple/verificar` con el `productId` y el comprobante.
5. El server comprueba la firma, el bundle, el producto, que no este devuelta y
   que no este vencida.
6. Si todo cierra: `registrar_pago_pasarela` con `pasarela = 'apple'`, que es lo
   unico que mueve `empresas.vence`.
7. **Recien ahi** la app termina la transaccion (`finish()`).

Ese orden del paso 7 es el equivalente del `acknowledge` de Google, y es igual
de importante. Una transaccion sin terminar Apple la vuelve a ofrecer cada vez
que arranca la app, asi que una compra que se cobro y no se pudo registrar se
recupera sola en el proximo arranque (`Compras.reclamarPendientes()`). Una que
se termina antes de que el server confirme desaparece para siempre, con la plata
ya cobrada.

La referencia que se guarda es el `transactionId`, no el comprobante entero: el
JWS son miles de caracteres y cambia de forma cuando Apple rota sus
certificados. El `transactionId` es unico por cobro y **nuevo en cada
renovacion**, que es justo lo que hace falta para que el mes que viene se pueda
volver a empujar la fecha. Con el `originalTransactionId` la segunda renovacion
chocaria contra la clave unica `(pasarela, referencia)` de `zentra.pagos` y se
tratarian como repetida: el cliente pagaria el mes y la fecha no se moveria.

### La configuracion

```
APPLE_BUNDLE_ID=py.com.zentra.movil.nativo
```

Y nada mas. **OJO con el bundle**: no es el mismo que el paquete de Android ni
que el de la otra app iOS (la del WebView, que es `py.com.zentra.movil`). Si
esta mal, *todas* las compras se rechazan con "esa compra no es de esta app" y
no hay ninguna otra pista.

Hay un `APPLE_ROOT_CA_PEM` que reemplaza el certificado raiz. **Nunca va en
produccion**: con eso los comprobantes se comprueban contra una firma que no es
de Apple, y cualquiera se arma una cadena propia y se activa Max gratis. Existe
solo para que las pruebas puedan firmar comprobantes de mentira. Si esta puesta,
el server lo grita al arrancar y `/apple/health` lo dice.

### Los productos en App Store Connect

El trámite paso a paso está en `docs/SUSCRIPCIONES-APPLE.md`, con las partes
que no se pueden deshacer. Acá, lo que hace falta saber desde el código.

Se crean en **Monetizacion → Suscripciones**, con un grupo de suscripcion y los
mismos ids que en Play:

| Producto | Plan |
|---|---|
| `zentra_emprendedor_mensual` | `emprendedor` |
| `zentra_max_mensual` | `max` |

Que coincidan con los de Google es por comodidad, no por obligacion: son dos
catalogos separados. La ventaja es que una sola linea de un registro alcanza
para saber que se compro.

El precio se carga aparte del de `zentra.planes` y, igual que con Play, **los
dos hay que mantenerlos a mano**. La app muestra el de Apple cuando lo tiene,
porque es el que se va a cobrar (Apple cobra en la moneda de la cuenta y le suma
sus impuestos); el que se anota en el libro sale siempre de la base.

### Probarlo

Sin productos aprobados no hay compra que probar. Hay dos formas, y conviene las
dos:

```bash
cd server && npm run test:apple
```

Levanta un Supabase local, firma comprobantes con una cadena de certificados de
mentira (`server/test-apple-cadena.mjs`) y recorre lo que, cuando esta mal, se
nota meses despues y en la plata: una firma falsificada que activa un plan, un
comprobante de Emprendedor que se lleva un Max, la misma compra mandada dos
veces, una renovacion tratada como repetida. La prueba que mas importa es la que
comprueba que esa misma cadena, contra la raiz de Apple de verdad, **se
rechaza**.

Del lado de la app hay un catalogo local en
`ios-nativo/ZentraMovil/Recursos/Zentra.storekit`, ya enganchado al esquema. Al
correr desde Xcode, StoreKit usa esa tienda de mentira: aparecen los botones de
comprar y se puede recorrer la compra entera sin pagar ni tener nada aprobado.
**Antes de probar contra el sandbox de Apple hay que destildarlo** en Product →
Scheme → Edit Scheme → Run → Options → StoreKit Configuration, porque mientras
este puesto la app no habla con Apple. Las compras de la tienda local estan
firmadas por un certificado local, asi que el server las rechaza —como debe—: lo
que se prueba ahi es la app, no el circuito entero.

## Lo que todavía NO está hecho: las notificaciones de Google

**El plan se activa al comprar y nada más.** Hoy el server se entera de una
compra porque la app se lo cuenta, y de nada más. Eso deja afuera todo lo que
pasa después, que en una suscripción es casi todo:

- **La renovación mensual.** Google cobra el mes 2 sin que nadie abra la app. Si
  la persona no entra, el server no se entera y `vence` no se empuja: cae a Free
  habiendo pagado. Hoy se tapa solo si la app verifica la compra cada vez que
  arranca —la verificación es idempotente, así que puede—, pero eso es un
  parche: depende de que alguien abra la app.
- **La cancelación y el no pago.** Si deja de pagar, nadie avisa. En este caso
  el modelo juega a favor: `vence` llega y la empresa cae a Free sola, sin
  necesidad de que nos avisen. Es la razón por la que el circuito se puede
  publicar así.
- **El reembolso.** Si Google le devuelve la plata, el mes queda activo igual.
  Lo mismo que pasa con una reversión de Pagopar, y por ahora con la misma
  respuesta: se resuelve a mano.

Lo que falta es **Real-time developer notifications**: Google publica en un
tópico de Pub/Sub cada cambio de estado de cada suscripción —renovó, canceló,
entró en gracia, se reembolsó— y el server se suscribe con un webhook. Es el
equivalente del `POST /pagopar/webhook` que ya existe, del otro lado.

Lo que hay que decidir antes de escribirlo, y es la razón de que no esté:

1. **Cómo llega.** Pub/Sub puede empujar a un HTTPS (un endpoint más en este
   mismo server, lo más parecido a lo que ya hay) o quedarse esperando que
   alguien lo lea. Push es más simple y obliga a verificar el JWT con el que
   Google firma cada entrega, igual que hoy se verifica la firma de Pagopar.
2. **De quién es cada notificación.** El aviso trae el `purchaseToken` y nada
   más, igual que el aviso de Pagopar trae el `hash_pedido`. Por eso el cobro se
   guarda con el token como referencia **antes** de activar: cuando llegue el
   aviso de la renovación, ese es el único hilo que lleva a la empresa. Esa
   parte ya está lista.
3. **Qué hace una renovación.** Registrar un pago nuevo con la referencia de la
   renovación —no con la de la compra original, o la clave única lo toma como
   repetido y no empuja nada— y empujar `vence` un mes.
4. **Qué hace una cancelación.** Probablemente nada, por la misma razón que hoy
   una reversión de Pagopar no quita el mes: sacarle el acceso a alguien de
   golpe, desde un webhook, es una decisión demasiado grande para
   automatizarla. Que la fecha llegue sola.

Hasta que eso exista, la recomendación para el frente de la app es **verificar
la compra en cada arranque**: es idempotente y es lo que mantiene la fecha al
día entre renovaciones.

### Lo mismo, del lado de Apple

Apple tiene su equivalente —**App Store Server Notifications V2**— y está
igual de pendiente, con las mismas cuatro decisiones. La diferencia es que su
aviso llega firmado, como el comprobante, así que verificarlo es el mismo
código que ya está en `server/src/apple.js`.

En iOS el parche de mientras tanto es mejor que una recomendación: ya está
hecho. `Compras.escuchar()` se engancha a `Transaction.updates`, que es por
donde Apple entrega las renovaciones, las compras que quedaron esperando
aprobación y las hechas en otro dispositivo de la misma cuenta. Mientras la
persona abra la app alguna vez durante el mes, la renovación se registra sola.
Lo que no tapa, igual que en Android, es el mes en que no la abre nunca.

## Lo que no hace sola

**Una reversión no quita el mes.** Llega como `pagado: false` sobre un pedido
que ya estaba pago. Sacarle el acceso a alguien de golpe, desde un webhook, es
una decisión demasiado grande para automatizarla: queda en el log y se resuelve
a mano.

**No cobra sola.** Quien cobra es Pagopar en la web y Google en Android. Esto
sólo escucha y pregunta.

**Nada de esto quita un plan.** Lo único que baja a alguien a Free es que llegue
la fecha. Es a propósito: ver arriba, en "la idea en una línea".

## Preguntas abiertas con Pagopar

Antes de automatizar el alta hace falta confirmar dos cosas:

1. **El link de suscripción, ¿debita solo de una tarjeta catastrada, o genera un
   pedido cada período que el cliente paga con el medio que quiera?** Cambia
   qué se le puede ofrecer al cliente: con débito automático es sólo tarjeta;
   si genera un pedido, entra también el QR.
2. **¿Se puede pasar una referencia propia por cliente en el link de
   suscripción?** Si no se puede, hace falta un link por empresa, que con pocos
   clientes se banca y con muchos no.

## Por qué hay dos cajas y no una

Durante un tiempo la app sólo **informaba** —"tu plan vence el 13/11"— y no
llevaba botón de pagar: el cobro vivía nada más que en la página web. La razón
era que vender una suscripción adentro de una app Android, cobrando a gente de
Paraguay, choca con la política de pagos de Google Play, y la apertura a cobros
externos de 2026 llega a Estados Unidos, el Reino Unido y el EEE — Paraguay no
está.

Eso no cambió. Lo que cambió es la respuesta: en vez de no cobrar en Android, se
cobra **con la caja de cada tienda**, que es lo que la política pide. Así que
ahora hay tres:

| Dónde compra | Quién cobra | Cómo se entera el server |
|---|---|---|
| App Android | Google Play | La app llama a `POST /play/verificar` y el server le pregunta a Google |
| App iOS | App Store | La app llama a `POST /apple/verificar` y el server comprueba la firma de Apple |
| Navegador | Pagopar | Pagopar le pega a `POST /pagopar/webhook` |

Pagopar no se va a ningún lado, y no es por nostalgia: es el único camino que
toma pago por QR y transferencia, que es cómo paga mucha gente acá, y el único
que sirve para quien usa Zentra desde la computadora. Google cobra su comisión y
sólo funciona en Android.

Pagopar sigue siendo mejor negocio que las dos tiendas —no hay comisión—, pero
las apps no pueden nombrarlo.

Lo que **no** hay que hacer nunca es ofrecer el link de la página web adentro de
las apps: eso es exactamente lo que las políticas prohíben, y se paga con la
baja de la app. El link de `/pagar` se comparte por fuera —WhatsApp, el correo,
la web— y adentro de cada app el botón es el de su tienda.

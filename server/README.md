# Server de cobros

Node chico que corre en la VPS y cobra las suscripciones. Mismo molde que el de
`tienda-aguara-vulka`: Express, el `.env` en la VPS, Supabase como base.

```
POST /pagopar/crear-cobro   la persona quiere pagar → devuelve a dónde ir
POST /pagopar/webhook       PagoPar avisa que pagó  → empuja el vencimiento
GET  /pagopar/health        ver si está todo configurado
POST /play/verificar        la app compró en Android → empuja el vencimiento
GET  /play/health           ver si Play está configurado
```

Dos cajas y una sola fecha: en la web cobra PagoPar y en Android cobra Google
—adentro de la app Google no deja cobrar por otro lado—, pero las dos terminan
en `registrar_pago_pasarela`, que es lo único que mueve `empresas.vence`. El
circuito completo de los dos está en `docs/COBROS.md`.

## Por qué está acá y no en la app

La clave privada de PagoPar firma pedidos y valida avisos de pago. Un APK se
descompila, así que la clave no puede viajar adentro. Entre la app y PagoPar
siempre hay un servidor.

Y por eso mismo `server/` tiene su propio `package.json`: no es parte del
bundle de la app y sus dependencias nunca llegan al teléfono.

## Poner a andar

```bash
cd server
npm install
cp .env.example .env     # y completar
node --env-file=.env src/prueba.js   # probar las claves ANTES de nada
npm start
```

`src/prueba.js` crea un pedido de prueba de mil guaraníes que caduca en una
hora. Separa dos preguntas que de otro modo se mezclan: *¿están bien mis
claves?* y *¿está bien armado el pedido?*. Sin eso, un "token no corresponde"
puede ser la clave mal copiada, el ambiente equivocado o el comercio sin
habilitar, y no hay forma de saber cuál.

Después, en el panel de PagoPar, la **URL de respuesta** apunta a
`https://tu-dominio/pagopar/webhook`.

## Desplegar en la VPS

Tres cosas y ninguna es opcional:

**1. Que no muera.** El servicio tiene que levantarse solo al reiniciar la
máquina y volver si se cae. Con Coolify eso ya viene; a mano, un servicio de
systemd:

```ini
# /etc/systemd/system/zentra-cobros.service
[Unit]
Description=Zentra — cobros con PagoPar
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/zentra-app/server
EnvironmentFile=/opt/zentra-app/server/.env
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5
User=zentra
# El .env tiene la clave privada y la service_role: que no lo lea cualquiera.
UMask=0077

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now zentra-cobros
sudo journalctl -u zentra-cobros -f     # los logs
```

**2. HTTPS por delante.** PagoPar tiene que poder llegar al webhook desde
internet, y por HTTPS. El server escucha en `127.0.0.1` a propósito: lo que se
expone es el proxy, no el proceso. Con Caddy alcanza con:

```
cobros.tudominio.com.py {
    reverse_proxy 127.0.0.1:8790
}
```

Con nginx, un `proxy_pass` al mismo lugar y el certificado con certbot.

**3. El `.env` con permisos cerrados.**

```bash
sudo chown root:root .env && sudo chmod 600 .env
```

Adentro están la clave privada de PagoPar —con la que se firman pedidos y se
falsifican avisos de pago— y la `service_role` de Supabase, que pasa por
encima de RLS. Son las dos llaves del negocio.

Para verificar que quedó bien:

```bash
curl https://cobros.tudominio.com.py/pagopar/health
```

Devuelve el ambiente y las claves enmascaradas. Si dice `FALTA SUPABASE_URL`
o las claves salen `(vacía)`, el `.env` no se está leyendo.

## La compra de Android

```
POST /play/verificar
Authorization: Bearer <access_token de Supabase>
{ "productId": "zentra_max_mensual", "purchaseToken": "<lo que devolvió Play>" }

→ { "ok": true, "plan": "max", "vence": "2026-11-15" }
```

Lo que hace, en orden, y el orden importa:

1. **Le pregunta a Google si la compra existe** (`purchases.subscriptionsv2.get`).
   Al `purchaseToken` que manda la app no se le cree: sale de un APK, y un APK
   se descompila y se parchea. Hasta acá no se toca la base, así que un token
   inventado no deja ni rastro.
2. **Reconoce la compra** (`acknowledge`) si Google dice que falta. Va **antes**
   de registrar el pago: una compra sin reconocer en tres días Google se la
   reembolsa sola al cliente y la plata se pierde sin que nadie se entere. Si
   después falla la base, la app reintenta y Google ya la va a dar por
   reconocida; al revés, la plata se iría con el plan activo.
3. **Crea el cobro y registra el pago** con el monto de `zentra.planes`.

El `purchaseToken` es la referencia y el hash a la vez: es el único
identificador que hay. Mandar dos veces el mismo no activa dos veces, y eso lo
garantiza la clave única `(pasarela, referencia)` de `zentra.pagos`, no el
código de acá.

Las credenciales van por entorno (`PLAY_SERVICE_ACCOUNT_EMAIL`,
`PLAY_SERVICE_ACCOUNT_KEY`, `PLAY_PACKAGE_NAME`). Si falta algo, el endpoint
contesta error y **no activa nada**: un camino de pago que "funciona" sin poder
verificar es peor que uno apagado. `GET /play/health` lo dice sin mostrar la
clave.

El JWT RS256 contra `oauth2.googleapis.com` se firma a mano con `node:crypto`
—veinte líneas— en vez de traer `googleapis`: este proceso tiene adentro la
`service_role` de Supabase y cada dependencia que se agrega hay que seguirla
por parches de seguridad para siempre. El access token se guarda hasta un
minuto antes de vencer; no se pide uno por compra.

## Las dos reglas que lo hacen seguro

**El monto sale de `zentra.planes`, nunca del cuerpo del pedido.** Si lo
mandara el navegador, cualquiera abre las herramientas de desarrollo y se
compra un mes de Max por mil guaraníes.

**La empresa sale del token de sesión, nunca del cuerpo.** Si no, se podría
crear un cobro a nombre de otro.

## Detalles que cuestan de encontrar

- La referencia se guarda **antes** de hablar con PagoPar. Si la llamada se
  corta, queda un cobro pendiente sin hash y no pasa nada; al revés, un corte
  dejaría plata entrando sin saber de quién es.
- Al aviso hay que devolverle **el mismo `resultado` que mandó**, con 200. Si
  no, reintenta cada 10 minutos para siempre.
- Ante un error nuestro se contesta **500 a propósito**, para que reintente: el
  pago ya se hizo y no se puede perder.
- Una reversión (`pagado: false` sobre un pedido ya pago) **no quita el mes**.
  Sacarle el acceso a alguien desde un webhook es demasiado grande para
  automatizarlo: queda en el log.
- Tocar "Pagar" dos veces no abre dos pedidos: se reutiliza el pendiente de las
  últimas 48 horas.

## `src/pagopar.js`

Viene de `tienda-aguara-vulka` y se copió tal cual. Tiene adentro cosas que no
se deducen de la documentación: que `respuesta` a veces llega como el texto
`"false"`, que `resultado` a veces llega como string JSON, que una clave pegada
del panel puede traer un BOM invisible, y la forma exacta en que PHP escribe el
monto dentro de la firma. Si se arregla algo ahí, conviene llevarlo también a
la otra repo.

```bash
npm test          # todo
npm run test:play # sólo Android: un Google de mentira y el circuito entero
```

`test-play.mjs` existe porque este camino no se puede probar a mano sin pagar:
una compra de Play de verdad pasa por Play Console, un probador autorizado y un
APK firmado. Levanta un Google y un Supabase locales —con una clave RSA
generada en el momento, nunca una de verdad— y recorre lo que, cuando está mal,
se nota meses después y en la plata.

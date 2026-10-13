# Server de cobros

Node chico que corre en la VPS y cobra las suscripciones con PagoPar. Mismo
molde que el de `tienda-aguara-vulka`: Express bajo `/pagopar`, el `.env` en la
VPS, Supabase como base.

```
POST /pagopar/crear-cobro   la persona quiere pagar → devuelve a dónde ir
POST /pagopar/webhook       PagoPar avisa que pagó  → empuja el vencimiento
GET  /pagopar/health        ver si está todo configurado
```

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
npm test     # las cuentas finas: firma del pedido, token del aviso, el monto
```

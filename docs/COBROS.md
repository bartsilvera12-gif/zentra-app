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
| `server/` | El server de la VPS: crea el pedido y recibe el aviso |

`cobros` existe por una razón concreta: el aviso de pago trae el `hash_pedido`
de Pagopar y nada más. **La relación entre ese hash y la empresa hay que
guardarla antes de mandar a la persona a pagar**, o cuando entre la plata no se
va a saber de quién es.

## El recorrido de un pago

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

## Lo que no hace sola

**Una reversión no quita el mes.** Llega como `pagado: false` sobre un pedido
que ya estaba pago. Sacarle el acceso a alguien de golpe, desde un webhook, es
una decisión demasiado grande para automatizarla: queda en el log y se resuelve
a mano.

**No cobra sola.** Quien cobra es Pagopar. Esto sólo escucha.

## Preguntas abiertas con Pagopar

Antes de automatizar el alta hace falta confirmar dos cosas:

1. **El link de suscripción, ¿debita solo de una tarjeta catastrada, o genera un
   pedido cada período que el cliente paga con el medio que quiera?** Cambia
   qué se le puede ofrecer al cliente: con débito automático es sólo tarjeta;
   si genera un pedido, entra también el QR.
2. **¿Se puede pasar una referencia propia por cliente en el link de
   suscripción?** Si no se puede, hace falta un link por empresa, que con pocos
   clientes se banca y con muchos no.

## Por qué el cobro no está adentro de la app

Vender una suscripción dentro de una app Android, cobrando a usuarios de
Paraguay, choca con la política de pagos de Google Play. La apertura a cobros
externos de 2026 llega a Estados Unidos, Reino Unido y el EEE; Paraguay no está.

Por eso la app **informa** —"tu plan vence el 13/11"— y no lleva botón de pagar.
El cobro vive en una página web, fuera de la app.

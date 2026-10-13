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
| `supabase/functions/pagopar-callback` | Recibe el aviso de Pagopar |

`cobros` existe por una razón concreta: el aviso de pago trae el `hash_pedido`
de Pagopar y nada más. **La relación entre ese hash y la empresa hay que
guardarla antes de mandar a la persona a pagar**, o cuando entre la plata no se
va a saber de quién es.

## El recorrido de un pago

1. Se crea el cobro en `zentra.cobros` con la empresa, el plan y el monto.
2. Se crea el pedido en Pagopar (`iniciar-transaccion`), que devuelve un hash.
   **Ese hash se guarda en el cobro.**
3. La persona paga, por el medio que sea.
4. Pagopar le pega a la Edge Function.
5. La función verifica la firma, y `registrar_pago_pasarela` inserta el pago y
   empuja `vence`.
6. La app, al entrar, lee el `vence` nuevo.

El paso 2 todavía no está escrito: hoy el cobro se carga a mano. Con uno o dos
clientes alcanza, y permite cobrar sin esperar a tener todo automatizado.

## Desplegar la función

```bash
supabase secrets set PAGOPAR_PRIVATE_KEY=...
supabase functions deploy pagopar-callback --no-verify-jwt
```

`--no-verify-jwt` es necesario: quien llama es Pagopar, que no tiene sesión de
Supabase. Lo que autentica el pedido es la firma SHA1, que se verifica antes de
leer nada del contenido.

La URL que sale del deploy es la que va en **Integrar con mi sitio web → URL de
respuesta** en el panel de Pagopar.

**La clave privada no sale de ahí.** Con ella se pueden firmar pedidos y
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

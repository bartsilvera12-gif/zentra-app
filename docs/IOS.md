# iOS: qué hace falta, y qué conviene empezar ya

El código de la app ya sirve para iOS: es el mismo que corre en Android. Lo que
falta no es código, es **cuenta, máquina y firma** — y una de esas tres tarda
semanas, así que conviene arrancarla antes que el resto.

## Lo que no se puede evitar

| Qué | Costo | Cuánto tarda |
|---|---|---|
| Apple Developer Program | ~99 USD al año | horas a días |
| D-U-N-S, si la cuenta va a nombre de una empresa | gratis | **días a semanas** |
| Una Mac, o un runner macOS en CI | depende | — |

**El D-U-N-S es el que muerde.** Para publicar como *Neura* y no como una
persona física, Apple pide ese número, que lo da Dun & Bradstreet, no Apple. Es
gratis pero tiene su propio trámite, y en Paraguay no es inmediato. Si la cuenta
va a nombre de una persona, no hace falta — pero entonces en la ficha de la App
Store figura esa persona, no la empresa.

**Empezá por ahí, hoy.** Todo lo demás son horas de trabajo; esto es esperar.

## Lo que cambia en el código: nada

- El HTTP nativo que evita el CORS funciona igual en iOS.
- El origen del WebView en iOS es `capacitor://localhost`, y ya está en la lista
  del parche de CORS por si alguna vez se usa la versión web.
- Las notificaciones sí piden otra configuración: Firebase necesita una **app iOS
  aparte** (su `GoogleService-Info.plist`, el equivalente del
  `google-services.json` de Android) y una **clave APNs** de Apple subida a
  Firebase. Sin eso la app compila y anda, pero no llega ningún aviso.

## El orden que conviene

1. **Hoy**: pedir el D-U-N-S si la cuenta va a nombre de la empresa.
2. **Mientras llega**: seguir probando en Android. Es gratis, es inmediato, y
   todo lo que se arregle ahí ya queda arreglado para iOS.
3. **Cuando esté la cuenta**: generar la carpeta `ios/` con Capacitor, crear la
   app iOS en Firebase y subir la clave APNs.
4. **Para que lo prueben otros**: TestFlight. Es de Apple, soporta hasta 10.000
   probadores y no pasa por la revisión completa de la App Store.
5. **Recién al final**: mandar a revisión.

## Por qué no armo el workflow de iOS todavía

Lo puedo escribir en una tarde, pero **no se puede probar sin la cuenta**: un
build de iOS sin certificado ni perfil de aprovisionamiento falla en el paso de
firma. Un workflow que nunca corrió en verde no es una entrega, es una promesa
—y la primera vez que lo corras vas a estar peleando con dos cosas a la vez, la
firma y el workflow.

Cuando tengas la cuenta, lo armo y lo dejo andando de una.

## Un aviso sobre la revisión de App Store

La guía **4.2** rechaza apps que son "un sitio web envuelto". Por eso esta app
lleva el código **adentro** del paquete y no apunta a una URL remota — está
explicado en [`ACTUALIZACIONES.md`](ACTUALIZACIONES.md). No lo cambies para iOS:
es justo lo que evita ese rechazo.

Y van a pedir **una cuenta de prueba que funcione**. Un revisor que no puede
entrar rechaza la app sin mirar nada más. Hay que tener lista una empresa de
demostración con datos, no un ERP real de un cliente.

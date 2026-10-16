# Avisos push en iOS

Qué hace falta y en qué orden. Lo del código ya está; lo que queda son los
pasos que entran con la cuenta de Apple y la de Firebase.

## Lo que ya está

- El entitlement `aps-environment`, y la capability de Push en el App ID. Xcode
  la agregó solo al firmar con la cuenta puesta.
- Firebase Messaging como dependencia, con las versiones fijadas en
  `Package.resolved`.
- `Push.swift`, que arranca Firebase, recibe el token de Apple y lo cambia por
  el de Firebase.
- El registro enganchado al interruptor de Configuración. El permiso se pide
  ahí y no al arrancar: iOS da **un solo** diálogo.

## Lo que falta

1. **Subir el `.p8` de APNs a Firebase.** Consola de Firebase → Configuración
   del proyecto → Cloud Messaging → la app de iOS → subir la clave, con su
   Key ID y el Team ID (`N9KK3T6RKB`).

   La misma clave sirve para desarrollo y para producción: APNs las distingue
   por el entitlement del build, no por la clave.

2. **Bajar `GoogleService-Info.plist`** de esa misma pantalla y ponerlo en
   `ios-nativo/ZentraMovil/Recursos/`.

   No se versiona, igual que `Secretos.plist`. Sin él, `Push.arrancar()` no
   hace nada y la app sigue andando sin avisos — que es mejor que no arrancar.

## Cómo probarlo

Primero con cable, que valida el entorno de **desarrollo** de APNs:

- Entrar a Configuración y prender "Avisos push". Ahí se pide el permiso.
- En el log del teléfono tiene que aparecer el token de Firebase y, enseguida,
  el POST a `/cc/agent/device-token`.
- Mandar un aviso de prueba desde la consola de Firebase.

Después, **otra vez desde TestFlight**. No es por las dudas: un build de Xcode
usa el APNs de desarrollo y uno de TestFlight el de producción. Son dos
servidores distintos de Apple y un token de uno no sirve en el otro, así que la
prueba con cable **no demuestra** que ande en TestFlight.

## Si no llegan los avisos

El ERP manda por `agent_id`. Un usuario que no está dado de alta como agente de
conversaciones no tiene uno, así que no le va a llegar nada por más que el
interruptor esté prendido, el permiso dado y el token guardado. La app lo avisa
en la pantalla de Conversaciones.

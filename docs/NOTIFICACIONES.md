# Notificaciones push

Cómo le llegan los avisos al celular: qué hay hecho, qué falta y qué tiene que
hacer vos una sola vez.

---

## Qué usa

**Firebase Cloud Messaging (FCM)**, de Google. Es el único camino para mandarle un
aviso a un Android, y también sirve para iOS (Firebase habla con Apple por detrás).

Esto **no cambia la base de datos**: los datos y el login siguen en Supabase.
Firebase se usa sólo para el aviso. Son dos cosas distintas que no se pisan.

## El proyecto de Firebase

Ya está creado: **`zentra-app-android`** (número de proyecto `309397491560`), con la
app Android registrada como `py.com.zentra.movil` — el mismo identificador que usa
Capacitor, así que coincide.

Es un proyecto propio de Zentra Móvil, separado del que usa el ERP. Está bien que
sea así: la app se vende a varios clientes, y mezclarla con el ERP de uno de ellos
ataría el producto a ese cliente.

### El archivo de configuración

`android/app/google-services.json` **sí se versiona**, aunque el resto de `android/`
no. No se regenera: se descarga de la consola de Firebase, y si se pierde la app
deja de recibir avisos. El `.gitignore` tiene la excepción justa para ese archivo
(y para el `GoogleService-Info.plist` de iOS, cuando llegue).

No es secreto. Google lo documenta como información de cliente: lo que protege la
base son las reglas del servidor, igual que con la clave pública de Supabase.

## Cómo funciona en la app

```
el teléfono                       la base                   el servidor que envía
-----------                       -------                   ---------------------
pide permiso al sistema
Firebase le da un token  ──────►  zentra.dispositivos
                                  (token, usuario, empresa)
                                                    ◄──────  lee los tokens
                                                             y le pide a FCM
            ◄──────────────────────────────────────────────  que mande el aviso
```

El token identifica al **teléfono**, no a la persona: cambia si reinstalan la app o
limpian los datos, y el mismo teléfono puede pasar de un empleado a otro. De ahí
las tres reglas que sostienen esto:

- **El token es la clave primaria.** Un teléfono, una fila. Si cambia de dueño, la
  fila se reasigna; dos filas con el mismo token harían llegar el aviso dos veces,
  o a quien ya no usa ese teléfono.
- **Se vuelve a guardar en cada entrada.** No se asume que el de ayer siga sirviendo.
- **Al cerrar sesión se da de baja.** Si no, el próximo que entre en ese teléfono
  recibiría los avisos del anterior.

La política de RLS es más estricta que la del resto de las tablas: cada uno ve y
da de baja únicamente sus propios dispositivos. Ni siquiera un compañero de empresa
puede dar de baja el teléfono de otro ni redirigirle los avisos.

Y el **alta no la hace la app**: va por `zentra.registrar_dispositivo(token,
plataforma)`. La app pasa sólo esos dos datos, y de quién es la fila lo decide el
servidor con la sesión. Son dos razones:

- Si la app escribiera la fila, podría poner el id de otro usuario y robarle los
  avisos. Con la función eso no se puede ni intentar: `insert` está revocado.
- Reasignar un teléfono que era de otro empleado exige tocar una fila que todavía
  es de él, y ninguna política que valga la pena permite eso desde el cliente.

### El switch de Configuración

**Configuración → Notificaciones → Avisos push** ya no es un adorno:

- Prenderlo pide el permiso al sistema y guarda el token.
- Apagarlo **borra** el token. Si sólo cambiara el switch, el servidor seguiría
  mandando avisos que el teléfono mostraría igual.
- Si lo rechazan, el sistema no vuelve a preguntar nunca: la app avisa que hay que
  habilitarlo en los ajustes del teléfono.
- Arranca **apagado**. Mostrarlo encendido sin haber pedido permiso sería mentir.
- La preferencia se guarda en el dispositivo, así que no hay que activarlo en cada
  arranque.

En el navegador no hay plugin nativo: el switch se deja mover para poder probar la
pantalla, pero avisa que sin la app instalada no llega nada.

### Tocar el aviso abre la pantalla

Si el aviso trae `data.pantalla`, la app salta ahí. Hay una lista blanca de
pantallas permitidas: lo que manda el servidor no decide a dónde ir por sí solo, y
nunca puede llevar a la pantalla de login.

## Lo que está hecho

| | |
|---|---|
| Plugin de Capacitor | `@capacitor/push-notifications` instalado |
| Permiso, token y registro | `src/lib/push/index.ts` |
| Tabla y permisos | `supabase/05_dispositivos.sql` |
| Puerto de datos | `dispositivos` en `src/lib/repo/ports.ts`, con las tres implementaciones |
| Switch real en Configuración | `src/mobile/screens/ConfigScreen.tsx` |
| Baja al cerrar sesión | ídem |
| Re-registro en cada entrada | `src/mobile/screens/LoginScreen.tsx` |
| Salto de pantalla al tocar | `src/store/AppContext.tsx` |
| `google-services.json` versionado | `android/app/` |

## Lo que falta

### 1. Correr el SQL (dos minutos, lo hacés vos)

`supabase/05_dispositivos.sql` en el SQL Editor. Sin eso, activar los avisos falla
con "no existe la tabla dispositivos".

### 2. El servidor que manda los avisos

Hoy nada dispara avisos: la app sabe recibirlos, pero no hay quién los mande. Hace
falta algo con la clave de servicio de Firebase que lea los tokens y le pida a FCM
que entregue. **El ERP ya lo tiene resuelto** (`src/lib/cc/firebase-admin.ts` y su
despachador por cron): conviene reusar ese código en vez de rehacerlo.

Esa pieza **no puede vivir en la app**: la clave privada de Firebase no puede
viajar en un APK, que se descompila. Va en el servidor.

Para leer los tokens está `zentra.tokens_de_empresa(empresa)`, que a propósito no
tiene permiso para `authenticated`: es para el backend de envío, no para la app. Un
vendedor no necesita la lista de teléfonos de sus compañeros.

### 3. Los otros tres switches

"Stock bajo", "Resumen diario" y "Sonido y vibración" siguen siendo locales. Son
decisiones del lado del que envía —a quién le toca qué aviso—, así que se conectan
cuando exista el despachador del punto 2.

### 4. iOS

Cuando se sume iOS hay tres pasos más, todos en la consola de Apple y de Firebase:

- Registrar la app iOS en el proyecto `zentra-app-android` y bajar el
  `GoogleService-Info.plist` a `ios/App/App/`.
- Subir a Firebase la clave de APNs (se genera en la cuenta de Apple Developer).
  Sin eso FCM no puede entregarle a un iPhone.
- Habilitar la capacidad *Push Notifications* en Xcode.

El código de la app no cambia: el plugin es el mismo para las dos plataformas.

## Si no llegan los avisos

**Primero mirá el APK, no la base de datos.** Es la causa más común, la más
silenciosa y la que ya nos costó dos días de buscar en el lugar equivocado.

### 0. El APK se compiló sin Firebase

```
git ls-files android/app/google-services.json
```

Si no imprime nada, el archivo no está en el repo y **ningún APK compilado
desde ese commit recibe notificaciones**. Recuperalo:

```
git checkout 760579c^ -- android/app/google-services.json
git add android/app/google-services.json && git commit
```

Por qué no se nota: el `android/app/build.gradle` que genera Capacitor hace

```gradle
def servicesJSON = file('google-services.json')
if (servicesJSON.text) { apply plugin: 'com.google.gms.google-services' }
```

y cuando no lo encuentra lo dice con `logger.info`, que en una corrida normal
de Gradle no se imprime. El APK compila, instala y anda en todo lo demás. Lo
único que no hace es recibir avisos, y nada lo avisa — ni Gradle, ni el APK, ni
la app.

Pasó de verdad: un commit sobre los íconos (`760579c`) borró ese archivo sin
mencionarlo en el mensaje, y la fábrica siguió publicando APKs sin
notificaciones. Ahora hay tres guardas para que no vuelva a pasar en silencio:

- `npm run android:init` **corta** si falta el archivo, y también si el archivo
  es de otra app (compara el `package_name` con el `applicationId` del APK).
  Para un APK sin avisos a propósito: `SIN_PUSH=1 npm run apk`.
- La fábrica verifica que el plugin de Google haya corrido de verdad, mirando el
  recurso que genera él mismo.
- Si el token no llega, el mensaje que muestra la app nombra esta causa.

Después, por orden de probabilidad:

1. **No se corrió `05_dispositivos.sql`.** Activar el switch tira error.
2. **El `google-services.json` es de otro proyecto.** El `package_name` de
   adentro tiene que ser exactamente `py.com.zentra.movil`. `android:init` ya lo
   verifica, pero un APK viejo puede tener el equivocado.
3. **Falta el permiso.** Desde Android 13 hay que pedirlo y la persona puede
   rechazarlo; el sistema no vuelve a preguntar.
4. **El teléfono no tiene Google Play Services** (algunos Huawei). FCM no funciona
   ahí, y el error aparece como `registrationError`.
5. **El token murió.** FCM no avisa cuando un token deja de servir, sólo falla al
   enviarle. La columna `visto` dice cuál fue el último arranque que lo confirmó:
   los que no vuelven hace semanas se pueden borrar.

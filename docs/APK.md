# Compilar el APK

Pasos para tener la app instalada en un celular de verdad, y los dos errores que
se cometen siempre.

---

## Antes de empezar

Hace falta **Android Studio** instalado (trae el SDK y Gradle), y en el repo:

```bash
npm install
```

Capacitor ya está configurado en `capacitor.config.ts` — `appId` es
`py.com.zentra.movil`, el mismo `package_name` que trae el `google-services.json`
de Firebase. **No corras `npx cap init` de nuevo**: sobreescribiría eso.

## Después de cada `git pull`: `npm install`

Bajar el código no instala nada. Si alguien agregó un paquete, el build muere con
**"module not found"** y un rastro de webpack que no menciona npm por ningún
lado: uno va a mirar el `import`, que está bien.

`npm run android:init` ahora lo verifica antes de empezar y dice qué falta.

## Dos errores de Android Studio, y por qué vuelven

Los dos pasan porque `android:init` **borra y regenera `android/`** en cada
corrida. Lo que Android Studio había configurado ahí se va con la carpeta.

**"SDK location not found"** → falta `android/local.properties`, que es donde
Gradle lee la ruta del SDK. Ahora `android:init` lo escribe solo: busca el SDK
en los lugares de siempre según el sistema, y si no lo encuentra avisa qué
poner. No se versiona porque la ruta cambia en cada máquina.

En Windows va con **barras dobles** (`C:\\Users\\...`): en un `.properties`
la barra simple es un escape, así que la ruta queda partida y el error no
menciona las barras por ningún lado.

**"Invalid Gradle JDK configuration"** → hacé clic en *Use Embedded JDK*, el
link que ofrece el propio error. El JDK que viene con Android Studio es el
correcto; no instales otro.

## El error que compila bien y sale mal

`npm run android:init` **vuelve a correr `npm run build` por dentro** —tiene
que, porque el proyecto nativo copia lo que haya en `out/`—. Si en ese segundo
build las variables no están, pisa el primero con uno de datos de ejemplo.

El APK compila igual, sin un solo error, y sale con datos falsos.

Pasó en el workflow: las variables estaban puestas en el paso del build web y no
en el del `android:init`. Ahora van a nivel del job, y hay dos verificaciones:
una mira `out/` y la otra abre el `.apk` y busca adentro. La segunda es la que
importa, porque es lo que realmente se instala.

## 1. Las variables, ANTES de compilar

Copiá `.env.example` a `.env.local` y completá:

```
NEXT_PUBLIC_BACKEND=supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_SOPORTE_WHATSAPP=595981000450
```

> **Éste es el error que se comete siempre.** Next mete estas variables **adentro**
> del JavaScript al compilar: no se leen cuando la app arranca. Si compilás con
> `.env.local` vacío o en `mock`, el APK queda con datos de ejemplo para siempre y
> no hay forma de arreglarlo sin recompilar. Mismo problema en Coolify, donde van
> como *build args* y no como variables de runtime (ver [`DEPLOY.md`](DEPLOY.md)).

Antes de compilar, verificá que todo esté en su lugar:

```bash
npm run check
```

Revisa el `.env.local`, que Supabase responda, que el schema `zentra` esté
expuesto, que la clave sirva, y —lo más importante— que **sin sesión no se pueda
leer nada**. Dos segundos acá ahorran compilar un APK para descubrir que faltaba
un script.

Las tablas y las funciones no se pueden ver desde afuera, y así tiene que ser: el
rol anónimo no tiene permiso sobre ninguna tabla. Para revisarlas, pasale una
cuenta de prueba de ese proyecto:

```bash
npm run check -- tu@correo.com tuContraseña
```

Entra, verifica el perfil, las doce tablas y las dos funciones del servidor, y no
escribe nada. La contraseña va por la línea de comandos y nunca en `.env.local`,
para que no termine horneada dentro del APK.

No da por bueno lo que no pudo comprobar: si contesta un proxy o un portal de
wifi en el medio, lo dice en vez de aprobar.

Y después de compilar, para confirmar que las variables se hornearon:

```bash
grep -c "supabase.co" out/_next/static/chunks/*.js | grep -v ":0" | head
```

Si no aparece nada, la URL no quedó adentro: revisá `.env.local` y volvé a compilar.

## 2. Generar el proyecto Android

La primera vez, en cada máquina:

```bash
npm run android:init
```

Compila la web y genera `android/`. **No corras `npx cap add android` a secas**:
falla, porque la carpeta ya existe en el repo con un archivo adentro.

Ese archivo es `android/app/google-services.json`, la configuración de Firebase:
`android/` no se versiona —se regenera— pero éste sí, porque no se regenera, se
baja de la consola. `android:init` lo guarda antes de borrar la carpeta y lo
devuelve después. La copia va a un archivo, no a memoria, así que si el comando
se corta a la mitad la configuración no se pierde.

El Gradle que genera Capacitor ya se ocupa del resto: detecta el
`google-services.json` y aplica solo el plugin de Firebase. No hay que editar
nada a mano.

## 3. Compilar

```bash
npm run android     # build + cap sync + abre Android Studio
```

(La primera vez `android:init` ya dejó todo listo; esto es para las siguientes.)

En Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**. El archivo
sale en `android/app/build/outputs/apk/debug/app-debug.apk`. Se pasa al celular y
se instala (hay que permitir "orígenes desconocidos").

Para las tiendas se compila un **AAB** firmado en vez de un APK de depuración, pero
eso es más adelante.

### Después de cada cambio

```bash
npm run sync        # build + cap sync
```

`cap sync` copia el `out/` nuevo al proyecto nativo y registra los plugins. Si te
olvidás, Android Studio compila la versión anterior y parece que el cambio no hizo
nada.

## 4. Qué probar

En este orden, porque cada paso depende del anterior:

1. **Crear una cuenta.** Si falla con "schema no encontrado", falta exponer
   `zentra` en Supabase (Settings → API → Exposed schemas).
2. **Cerrar y volver a entrar.** Prueba que la sesión persiste.
3. **Cargar un cliente y un producto.** Prueba la escritura y el RLS.
4. **Hacer una venta.** Es el flujo más largo: numeración, IVA contenido y
   descuento de stock en un solo acto.
5. **Activar las notificaciones** en Configuración. Android va a pedir permiso. Si
   el switch vuelve a apagarse solo, mirá [`NOTIFICACIONES.md`](NOTIFICACIONES.md).
6. **Borrar la cuenta**, al final, porque es irreversible.

Lo que **no** va a funcionar todavía, y es esperado: Conversaciones y Reportes
(falta la agregación del lado del servidor), y los avisos push no van a llegar
porque todavía no hay quién los dispare.

## Si la app abre en blanco

Casi siempre es `webDir`. Confirmá que `npm run build` dejó un `out/index.html`:

```bash
ls out/index.html
```

Si está y la pantalla sigue en blanco, conectá el celular y abrí
`chrome://inspect` en Chrome de la computadora: el WebView aparece ahí con su
consola, y el error de JavaScript se ve igual que en el navegador.

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
expuesto, que estén las doce tablas y las dos funciones del servidor, y que el RLS
esté activo. Dos segundos acá ahorran compilar un APK para descubrir que faltaba
un script.

No da por bueno lo que no pudo comprobar: si contesta un proxy o un portal de
wifi en el medio, lo dice en vez de aprobar.

Y después de compilar, para confirmar que las variables se hornearon:

```bash
grep -c "supabase.co" out/_next/static/chunks/*.js | grep -v ":0" | head
```

Si no aparece nada, la URL no quedó adentro: revisá `.env.local` y volvé a compilar.

## 2. Generar el proyecto Android

La primera vez:

```bash
npm run build
npx cap add android
```

`android/` no se versiona, así que esto hay que correrlo en cada máquina nueva. La
excepción es `android/app/google-services.json`, que sí está en el repo: `cap add`
no lo toca, y sin él no hay notificaciones.

## 3. Compilar

```bash
npm run android     # build + cap sync + abre Android Studio
```

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

# Deploy en Coolify

La app se compila a archivos estáticos, así que la imagen final es nginx sirviendo
HTML y JavaScript. **No levanta ningún proceso Node**: consume muy poco en el
servidor, bastante menos que un Next.js corriendo.

## Lo que más fácil sale mal

Next compila las variables de entorno **adentro** del bundle, no las lee al
arrancar. Por eso en Coolify hay que cargarlas como **variables de build**, no
sólo de runtime.

Si las cargás únicamente como runtime, el deploy no falla: simplemente la app
arranca con los datos de ejemplo y parece que la base no funciona.

## Pasos

1. En Coolify: **New Resource → Application → Private Repository (GitHub App)**
2. Repositorio `bartsilvera12-gif/zentra-app`, rama `main`
3. **Build Pack: Dockerfile** (el `Dockerfile` ya está en la raíz)
4. **Port: 80**
5. En **Environment Variables**, cargá estas y marcalas como disponibles en build:

```
NEXT_PUBLIC_BACKEND=supabase
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Opcionales:

```
NEXT_PUBLIC_DIRECTORIO_URL=https://...     # resolver el código de empresa
NEXT_PUBLIC_SOPORTE_WHATSAPP=595981000450  # enlace de soporte en el login
```

6. Deploy

## Después del primer deploy

En Supabase: **Authentication → URL Configuration** → agregá tu dominio en
*Site URL* y en *Redirect URLs*. Sin eso el enlace de recuperación de contraseña
no vuelve a la app.

## Cómo saber que tomó las variables

Abrí la app. Si debajo de *Entrar* aparece **"Crear una cuenta"**, está conectada a
Supabase. Si no aparece, el build salió con `NEXT_PUBLIC_BACKEND=mock`: las
variables no estaban disponibles en build.

## Qué hace la configuración de nginx

- Los archivos de `/_next/static/` se cachean para siempre: llevan un hash en el
  nombre, así que si cambia el contenido cambia el nombre.
- El HTML **no** se cachea. Es lo que apunta a los bundles nuevos; si se cachea,
  el navegador sigue cargando la versión vieja después de cada deploy.
- Cualquier ruta desconocida abre la app en vez de dar 404. Es a propósito: la app
  es una sola página y el enlace de recuperación puede volver a una ruta que no
  existe como archivo.

## Verificado

El `nginx.conf` se probó con el build real dentro de un contenedor: la app
responde, los assets cargan, el gzip reduce los bundles a la mitad, las cabeceras
de caché son las correctas y cualquier ruta abre la app.

La imagen completa no se pudo construir de punta a punta en el entorno donde se
escribió (`npm ci` falla por un problema de npm en Docker anidado, no por el
Dockerfile). Si el build falla en Coolify, el log de `npm ci` es el primer lugar
donde mirar.

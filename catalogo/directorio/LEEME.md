# El directorio de empresas

Un archivo por código de empresa. La app busca `<DIRECTORIO_URL>/<CÓDIGO>` y lo
que encuentre ahí es la configuración de esa empresa.

**Agregar una empresa es agregar un archivo acá y publicar.** No hace falta una
versión nueva de la app: quien ya la tiene instalada escribe el código y entra.

El nombre del archivo es el código **en mayúsculas, sin espacios ni guiones**,
que es como la app lo normaliza antes de buscarlo (`ROSALINDA`, no
`rosalinda` ni `rosa-linda`). Sin extensión: la dirección que se le dicta al
cliente es el código, nada más.

```json
{
  "nombre": "Rosa Linda",
  "supabaseUrl": "https://api.neura.com.py",
  "anonKey": "__ANON__",
  "apiUrl": "https://rosalinda.neura.com.py",
  "chat": false
}
```

- `supabaseUrl` + `anonKey` — contra qué Supabase valida la contraseña. Para
  los ERP de la Supabase compartida, siempre los mismos; `__ANON__` lo
  reemplaza `armar.sh` y por eso la clave no entra al control de versiones.
- `apiUrl` — el ERP de esa empresa. Es lo que hace que la app le pida los datos
  ahí y no a la base de Zentra.
- `chat` — si ve Conversaciones. Por defecto no: tener ERP no significa atender
  WhatsApp, y el botón abriría una bandeja vacía. Sin chat, en ese lugar no va
  nada (Presupuestos no sirve con ERP propio: esa tabla vive en la base de
  Zentra).

## Lo que queda adentro de la app

`NEURA`, y sólo ése. Es la red de seguridad: si este sitio se cae, la gente de
Neura entra igual. Para los demás, un teléfono que ya entró alguna vez conserva
su copia guardada y sigue funcionando; lo único que no se podría durante una
caída es entrar por primera vez.

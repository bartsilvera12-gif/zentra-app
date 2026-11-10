# El directorio de empresas por red

El código de empresa del login (ROSALINDA, NEURA…) se busca en un archivo
público, no solo en la lista que viaja adentro de la app:

```
https://api.neura.com.py/storage/v1/object/public/zentra-directorio/empresas.json
```

Existe porque la lista del paquete obliga a sacar versión: la 1.0.5 no traía
ROSALINDA y los de Rosa Linda vieron «No encontramos ese código de empresa»
hasta que Apple aprobó la 1.0.6. Con el archivo, sumar o cambiar una empresa es
subir el archivo de nuevo.

Cómo se usa:

- Con `DIRECTORIO_URL` (iOS, `Secretos.plist`) o `NEXT_PUBLIC_DIRECTORIO_URL`
  (web y APK) configurado, **manda el archivo**. La lista del paquete
  (`DIRECTORIO_JSON`) queda de respaldo: se usa si no hay red o si el archivo
  no tiene ese código.
- Se pide sin caché, así una empresa recién subida se encuentra al momento.
- Las versiones que ya están en los teléfonos sin `DIRECTORIO_URL` (hasta la
  1.0.6 en iOS) siguen usando solo su lista. El archivo sirve desde la primera
  versión que salga con la URL.

## Sumar o cambiar una empresa

1. Bajá `empresas.json` del bucket `zentra-directorio` (Supabase Studio →
   Storage), o partí de la última copia.
2. Agregá la entrada con la misma forma que las otras:

   ```json
   "CODIGO": {
     "nombre": "Nombre que ve el usuario",
     "supabaseUrl": "https://api.neura.com.py",
     "anonKey": "la anon key de esa Supabase",
     "apiUrl": "https://dominio-del-erp",
     "chat": false
   }
   ```

   El código va en mayúsculas, sin espacios ni guiones. `chat: true` solo si la
   empresa atiende WhatsApp desde su ERP. Nunca una service key: el archivo es
   público.
3. Revisá que sea JSON válido (`python3 -m json.tool empresas.json`). Un archivo
   roto deja a todas las empresas usando la lista del paquete.
4. Subilo al bucket `zentra-directorio` con el mismo nombre, reemplazando el
   anterior.
5. Probalo abriendo la URL de arriba en el navegador.

## Crear el bucket (una sola vez)

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('zentra-directorio', 'zentra-directorio', true)
ON CONFLICT (id) DO UPDATE SET public = true;
```

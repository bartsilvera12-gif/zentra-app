# Probar todo, de punta a punta

Esto cubre la app **y** el código de empresa, con dos empresas de verdad. No hace
falta levantar ningún servicio ni tocar ningún ERP.

Lo que vas a terminar probando: que dos empresas distintas tienen sus datos
separados de verdad, que el código manda a cada una a su lugar, que las dos
sesiones no se pisan, y que todo eso sigue funcionando dentro del APK.

Calculá una hora la primera vez. Casi todo es esperar que Supabase cree proyectos.

---

## Antes de aclarar una confusión

**El código de empresa funciona.** Lo que no funciona —todavía— es apuntarlo al
Supabase de un ERP que ya está en producción, porque ahí las tablas tienen otra
forma. Eso está explicado en [`BACKEND.md`](BACKEND.md#conectar-la-app-a-un-erp-que-ya-existe).

Para probar el mecanismo no hace falta un ERP: hace falta **un segundo Supabase con
nuestro esquema**. Es exactamente el mismo camino que seguiría un cliente nuevo.

---

## 1. Dos proyectos de Supabase

Ya tenés uno (el público). Creá un segundo en supabase.com — llamalo como quieras,
por ejemplo `zentra-jm`.

En **los dos**, lo mismo que ya hiciste en el primero:

1. SQL Editor → correr `supabase/todo_en_uno.sql` (trae los cinco scripts).
2. Settings → API → **Exposed schemas** → agregar `zentra`.
3. Settings → API → copiar la **Project URL** y la **anon public** key.

> La anon key se puede poner en el `.env.local` y queda dentro del APK: es pública
> por diseño, lo que protege los datos es RLS. La **contraseña de la base** y la
> **service_role** key no van nunca en la app.

## 2. El directorio, en una línea

No hace falta servicio. En `.env.local`:

```
NEXT_PUBLIC_BACKEND=supabase

# instalación pública: quien no pone código
NEXT_PUBLIC_SUPABASE_URL=https://PUBLICO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...publico...

# el segundo proyecto, detrás del código JM
NEXT_PUBLIC_DIRECTORIO_JSON={"JM":{"nombre":"Distribuidora JM","supabaseUrl":"https://JM.supabase.co","anonKey":"eyJ...jm..."}}

NEXT_PUBLIC_SOPORTE_WHATSAPP=595981000450
```

Todo en una sola línea el JSON, sin saltos. Si queda mal escrito, la app no
arranca y te dice qué pasó — a propósito: un directorio roto en silencio significa
un vendedor que no puede entrar y nadie sabe por qué.

Cuando agregar empresas a mano moleste, se pasa a un archivo `.json` subido a
cualquier lado; ver `.env.example`. No hay que tocar código.

## 3. Probarlo en la computadora primero

Primero la verificación, que tarda dos segundos y evita la mitad de los dolores:

```bash
npm run check
```

Tiene que decir, de cada proyecto, que responde, que el schema está expuesto, que
están las doce tablas y las dos funciones, y que el RLS está activo. Si marca algo
en rojo, arreglalo antes de seguir. Si configuraste los dos proyectos, también te
avisa si quedaron apuntando al mismo — que es el error que hace parecer que el
aislamiento entre empresas no funciona.

```bash
npm run dev
```

Es más rápido que compilar el APK y los errores se ven en la consola del navegador.
Abrí `http://localhost:3000` y seguí **los dos caminos**:

### Camino A — empresa nueva (sin código)

1. Login → "¿Tu empresa ya tiene un ERP con nosotros?" → **No**.
2. **Crear una cuenta**. Poné un correo real; según la configuración de Supabase
   puede pedirte confirmarlo por mail.
3. Cargá **un cliente** y **un producto**.
4. Hacé **una venta** con ese cliente y ese producto. Es el flujo más largo:
   numeración, IVA contenido y descuento de stock en un solo acto.
5. Entrá a Inventario y confirmá que **el stock bajó** por la venta.

### Camino B — empresa con código

1. Cerrar sesión.
2. Login → **Sí** → código **JM**.
3. Crear una cuenta ahí también (es otro proyecto, otro usuario).
4. Cargá **otro** cliente, con un nombre bien distinto.

### Lo que tiene que pasar — esto es la prueba de verdad

- Entrás con **JM** y ves **sólo** el cliente del camino B.
- Volvés sin código y ves **sólo** el cliente del camino A.
- Si cerrás y reabrís, la pregunta ya viene contestada y el código precargado: se
  guarda en el dispositivo.
- Un código que no existe (probá `XXXX`) da un mensaje claro y **no** te deja
  entrar a ningún lado.

Si los dos caminos se mezclan, pará: o el `.env.local` apunta dos veces al mismo
proyecto, o falta el RLS en uno. No sigas al APK hasta que esto esté limpio.

## 4. Ahora sí, el APK

Mismo `.env.local`, y seguí [`APK.md`](APK.md). Repetí los dos caminos en el
celular, más lo que no se puede probar en la computadora:

- **Notificaciones**: Configuración → Avisos push. Android va a pedir permiso.
  El switch tiene que quedar prendido. Los avisos **no van a llegar** todavía —
  falta el servidor que los dispare, ver [`NOTIFICACIONES.md`](NOTIFICACIONES.md)—,
  pero que el switch quede prendido prueba que el token se guardó.
- **Sin señal**: poné el celular en modo avión y abrí la app. Tiene que abrir la
  pantalla de login igual (el código va adentro del paquete). Entrar no va a poder,
  porque los datos están en la nube.
- **Borrar la cuenta**: Configuración → Cuenta. Dejalo para el final, es
  irreversible. Hacelo en la cuenta del camino A y confirmá en Supabase que
  desaparecieron también su empresa y sus datos.

## Lo que no va a funcionar, y es esperado

- **Conversaciones** y **Reportes**: falta la agregación del lado del servidor.
- **La llegada** de los avisos push: falta quién los mande.
- **La consulta de RUC a la SET**: está simulada.
- **Apuntar a un ERP de producción**: ver `BACKEND.md`.

## Si algo falla

| Lo que ves | Qué es |
|---|---|
| "Falta exponer el schema `zentra`" | El paso 2 del punto 1, en ese proyecto |
| "Tu cuenta no tiene perfil en esta instalación" | Faltó correr `02_funciones.sql` (el alta automática la hace un disparador) |
| El código JM "no existe" | El JSON del `.env.local`; reiniciá `npm run dev` después de cambiarlo |
| Las dos empresas ven lo mismo | Las dos URLs del `.env.local` apuntan al mismo proyecto |
| En el APK aparecen datos de ejemplo | Compilaste sin `.env.local`; ver [`APK.md`](APK.md) |

Casi todo eso lo detecta `npm run check` antes de que te pase.

# Probar el código de empresa con dos empresas de verdad

Para ver el flujo completo —entrar sin código a una instalación y con código a
otra, cada una con sus datos— hacen falta **dos proyectos de Supabase**. Uno ya
lo tenés.

No sirve apuntar el código al Supabase de un ERP existente: ahí las tablas tienen
otra forma. Eso está explicado en
[`BACKEND.md`](BACKEND.md#conectar-la-app-a-un-erp-que-ya-existe).

Son unos quince minutos, casi todo esperando a que Supabase cree el proyecto.

---

## 1. El segundo proyecto

En supabase.com → **New project**. Llamalo como quieras, por ejemplo `zentra-jm`.
La región más cercana y el plan gratis alcanzan.

Cuando termine de crearse:

1. **SQL Editor** → pegar `supabase/todo_en_uno.sql` entero y ejecutar.
   Sin nada seleccionado en el editor, o corre sólo la selección y el script se
   parte al medio.
2. **Settings → API → Exposed schemas** → agregar `zentra`.
3. **Settings → API Keys** → copiar la **publishable** (`sb_publishable_…`) y la
   **Project URL**.

## 2. Cargarlo en el directorio

```bash
npm run empresa -- JM "Distribuidora JM" https://TU-SEGUNDO.supabase.co sb_publishable_...
```

Escribe la línea en `.env.local` por vos. Es un JSON en una sola línea dentro de
un archivo `.env`, y escribirlo a mano sale mal seguido: una comilla de más, un
espacio, un salto de línea.

Para ver lo que hay: `npm run empresa`. Para sacar uno: `npm run empresa -- JM --borrar`.

## 3. Comprobar antes de probar

```bash
npm run check
```

Ahora revisa **los dos** proyectos. Y avisa si quedaron apuntando al mismo, que
es el error que hace parecer que el aislamiento no funciona.

## 4. Los dos caminos

```bash
npm run dev
```

**Sin código** → crear una cuenta → cargar un cliente con un nombre reconocible,
por ejemplo "Cliente del público".

**Cerrar sesión.** En el login, tocar *Mi empresa ya tiene un ERP con nosotros* →
escribir `JM` → crear una cuenta ahí también (es otro proyecto, otro usuario) →
cargar un cliente llamado "Cliente de JM".

### Lo que tiene que pasar

- Con `JM` ves **sólo** el cliente de JM.
- Sin código ves **sólo** el del público.
- Al reabrir la app, el código viene precargado: se guarda en el dispositivo.
- Un código que no existe (probá `XXXX`) da un mensaje claro y no te deja entrar
  a ningún lado.
- Las dos sesiones no se pisan: cada instalación guarda la suya aparte.

Si los dos caminos muestran lo mismo, pará: o las dos URLs apuntan al mismo
proyecto —`npm run check` te lo dice— o falta el RLS en alguno.

## 5. En Coolify

El mismo valor, como variable de **build**. `npm run empresa` imprime la línea
lista para copiar al terminar.

## Cuando sean muchas empresas

Esto se hornea en el paquete, así que agregar una empresa pide recompilar. Con
dos o tres clientes está bien y no hay ningún servicio que se pueda caer. Cuando
moleste, se pasa a un archivo `.json` subido a cualquier lado: ver
`NEXT_PUBLIC_DIRECTORIO_URL` en `.env.example`. La app ya lo soporta, no hay que
tocar código.

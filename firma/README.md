# La llave con la que se firma el APK de pruebas

`debug.keystore` es la llave que firma los APK que salen de GitHub Actions.

## Por qué existe

Android identifica una app por su paquete **y por la llave que la firmó**. Si el
APK nuevo está firmado con otra llave, el sistema no lo deja instalar encima:
*"no se pudo instalar por un conflicto con un paquete existente"*.

Gradle, cuando no encuentra una llave de depuración, **genera una nueva**. En un
servidor de GitHub Actions esa carpeta arranca vacía en cada corrida, así que
cada APK salía firmado con una llave distinta y ninguno se podía instalar encima
del anterior. Había que desinstalar y volver a instalar en cada cambio.

Con esta llave guardada, todos los APK se firman igual y se actualizan solos.

## Lo que NO es

**No sirve para la Play Store.** Es una llave de depuración, con la contraseña
`android`, que es pública y está acá en el repositorio a propósito. Para
publicar hace falta una llave de release de verdad, que no se versiona nunca y
va en los secretos de GitHub: si se pierde, no se puede volver a publicar una
actualización de esa app jamás.

## Datos

    archivo      firma/debug.keystore
    tipo         PKCS12
    alias        androiddebugkey
    contraseña   android   (store y key)
    vence        2056

`scripts/android-init.mjs` la enchufa sola al proyecto de Android; no hay nada
que hacer a mano.

# Actualizaciones y tiendas

Cómo actualizar la app sin depender de la revisión de Google y Apple, qué permiten
realmente las tiendas, y cómo conviene organizar Android e iOS.

Investigado en octubre de 2026. Las políticas de las tiendas cambian: antes de
publicar, verificá las fuentes del final.

---

## El problema

Si el código va adentro del paquete, cada corrección exige recompilar y volver a
pasar por la tienda. Google tarda horas o días; Apple puede tardar más. Para un
producto que se vende, eso significa que un error de un viernes llega a los
clientes la semana siguiente.

Lo que buscamos: **actualizar en minutos, sin revisión, con un solo backend y un
solo código para Android e iOS.**

---

## Qué permiten las tiendas (y es mejor de lo que parece)

Las dos permiten explícitamente actualizar **código interpretado** —JavaScript,
HTML, CSS— sin pasar por revisión. Lo que prohíben es **código ejecutable nativo**.

**Apple.** El acuerdo de licencia (§3.3.1(B)) y la guía de revisión 2.5.2 permiten
descargar y ejecutar código interpretado siempre que: no cambie el propósito
principal de la app, no evada la firma ni el sandbox del sistema, y no arme una
tienda de otras apps o código. Actualizar HTML, CSS y JavaScript por aire es el
caso expresamente contemplado.

**Google.** La prohibición de cargar código dinámicamente **no aplica** al código
que corre en un intérprete o máquina virtual, como JavaScript en un WebView. Lo
dice la documentación de Android sobre *Dynamic Code Loading*.

O sea: **nuestra app es exactamente el caso permitido.** Está hecha de HTML, CSS y
JavaScript corriendo en el WebView del sistema.

### Dónde sí se pusieron duros

Las bajas recientes de Apple (Replit, Vibecode, y "Anything" retirada en marzo de
2026) fueron contra apps que **generan comportamiento ejecutable nuevo** desde el
servidor. No contra actualizaciones normales.

La línea es esa: actualizar la app que revisaron está bien; convertirla en otra
cosa, no.

---

## Las tres arquitecturas posibles

### A. Todo el código adentro del paquete

Lo que tenemos hoy. El HTML y el JavaScript viajan en el APK.

Anda sin señal, arranca rápido, se siente nativa. Pero cada cambio es recompilar y
pasar por revisión.

### B. El paquete apunta a una URL remota

**Es lo que hace tu ERP hoy**: `capacitor.config.ts` tiene
`server.url = distribuidorajm.neura.com.py/m/asesor`. El APK es un navegador
disfrazado.

Actualizás el servidor y todos los celulares ven el cambio al instante, sin tienda.
Pero:

- **Es la opción más riesgosa en App Store.** La guía 4.2 (*Minimum
  Functionality*) apunta justamente a apps que son un sitio web envuelto. Apple es
  bastante estricta con eso.
- No funciona sin señal. Un vendedor sin cobertura no abre ni la pantalla de login.
- Cada pantalla que abre el vendedor hace trabajar a tu servidor.

Sirvió para Android e interno. Para vender en App Store es por donde más fácil te
rebotan.

### C. Código adentro + actualizaciones por aire

El paquete lleva el código, y al abrirse la app chequea si hay una versión nueva y
la descarga sola. Si no hay señal, usa la que ya tiene.

- Actualizás en minutos, sin revisión.
- Sigue funcionando sin conexión.
- Es el caso que las dos tiendas permiten expresamente.

**Es la que conviene.**

---

## Recomendación

**Opción C**: lo que ya tenemos, más actualizaciones por aire cuando llegue el
momento de publicar.

Y un punto que vale subrayar: **la app que armamos es más segura frente a las
tiendas que la arquitectura del ERP.** Lleva el código adentro, funciona sin señal
y usa capacidades del dispositivo. Eso la saca del territorio de "sitio web
envuelto", que es donde Apple rechaza.

Si en algún momento se piensa en apuntar esta app a una URL remota como el ERP:
conviene no hacerlo para iOS.

---

## Con qué herramienta

**No construyas sobre Ionic Appflow**: cierra el 31 de diciembre de 2027.

La alternativa principal para Capacitor es **Capgo**: código abierto, se puede
auto-hospedar, y cubre actualizaciones por aire con reversión, actualizaciones
parciales y cifrado de punta a punta.

Precios según su sitio a julio de 2026: Solo 12 USD/mes (2.000 usuarios activos),
Maker 33 USD/mes (10.000), Team 83 USD/mes (100.000). Hay prueba de 14 días.
También existen Capawesome y OtaKit como competencia.

### ¿Auto-hospedarlo en Coolify?

Se puede: Capgo es abierto. Pero el servidor de actualizaciones pasa a ser **otra
cosa que mantener y que, si se cae, deja a todos los celulares sin poder
actualizar**. Con el VPS ya trabajando al límite con los ERPs, por 12 o 33 dólares
al mes conviene que lo opere otro.

Revisalo de nuevo si la app crece y el costo empieza a pesar.

---

## Un backend, un código, dos tiendas

La preocupación de no terminar con dos backends ya está resuelta por cómo está
armado:

- **Un backend**: Supabase. Android, iOS y la versión web le hablan al mismo.
- **Un código**: `src/`. Lo que compila es un solo paquete de HTML y JavaScript.
- **Dos envoltorios nativos**: las carpetas `android/` e `ios/` que genera
  Capacitor, con el mismo contenido adentro.

### No separes Android e iOS en repos distintos

Sería un error. Las carpetas `android/` e `ios/` **no son dos aplicaciones**: son
dos envoltorios del mismo código web. Separarlas obligaría a duplicar la app, y a
partir de ahí las dos versiones empiezan a divergir.

Lo correcto es un repositorio con las dos carpetas al lado:

```
zentra-app/
  src/        el código, uno solo
  android/    envoltorio Android   (lo genera Capacitor)
  ios/        envoltorio iOS       (lo genera Capacitor)
```

Es lo que hace tu ERP, y está bien.

### ¿Se versionan esas carpetas?

Hoy están en `.gitignore` porque se regeneran. Conviene empezar a versionarlas
cuando haga falta tocar cosas nativas: notificaciones push, íconos, permisos,
pantalla de carga. A partir de ahí, regenerarlas borraría esos cambios.

---

## Lo que las tiendas van a pedir igual

Esto no depende de las actualizaciones, pero si hay registro de usuarios es
obligatorio:

- **Borrado de cuenta desde la app.** Las dos tiendas lo exigen si se puede crear
  cuenta. Hoy no está implementado.
- **Política de privacidad** publicada, y el formulario de datos de Google Play.
- **Cuenta de prueba** para los revisores, con datos cargados: si abren la app y
  ven todo vacío, puede caer por 4.2.
- Cuenta de desarrollador: Apple cobra 99 USD al año; Google, 25 USD una vez.

---

## Decisiones pendientes

1. **¿iOS entra en el alcance?** Cambia el costo y el riesgo. Si es sólo Android al
   principio, se puede publicar antes y con menos fricción.
2. **¿Cuándo se suma Capgo?** No hace falta para desarrollar. Conviene montarlo
   antes de la primera publicación, no después.
3. **Borrado de cuenta**: hay que implementarlo antes de mandar a revisión.

---

## Fuentes

- [Guías de revisión de Apple](https://developer.apple.com/news/?id=ey6d8onl)
- [Por qué Apple rechaza por 2.5.2](https://ptkd.com/journal/guideline-2-5-2-downloading-scripts-without-review)
- [Qué permiten las tiendas con OTA — Bitrise](https://bitrise.io/blog/post/what-app-stores-allow-with-ota-updates-apple-and-google-policy-explained)
- [Dynamic Code Loading — Android](https://developer.android.com/privacy-and-security/risks/dynamic-code-loading)
- [¿Google permite live updates? — Capgo](https://capgo.app/blog/do-google-allow-live-updates/)
- [Cumplimiento con Apple — Capgo](https://capgo.app/blog/capacitor-live-updates-staying-compliant-with-apple/)
- [Precios de Capgo](https://capgo.app/pricing/)
- [Cierre de Appflow](https://capawesome.io/alternatives/ionic-appflow/)
- [Guía de OTA 2026 — OtaKit](https://www.otakit.app/blog/app-store-compliant-ota-updates)

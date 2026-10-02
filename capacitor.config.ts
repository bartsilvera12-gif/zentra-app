import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Configuración del envoltorio nativo.
 *
 * `appId` tiene que coincidir con el `package_name` de
 * `android/app/google-services.json`, o Firebase rechaza el registro y no llegan
 * las notificaciones.
 *
 * A propósito **no** hay `server.url`: el código viaja adentro del paquete. Eso
 * es lo que hace que la app funcione sin señal y lo que la saca del territorio de
 * "sitio web envuelto", que es donde App Store rechaza por 4.2. Ver
 * docs/ACTUALIZACIONES.md.
 */
const config: CapacitorConfig = {
  appId: "py.com.zentra.movil",
  appName: "Zentra Móvil",
  // Lo que genera `npm run build` con output: "export".
  webDir: "out",
  android: {
    // El WebView no necesita texto plano: todo sale por HTTPS a Supabase.
    allowMixedContent: false,
  },
  plugins: {
    PushNotifications: {
      // El aviso se muestra solo cuando la app está cerrada o en segundo plano.
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;

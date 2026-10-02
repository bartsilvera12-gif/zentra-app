import type { MetadataRoute } from "next";

/** Con `output: "export"` hay que decirlo explícitamente: el manifiesto es un archivo. */
export const dynamic = "force-static";

/**
 * Permite "Agregar a la pantalla de inicio": la app queda con su ícono y se abre
 * sin la barra del navegador, que es lo que la hace sentir una app y no una
 * página. Es también lo que activa `display-mode: standalone` en globals.css,
 * donde se saca el marco de maqueta.
 *
 * No reemplaza al APK —no hay notificaciones push ni funciona sin señal—, pero
 * sirve para probar en un celular de verdad sin compilar nada.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zentra Móvil",
    short_name: "Zentra",
    description: "Ventas, clientes, compras, inventario y reportes.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#023047",
    theme_color: "#023047",
    lang: "es-PY",
    icons: [
      { src: "/icono-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png" },
      // `maskable` deja que Android recorte el ícono a la forma del sistema sin
      // comerse la marca: por eso el ícono tiene margen alrededor.
      { src: "/icono-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

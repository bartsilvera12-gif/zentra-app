import React, { Fragment } from "react";

/**
 * Direcciones dentro del texto de un mensaje.
 *
 * Cubre `http://`, `https://` y los `www.` pelados, que es como suele pegarse un enlace.
 */
const PATRON_URL = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;

/** Signos que quedan pegados al final al escribir y NO son parte de la dirección. */
function recortarColaDeUrl(url: string): { url: string; sobra: string } {
  let fin = url.length;
  while (fin > 0 && /[.,;:!?]/.test(url[fin - 1])) fin--;
  while (fin > 0 && url[fin - 1] === ")" && !url.slice(0, fin - 1).includes("(")) fin--;
  return { url: url.slice(0, fin), sobra: url.slice(fin) };
}

/**
 * Texto de un mensaje con sus enlaces tocables.
 *
 * Antes se pintaba crudo: cuando un cliente mandaba su ubicación de Google Maps, había que
 * seleccionar el enlace a mano y pegarlo en el navegador.
 */
export default function TextoConEnlaces({ texto, color }: { texto: string; color?: string }) {
  const partes = texto.split(PATRON_URL);
  return (
    <>
      {partes.map((parte, i) => {
        PATRON_URL.lastIndex = 0;
        if (!PATRON_URL.test(parte)) {
          PATRON_URL.lastIndex = 0;
          return <Fragment key={i}>{parte}</Fragment>;
        }
        PATRON_URL.lastIndex = 0;
        const { url, sobra } = recortarColaDeUrl(parte);
        if (!url) return <Fragment key={i}>{parte}</Fragment>;
        const href = url.startsWith("www.") ? `https://${url}` : url;
        return (
          <Fragment key={i}>
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(e) => e.stopPropagation()}
              style={{ color: color ?? "inherit", textDecoration: "underline" }}
            >
              {url}
            </a>
            {sobra}
          </Fragment>
        );
      })}
    </>
  );
}

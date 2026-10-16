#!/bin/sh
# Regenera supabase/todo_en_uno.sql a partir de los archivos numerados.
# Correr desde la raíz del repo después de tocar cualquiera de ellos.
set -e
cd "$(dirname "$0")"
out=todo_en_uno.sql
{
  echo "-- ============================================================================="
  echo "-- Zentra Móvil · TODO EN UNO"
  echo "-- Equivale a correr todos los archivos numerados, en orden."
  echo "-- Generado automáticamente: no editar a mano, editar los archivos sueltos."
  echo "-- ============================================================================="
  echo
  # `0*.sql` dejaba afuera todo lo que pasara del 09. Ya había pasado: el
  # pegado único no traía `10_planes_lectura_publica.sql`, así que quien
  # instalaba con `todo_en_uno.sql` se quedaba sin la lista de precios y la
  # hoja de planes le mentía por omisión.
  # Hay archivos numerados que NO van en el instalador: `12_datos_demo.sql`
  # carga un comercio de mentira y, antes, borra las ventas y los productos de
  # la empresa que elija. En la instalación de un cliente eso no es "datos de
  # ejemplo de más": es borrarle el negocio.
  for f in [0-9]*.sql; do
    [ "$f" = "$out" ] && continue
    case "$f" in
      12_datos_demo.sql) continue ;;
    esac
    echo
    echo "-- >>>>>>>>>>>>>>>>>>>>>>>> $f <<<<<<<<<<<<<<<<<<<<<<<<"
    echo
    cat "$f"
    echo
  done
} > "$out"
echo "$out regenerado"

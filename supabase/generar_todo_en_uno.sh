#!/bin/sh
# Regenera supabase/todo_en_uno.sql a partir de los archivos numerados.
# Correr desde la raíz del repo después de tocar cualquiera de ellos.
set -e
cd "$(dirname "$0")"
out=todo_en_uno.sql
{
  echo "-- ============================================================================="
  echo "-- Zentra Móvil · TODO EN UNO"
  echo "-- Equivale a correr 01 + 02 + 03 + 04 + 05 en ese orden."
  echo "-- Generado automáticamente: no editar a mano, editar los archivos sueltos."
  echo "-- ============================================================================="
  echo
  for f in 0*.sql; do
    [ "$f" = "$out" ] && continue
    echo
    echo "-- >>>>>>>>>>>>>>>>>>>>>>>> $f <<<<<<<<<<<<<<<<<<<<<<<<"
    echo
    cat "$f"
    echo
  done
} > "$out"
echo "$out regenerado"

#!/bin/sh
# Arma el catálogo listo para subir, en `catalogo/dist/`.
#
# `index.html` se versiona con `__ANON__` en lugar de la clave, por la misma
# razón que `.env.local` y `Secretos.plist`: en este repo las claves no entran
# al control de versiones, aunque ésta sea pública.
#
# Y pública lo es: la anon key de Supabase viaja a cualquiera que abra la
# página, igual que en cualquier app web. Lo que protege los datos no es
# esconderla sino las vistas `catalogo_negocios` y `catalogo_articulos`, que
# son lo único que `anon` puede leer.
set -e
cd "$(dirname "$0")"

PLIST=../ios-nativo/ZentraMovil/Recursos/Secretos.plist
[ -f "$PLIST" ] || { echo "Falta $PLIST"; exit 1; }

KEY=$(/usr/libexec/PlistBuddy -c "Print :SUPABASE_ANON_KEY" "$PLIST")
URL=$(/usr/libexec/PlistBuddy -c "Print :SUPABASE_URL" "$PLIST")

# Lo que hay que sacarle adelante a la dirección cuando el sitio no vive en la
# raíz del dominio. En GitHub Pages cuelga del nombre del repo; con dominio
# propio va vacío. Se pasa como primer argumento.
BASE="${1-}"

mkdir -p dist
sed -e "s|__ANON__|$KEY|" \
    -e "s|__BASE__|$BASE|" \
    -e "s|https://db-zentra.neura.com.py|$URL|" \
    index.html > dist/index.html

# La misma página como 404: un hosting estático no sabe qué es `/velas-ana`,
# así que contesta con la de "no encontrado" — y si esa página es ésta, la
# dirección limpia funciona sin que haya que crear un archivo por cliente.
cp dist/index.html dist/404.html

echo "dist listo · Supabase: $URL · base: ${BASE:-(raíz)}"

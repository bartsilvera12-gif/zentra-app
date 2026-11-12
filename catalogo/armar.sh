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

mkdir -p dist
sed -e "s|__ANON__|$KEY|" \
    -e "s|https://db-zentra.neura.com.py|$URL|" \
    index.html > dist/index.html

echo "dist/index.html listo · Supabase: $URL"

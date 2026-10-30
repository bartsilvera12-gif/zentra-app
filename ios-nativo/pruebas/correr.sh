#!/bin/sh
# Las pruebas del ticket, que son las que se pueden correr sin impresora.
#
#   ios-nativo/pruebas/correr.sh
#
# Compila `Ticket.swift` solo —por eso ese archivo no importa nada más que
# Foundation— y corre `main.swift`. No hace falta Xcode ni simulador.
set -e
aca=$(cd "$(dirname "$0")" && pwd)
salida=$(mktemp -d)/pruebas
swiftc -O -o "$salida" "$aca/../ZentraMovil/Datos/Ticket.swift" "$aca/main.swift"
"$salida"

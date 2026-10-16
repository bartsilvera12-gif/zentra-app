import Foundation

/// Las colas de atención del chat, para dividir el listado como en el ERP.
/// Port de `src/lib/colas.ts`.
///
/// El ERP reparte las conversaciones en colas ("Ventas", "Soporte", …). En el
/// escritorio se ve una pestaña por cola; en la app estaba todo en una sola
/// lista, así que para encontrar lo de Ventas había que pasar por encima de lo
/// de Soporte.
///
/// Las colas no se piden aparte: salen de las conversaciones que ya están en
/// pantalla. Es a propósito. Un catálogo completo mostraría una pestaña vacía
/// por cada cola que existe en la empresa, y la mayoría tiene colas que no usa.
/// Acá sólo aparece la cola que tiene algo adentro.
///
/// Y si el ERP no informa la cola de ninguna conversación —hay versiones que no
/// mandan el campo—, `desde` devuelve una lista vacía y la pantalla no dibuja
/// la fila de pestañas. Mejor eso que una fila con una sola pestaña que no
/// filtra nada.
enum Colas {
    /// El rótulo de la pestaña "sin filtro". No es el nombre de ninguna cola.
    static let todas = "Todas"
    /// El rótulo de las conversaciones que el ERP no puso en ninguna cola.
    static let sinCola = "Sin cola"

    struct Cola: Identifiable, Equatable {
        var nombre: String
        /// Cuántas conversaciones caen acá.
        var total: Int
        /// Cuántas de ésas tienen mensajes sin leer.
        var sinLeer: Int
        var id: String { nombre }
    }

    /// El nombre de cola de una conversación, o `nil` si el ERP no lo informó.
    static func de(_ c: Chat) -> String? {
        let n = c.cola.trimmingCharacters(in: .whitespaces)
        return n.isEmpty ? nil : n
    }

    /// Las colas presentes en estas conversaciones, alfabéticas y con "Sin
    /// cola" al final. Vacío cuando ninguna trae cola: no hay nada que dividir.
    static func desde(_ chats: [Chat]) -> [Cola] {
        guard chats.contains(where: { de($0) != nil }) else { return [] }

        var por: [String: Cola] = [:]
        for c in chats {
            let nombre = de(c) ?? sinCola
            var acc = por[nombre] ?? Cola(nombre: nombre, total: 0, sinLeer: 0)
            acc.total += 1
            if c.noLeidos > 0 { acc.sinLeer += 1 }
            por[nombre] = acc
        }

        return por.values.sorted { a, b in
            // "Sin cola" no es una cola: va última aunque la S caiga antes.
            if a.nombre == sinCola { return false }
            if b.nombre == sinCola { return true }
            return a.nombre.compare(b.nombre, options: .caseInsensitive,
                                    range: nil, locale: Locale(identifier: "es")) == .orderedAscending
        }
    }

    /// ¿Esta conversación entra en la pestaña elegida?
    static func entra(_ c: Chat, en elegida: String) -> Bool {
        if elegida.isEmpty || elegida == todas { return true }
        return (de(c) ?? sinCola) == elegida
    }
}

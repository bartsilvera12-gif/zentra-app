import Foundation

/// Port de `src/lib/nombre.ts`.
///
/// El ERP devuelve el nombre como está cargado, que suele ser el legal completo
/// y en mayúsculas: "KAREN MAGNOLIA AYALA URUNAGA". Eso en el encabezado de un
/// celular empuja al nombre de la empresa y se lee como un grito.
enum Formato {
    /// Partículas que van con el apellido que sigue: "de la Cruz", "Da Silva".
    private static let particulas: Set<String> = [
        "de", "del", "la", "las", "los", "da", "do", "dos", "van", "von", "di", "san",
    ]

    private static let es = Locale(identifier: "es_PY")

    /// Mayúscula inicial respetando las partículas, y dejando quieto lo que ya
    /// venía con mayúsculas y minúsculas mezcladas (ahí se asume que está bien).
    private static func capitalizar(_ palabra: String) -> String {
        guard !palabra.isEmpty else { return palabra }
        if palabra != palabra.uppercased(with: es), palabra != palabra.lowercased(with: es) {
            return palabra
        }
        let baja = palabra.lowercased(with: es)
        if particulas.contains(baja) { return baja }

        // "maría josé" y "ayala-urunaga": cada parte lleva su mayúscula.
        var salida = ""
        var arranca = true
        for c in baja {
            if arranca, c.isLetter {
                salida.append(Character(String(c).uppercased(with: es)))
                arranca = false
            } else {
                salida.append(c)
                if c == "-" || c == "'" || c == "\u{2019}" { arranca = true }
            }
        }
        return salida
    }

    /// Nombre corto para el encabezado: primer nombre y primer apellido.
    ///
    ///   "KAREN MAGNOLIA AYALA URUNAGA" → "Karen Ayala"
    ///
    /// En Paraguay lo normal son dos nombres y dos apellidos, así que con cuatro
    /// palabras se toma la primera y la tercera. Con menos no se adivina: se
    /// devuelven las que haya, porque equivocarse de apellido es peor que
    /// mostrar uno de más. Un correo se deja entero.
    static func nombreCorto(_ completo: String) -> String {
        let limpio = completo
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
        guard !limpio.isEmpty else { return "" }
        if limpio.contains("@") { return limpio }

        let partes = limpio.split(separator: " ").map(String.init)

        // Una partícula marca dónde arranca el apellido: en "MARIA DE LA CRUZ"
        // el apellido es "de la Cruz", no "La".
        if let corte = partes.enumerated().first(where: { i, w in
            i >= 1 && particulas.contains(w.lowercased(with: es))
        })?.offset {
            return ([partes[0]] + partes[corte...]).map(capitalizar).joined(separator: " ")
        }

        let elegidas = partes.count >= 4 ? [partes[0], partes[2]] : Array(partes.prefix(2))
        return elegidas.map(capitalizar).joined(separator: " ")
    }

    /// La inicial para el círculo del avatar.
    static func inicialDe(_ completo: String) -> String {
        let c = completo.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let primera = c.first else { return "?" }
        return String(primera).uppercased(with: es)
    }

    /// "ADMIN" → "Administrador", "USUARIO" → "Usuario", "VENDEDOR_MOVIL" → "Vendedor móvil".
    static func rolLegible(_ rol: String) -> String {
        var base = rol.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "[_-]+", with: " ", options: .regularExpression)
            .lowercased(with: es)
        guard !base.isEmpty else { return "" }

        base = base.replacingOccurrences(of: "\\bmovil\\b", with: "móvil", options: .regularExpression)
        base = base.replacingOccurrences(of: "\\badmin\\b", with: "administrador", options: .regularExpression)

        return String(base.prefix(1)).uppercased(with: es) + base.dropFirst()
    }

    /// "Lun 5 oct 2026". Sin comas, sin "de" y sin puntos: el encabezado es
    /// angosto y cada carácter de más empuja al nombre de la empresa.
    static func fechaDeHoy(_ ahora: Date = Date()) -> String {
        let f = DateFormatter()
        f.locale = es
        f.setLocalizedDateFormatFromTemplate("EEE d MMM y")
        var s = f.string(from: ahora)

        s = s.replacingOccurrences(of: ",", with: "")
        s = s.replacingOccurrences(of: "\\bde\\b", with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: ".", with: "")
        s = s.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        s = s.trimmingCharacters(in: .whitespaces)

        return String(s.prefix(1)).uppercased(with: es) + s.dropFirst()
    }
}

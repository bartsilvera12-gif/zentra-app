import Foundation
import SwiftUI

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
    /// Un número con punto de miles, como se escribe acá: 1.248.
    ///
    /// Port de `num()` en Android, que usa `toLocaleString("es-PY")`. Los
    /// decimales se recortan porque donde se usa son unidades contadas; para
    /// un producto por kilo el número viene redondeado desde el stock.
    static func miles(_ n: Double) -> String {
        let f = NumberFormatter()
        f.locale = es
        f.numberStyle = .decimal
        f.maximumFractionDigits = n == n.rounded() ? 0 : 3
        return f.string(from: NSNumber(value: n)) ?? "\(Int(n))"
    }

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

/// Un campo que guarda un **código**, no una frase.
///
/// iOS corrige mientras se escribe: el guión de `GAS-2L` sale como guión
/// tipográfico (‐), las comillas se curvan, y tres puntos se vuelven puntos
/// suspensivos. En una oración eso está bien; en un SKU, un RUC, un timbrado o
/// un código de barras es otro código. `GAS-2L` y `GAS‐2L` se ven casi iguales
/// y no son lo mismo: el producto no aparece al buscarlo, y el que lo cargó
/// jura que lo escribió bien.
///
/// Se normaliza al escribir y no al guardar, para que lo que se ve en pantalla
/// sea lo que se guarda. Arreglarlo recién al guardar dejaría el campo
/// mostrando el carácter equivocado, que es la parte que confunde.
///
/// Vale también para lo que llega pegado desde otra app, que trae lo que traiga.
struct CodigoLimpio: ViewModifier {
    @Binding var texto: String

    /// Lo que iOS pone, y lo que corresponde en un código.
    private static let reemplazos: [Character: Character] = [
        "\u{2010}": "-", "\u{2011}": "-", "\u{2012}": "-",
        "\u{2013}": "-", "\u{2014}": "-", "\u{2015}": "-",
        "\u{2018}": "'", "\u{2019}": "'", "\u{201B}": "'",
        "\u{201C}": "\"", "\u{201D}": "\"",
        "\u{00A0}": " ",
    ]

    static func limpiar(_ s: String) -> String {
        var r = String(s.map { reemplazos[$0] ?? $0 })
        // Los puntos suspensivos son un solo carácter y no tres puntos.
        r = r.replacingOccurrences(of: "\u{2026}", with: "...")
        return r
    }

    func body(content: Content) -> some View {
        content
            .autocorrectionDisabled()
            .textInputAutocapitalization(.characters)
            .onChange(of: texto) { _, nuevo in
                let limpio = Self.limpiar(nuevo)
                if limpio != nuevo { texto = limpio }
            }
    }
}

extension View {
    /// Marca el campo como código: sin correcciones tipográficas.
    func codigoLimpio(_ texto: Binding<String>) -> some View {
        modifier(CodigoLimpio(texto: texto))
    }
}

/// Aplica `CodigoLimpio` sólo cuando el campo es un código.
///
/// Existe porque un `if` adentro de un modificador cambiaría el tipo de la
/// vista según el valor, y SwiftUI pierde el estado del campo cuando eso pasa:
/// el teclado se cerraría solo al escribir el primer carácter.
struct SiCodigo: ViewModifier {
    let activo: Bool
    @Binding var texto: String

    func body(content: Content) -> some View {
        content
            .textInputAutocapitalization(activo ? .characters : .sentences)
            .onChange(of: texto) { _, nuevo in
                guard activo else { return }
                let limpio = CodigoLimpio.limpiar(nuevo)
                if limpio != nuevo { texto = limpio }
            }
    }
}

/// Un campo de formulario con su etiqueta arriba.
///
/// Estaba copiado tres veces en `FormulariosView`, una por pantalla, y las tres
/// eran idénticas. Cuando hubo que marcar los campos que son códigos, edité una
/// y las otras dos quedaron atrás: el SKU se arreglaba en Nuevo producto y
/// seguía roto en Compras. Un solo lugar evita justamente eso.
struct CampoTexto: View {
    @Environment(\.tema) private var t
    let etiqueta: String
    @Binding var valor: String
    var teclado: UIKeyboardType = .default
    var marcador: String = ""
    /// El campo guarda un código: sin correcciones tipográficas.
    var codigo: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(etiqueta.uppercased()).font(Tipo.barlow(.semibold, 10)).tracking(1.2)
                .foregroundStyle(t.ink2)
            TextField(marcador, text: $valor)
                .keyboardType(teclado)
                .autocorrectionDisabled()
                // 16pt: por debajo, iOS hace zoom al enfocar y la pantalla salta.
                .font(.system(size: 16))
                .modifier(SiCodigo(activo: codigo, texto: $valor))
                .padding(.horizontal, 12).frame(height: 44)
                .background(t.bg, in: .rect(cornerRadius: 10))
                .overlay { RoundedRectangle(cornerRadius: 10).stroke(t.border) }
        }
    }
}

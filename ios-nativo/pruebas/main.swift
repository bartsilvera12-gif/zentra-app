import Foundation

/// El ticket que sale por la impresora térmica. Port de `test/ticket.mjs`.
///
///   ios-nativo/pruebas/correr.sh
///
/// De toda la impresión, esto es lo único que se puede verificar sin hardware:
/// no hay Bluetooth, ni permisos, ni teléfono, son cuentas y cuántos caracteres
/// entran en el papel. Así que se prueba acá con todo lo que en la vida real
/// rompe un ticket: nombres de producto largos, montos que tienen que quedar
/// alineados, acentos y ñ, una venta de un renglón y una de veinte.
///
/// Lo que NO se prueba acá es que el papel salga. Eso no lo sabe nadie hasta
/// que haya una impresora adelante, y por eso la pantalla no lo afirma.

var fallas = 0

func t(_ nombre: String, _ cuerpo: () throws -> Void) {
    do {
        try cuerpo()
        print("  OK · \(nombre)")
    } catch {
        fallas += 1
        print("  FALLA · \(nombre)")
        print("        \(error)")
    }
}

struct Falla: Error, CustomStringConvertible {
    let description: String
    init(_ d: String) { description = d }
}

func exigir(_ cond: Bool, _ porque: @autoclosure () -> String) throws {
    if !cond { throw Falla(porque()) }
}

/// El ticket con los espacios colapsados.
///
/// El contenido se busca sobre esto y no sobre el texto crudo porque el ticket
/// parte las líneas al ancho del papel: "no es una factura legal" puede estar
/// repartido en dos renglones y seguir estando. Lo que se mide con el texto
/// crudo es el ancho, que es la otra prueba.
func plano(_ texto: String) -> String {
    texto.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
}

let EMISOR = Ticket.Emisor(nombre: "Despensa Ña Cándida", ruc: "80012345-6", ciudad: "Asunción")
let SIN_RUC = Ticket.Emisor(nombre: "Despensa Ña Cándida", ruc: "", ciudad: "Asunción")

func linea(_ nombre: String, _ qty: Double, _ precio: Int, _ iva: String) -> Ticket.Linea {
    Ticket.Linea(nombre: nombre, qty: qty, precio: precio, iva: iva,
                 tasa: iva == "10%" ? 0.1 : iva == "5%" ? 0.05 : 0)
}

func venta(_ lineas: [Ticket.Linea]) -> Ticket.Venta {
    Ticket.Venta(numero: "001-001-0000123", fecha: "19 oct 2026", cliente: "Juan Pérez",
                 doc: "1234567-8", pago: "Contado", estado: "Cobrada", lineas: lineas)
}

let UNA = venta([linea("Gaseosa 2L", 2, 15000, "10%")])

/// Veinte renglones, con nombres de largo variable como los de verdad.
let VEINTE = venta((0..<20).map { i in
    linea(i % 3 == 0 ? "Yerba mate compuesta con hierbas serranas 1 kg" : "Producto \(i + 1)",
          Double(i + 1), 1000 * (i + 1), i % 2 == 1 ? "5%" : "10%")
})

print("Ticket")

// MARK: - el ancho del papel

t("los dos rollos son 32 y 48 columnas") {
    try exigir(Ticket.Ancho.mm58.columnas == 32, "58 mm son 32 columnas")
    try exigir(Ticket.Ancho.mm80.columnas == 48, "80 mm son 48 columnas")
}

t("ante la duda, el rollo angosto") {
    try exigir(Ticket.anchoValido(nil) == .mm58, "sin dato, 58")
    try exigir(Ticket.anchoValido(0) == .mm58, "cero, 58")
    try exigir(Ticket.anchoValido(57) == .mm58, "un ancho raro, 58")
    try exigir(Ticket.anchoValido(80) == .mm80, "80 es 80")
}

// MARK: - acomodar texto

t("recortar no deja pasar nada más ancho que el papel") {
    try exigir(Ticket.recortar("Gaseosa 2L", 5) == "Gaseo", "cortó mal: \(Ticket.recortar("Gaseosa 2L", 5))")
    try exigir(Ticket.recortar("Gs 30.000", 32) == "Gs 30.000", "recortó algo que entraba")
}

t("una palabra más larga que el papel se parte igual") {
    let partes = Ticket.partir("Antidisestablishmentarianismo", 10)
    try exigir(partes.allSatisfy { Ticket.ancho($0) <= 10 }, "quedó una línea más ancha: \(partes)")
    try exigir(partes.joined() == "Antidisestablishmentarianismo", "se perdieron letras: \(partes)")
}

t("partir corta por palabra y no deja líneas vacías") {
    let partes = Ticket.partir("  Yerba   mate  compuesta 1 kg ", 12)
    try exigir(!partes.contains(""), "hay una línea vacía: \(partes)")
    try exigir(partes.allSatisfy { Ticket.ancho($0) <= 12 }, "se pasó de ancho: \(partes)")
    try exigir(partes.joined(separator: " ") == "Yerba mate compuesta 1 kg",
               "cambió el texto: \(partes.joined(separator: " "))")
}

t("la ñ y los acentos miden un carácter") {
    try exigir(Ticket.ancho("ñandutí") == 7, "ñandutí mide 7, no \(Ticket.ancho("ñandutí"))")
    // La misma palabra escrita como n + tilde combinada: NFC la junta.
    let descompuesta = "n\u{0303}anduti\u{0301}"
    try exigir(Ticket.ancho(descompuesta) == 7,
               "descompuesta mide \(Ticket.ancho(descompuesta))")
}

t("centrar nunca se pasa del papel") {
    for s in ["Zentra", "Despensa Ña Cándida", "x"] {
        for cols in [32, 48] {
            try exigir(Ticket.ancho(Ticket.centrar(s, cols)) <= cols, "\"\(s)\" se pasó en \(cols)")
        }
    }
}

t("el monto queda pegado al borde derecho") {
    let l = Ticket.dosColumnas("TOTAL", "Gs 30.000", 32)
    try exigir(Ticket.ancho(l) == 32, "mide \(Ticket.ancho(l)) y no 32")
    try exigir(l.hasSuffix("Gs 30.000"), "el monto no quedó a la derecha: \"\(l)\"")
    try exigir(l.hasPrefix("TOTAL"), "el rótulo no quedó a la izquierda: \"\(l)\"")
}

t("cuando no entran los dos, se recorta el rótulo y no el monto") {
    let l = Ticket.dosColumnas("Yerba mate compuesta con hierbas serranas", "Gs 1.250.000", 20)
    try exigir(Ticket.ancho(l) == 20, "mide \(Ticket.ancho(l)) y no 20")
    try exigir(l.hasSuffix("Gs 1.250.000"), "se comió el monto: \"\(l)\"")
}

t("los miles van con punto y sin centavos") {
    try exigir(Ticket.monto(1_250_000) == "1.250.000", Ticket.monto(1_250_000))
    try exigir(Ticket.monto(999) == "999", Ticket.monto(999))
    try exigir(Ticket.monto(1000) == "1.000", Ticket.monto(1000))
    try exigir(Ticket.monto(15000.4) == "15.000", Ticket.monto(15000.4))
    try exigir(Ticket.monto(0) == "0", Ticket.monto(0))
}

// MARK: - el ticket

t("ninguna línea se pasa del ancho del papel") {
    for mm in Ticket.Ancho.allCases {
        for v in [UNA, VEINTE] {
            for l in Ticket.lineas(v, emisor: EMISOR, ancho: mm) {
                try exigir(Ticket.ancho(l) <= mm.columnas,
                           "en \(mm.rawValue) mm se pasó: \"\(l)\" (\(Ticket.ancho(l)))")
            }
        }
    }
}

t("están el número, el cliente, la fecha y el total") {
    let p = plano(Ticket.texto(UNA, emisor: EMISOR))
    for esperado in ["001-001-0000123", "Juan Pérez", "19 oct 2026", "TOTAL", "Gs 30.000"] {
        try exigir(p.contains(esperado), "falta \"\(esperado)\" en el ticket")
    }
}

t("con RUC dice Factura; sin RUC, comprobante interno y por qué") {
    let conRuc = plano(Ticket.texto(UNA, emisor: EMISOR))
    try exigir(conRuc.contains("Factura 001-001-0000123"), "no dice Factura")
    try exigir(conRuc.contains("RUC 80012345-6"), "no está el RUC del emisor")

    let sinRuc = plano(Ticket.texto(UNA, emisor: SIN_RUC))
    try exigir(sinRuc.contains("Comprobante interno"), "no dice comprobante interno")
    try exigir(sinRuc.contains("Sin RUC cargado"), "no avisa que falta el RUC")
    try exigir(sinRuc.contains("no una factura legal"), "no explica qué falta")
}

t("el IVA se desglosa por tasa, contenido en el precio") {
    let v = venta([linea("Gaseosa", 1, 11000, "10%"), linea("Leche", 1, 10500, "5%"),
                   linea("Libro", 1, 50000, "Exenta")])
    let d = Ticket.desgloseIva(v)
    try exigir(d.count == 3, "tendrían que ser tres tasas, son \(d.count)")
    try exigir(d[0].tasa == "10%" && d[1].tasa == "5%" && d[2].tasa == "Exenta",
               "el orden cambió: \(d.map(\.tasa))")
    try exigir(Int(d[0].iva.rounded()) == 1000, "IVA 10% de 11.000 es 1.000, no \(d[0].iva)")
    try exigir(Int(d[1].iva.rounded()) == 500, "IVA 5% de 10.500 es 500, no \(d[1].iva)")
    try exigir(d[2].iva == 0, "lo exento no lleva IVA")
    try exigir(Int(d[2].base.rounded()) == 50000, "la base exenta es el bruto")
}

t("una tasa que no está en la venta no aparece en el papel") {
    let p = plano(Ticket.texto(UNA, emisor: EMISOR))
    try exigir(!p.contains("IVA 5%"), "apareció una tasa que la venta no tiene")
    try exigir(p.contains("IVA 10%"), "falta la tasa que sí tiene")
}

t("el total del papel es la suma de los renglones") {
    let total = VEINTE.lineas.reduce(0.0) { $0 + $1.qty * Double($1.precio) }
    let p = plano(Ticket.texto(VEINTE, emisor: EMISOR, ancho: .mm80))
    try exigir(p.contains("TOTAL Gs \(Ticket.monto(total))"),
               "el total no coincide: esperaba \(Ticket.monto(total))")
}

t("sin documento del cliente no se escribe la línea del documento") {
    var v = UNA
    v.doc = ""
    try exigir(!plano(Ticket.texto(v, emisor: EMISOR)).contains("RUC/CI"),
               "escribió RUC/CI sin tener documento")
}

t("una venta sin renglones no rompe el ticket") {
    let vacia = venta([])
    let l = Ticket.lineas(vacia, emisor: EMISOR)
    try exigir(!l.isEmpty, "no armó nada")
    try exigir(plano(l.joined(separator: " ")).contains("TOTAL Gs 0"), "el total de una venta vacía es 0")
}

// MARK: - el ticket de prueba

t("la regla de columnas llega justo al borde") {
    for mm in Ticket.Ancho.allCases {
        let l = Ticket.lineasDePrueba(mm)
        guard let regla = l.first(where: { $0.allSatisfy { $0.isNumber } && $0.count > 10 }) else {
            throw Falla("no está la regla en \(mm.rawValue) mm")
        }
        try exigir(Ticket.ancho(regla) == mm.columnas,
                   "la regla mide \(Ticket.ancho(regla)) y el papel \(mm.columnas)")
    }
}

t("el ticket de prueba trae acentos, ñ y el ancho elegido") {
    let p = plano(Ticket.lineasDePrueba(.mm80).joined(separator: " "))
    try exigir(p.contains("48 columnas · papel de 80 mm"), "no dice el ancho: \(p)")
    try exigir(p.contains("ñandutí"), "no trae la ñ")
    try exigir(p.contains("Caazapá"), "no trae acentos")
}

t("ninguna línea de la prueba se pasa del papel") {
    for mm in Ticket.Ancho.allCases {
        for l in Ticket.lineasDePrueba(mm) {
            try exigir(Ticket.ancho(l) <= mm.columnas, "\"\(l)\" se pasó en \(mm.rawValue) mm")
        }
    }
}

// MARK: - lo que va por el cable

t("el guaraní se escribe Gs y nunca con el símbolo") {
    // `₲` no existe en Windows-1252: saldría un carácter cualquiera justo en el
    // total, que es lo único que todo el mundo mira.
    for texto in [Ticket.texto(VEINTE, emisor: EMISOR), Ticket.lineasDePrueba(.mm58).joined()] {
        try exigir(!texto.contains("₲"), "se coló el símbolo del guaraní")
    }
    try exigir(Ticket.texto(UNA, emisor: EMISOR).contains("Gs "), "no escribe Gs")
}

t("todo el ticket entra en Windows-1252") {
    // Si algo no entra, la impresora recibe basura en ese lugar. Se prueba con
    // los textos que más riesgo tienen: nombres propios y el pie.
    let textos = [Ticket.texto(VEINTE, emisor: EMISOR, ancho: .mm80),
                  Ticket.lineasDePrueba(.mm80).joined(separator: "\n")]
    for texto in textos {
        try exigir(texto.data(using: .windowsCP1252) != nil,
                   "hay caracteres que la impresora no puede escribir")
    }
}

// MARK: - los bytes que recibe la impresora

t("el ticket empieza poniendo la impresora en cero y en Windows-1252") {
    let d = [UInt8](Ticket.escpos(["Hola"]))
    try exigir(Array(d.prefix(2)) == [0x1B, 0x40], "no arranca con ESC @")
    try exigir(Array(d[2..<5]) == [0x1B, 0x74, 0x10], "no manda la página de código Windows-1252")
    try exigir(Array(d[5..<8]) == [0x1B, 0x4D, 0x00], "no pide la fuente A")
}

t("cada línea termina en salto y el ticket en avance y corte") {
    let d = [UInt8](Ticket.escpos(["Uno", "Dos"]))
    try exigir(Array(d.suffix(6)) == [0x1B, 0x64, 0x03, 0x1D, 0x56, 0x00],
               "no termina avanzando el papel y cortando")
    try exigir(d.filter { $0 == 0x0A }.count == 2, "tendría que haber un salto por línea")
}

t("los acentos viajan en Windows-1252, no en UTF-8") {
    let d = [UInt8](Ticket.escpos(["ñandutí"]))
    // En Windows-1252 la ñ es un byte (0xF1); en UTF-8 son dos (0xC3 0xB1).
    try exigir(d.contains(0xF1), "la ñ no salió en Windows-1252")
    try exigir(!d.contains(where: { $0 == 0xC3 }), "se coló UTF-8: los acentos van a salir rotos")
}

t("un carácter que la impresora no tiene no tira todo el ticket") {
    // El símbolo del guaraní no existe en Windows-1252. Un nombre raro no
    // puede dejar a alguien sin comprobante.
    let d = Ticket.escpos(["Total ₲ 1.000", "Segunda línea"])
    try exigir(d.count > 20, "se perdió el ticket entero por un carácter")
}

print(fallas == 0 ? "Ticket: todas las pruebas pasaron." : "\(fallas) prueba(s) fallaron.")
exit(fallas == 0 ? 0 : 1)

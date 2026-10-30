import Foundation

/// El ticket, como dato: el contenido que va a salir por la impresora térmica,
/// armado antes de hablar con ninguna impresora. Port de `src/lib/ticket.ts`.
///
/// Está separado de `Impresora.swift` a propósito. Lo que se imprime es la
/// única parte de todo esto que se puede verificar sin hardware: acá no hay
/// Bluetooth, ni permisos, ni teléfono. Son cuentas y cuántos caracteres entran
/// en el papel. Lo otro —que el rollo salga— no lo sabe nadie hasta que haya un
/// rollo adelante. Por eso este archivo no importa nada más que Foundation: así
/// se compila solo y se prueba en la terminal (`ios-nativo/pruebas/ticket.swift`).
///
/// Dos anchos, porque son los dos rollos que se usan en los comercios de acá:
///
///   58 mm → 32 columnas
///   80 mm → 48 columnas
///
/// Los números no son elegidos: a 203 dpi el papel de 58 mm tiene 384 puntos
/// imprimibles y el de 80 mm, 576. La fuente A del ESC/POS mide 12 puntos de
/// ancho, así que entran 384/12 = 32 y 576/12 = 48. Por eso el ticket se arma en
/// texto monoespaciado y se imprime con la fuente A: lo que se cuenta acá es
/// exactamente lo que cabe allá. Con otra fuente, cada línea que se pase se
/// parte sola en el lugar equivocado y el monto de la derecha aparece abajo.
///
/// El guaraní se escribe "Gs" y no "₲". El símbolo no existe en la página de
/// código que entienden estas impresoras (Windows-1252, que es la que cubre
/// nuestros acentos y la ñ), así que saldría un carácter cualquiera en el lugar
/// del total. Es la clase de detalle que no se ve hasta que sale el papel.
enum Ticket {
    /// Los dos rollos. No hay un tercero en la calle.
    enum Ancho: Int, CaseIterable, Identifiable {
        case mm58 = 58
        case mm80 = 80

        var id: Int { rawValue }
        var columnas: Int { self == .mm58 ? 32 : 48 }
        var legible: String { "\(rawValue) mm" }
    }

    /// El ancho que se usa cuando no se sabe cuál es: el más angosto.
    ///
    /// Un ticket de 32 columnas sale bien en un rollo de 80 mm, apenas
    /// angosto; uno de 48 columnas en un rollo de 58 mm sale partido a la
    /// mitad y no se entiende.
    static let anchoPorDefecto: Ancho = .mm58

    static func anchoValido(_ mm: Int?) -> Ancho {
        mm == 80 ? .mm80 : anchoPorDefecto
    }

    // MARK: - Lo que hace falta para armar el papel

    /// Quién factura. Port de `Emisor` de `src/lib/emisor.ts`.
    ///
    /// Lo que no está, no se inventa: el ticket dice que falta y por qué,
    /// mientras un RUC inventado es una mentira que se descubre en la mesa de
    /// la DNIT.
    struct Emisor {
        var nombre: String
        /// Vacío cuando no está configurado.
        var ruc: String
        var ciudad: String

        /// Qué le falta para ser un comprobante válido. `nil` cuando no falta
        /// nada.
        var falta: String? {
            var faltantes: [String] = []
            if nombre.trimmingCharacters(in: .whitespaces).isEmpty { faltantes.append("la razón social") }
            if ruc.trimmingCharacters(in: .whitespaces).isEmpty { faltantes.append("el RUC") }
            guard !faltantes.isEmpty else { return nil }
            return "Falta \(faltantes.joined(separator: " y ")) de quien factura. "
                + "Hasta cargarlos, esto es un comprobante interno, no una factura legal."
        }

        /// Cómo se llama el papel que se está mirando. Sin RUC no hay factura:
        /// hay un comprobante interno, y eso es justo lo que dice `falta`.
        var titulo: String { falta == nil ? "Factura" : "Comprobante interno" }

        /// La segunda línea del encabezado, con lo que haya.
        var linea: String {
            [ruc.isEmpty ? "Sin RUC cargado" : "RUC " + ruc, ciudad]
                .filter { !$0.isEmpty }
                .joined(separator: " · ")
        }

        init(nombre: String, ruc: String = "", ciudad: String = "") {
            let n = nombre.trimmingCharacters(in: .whitespaces)
            self.nombre = n.isEmpty ? "Empresa sin configurar" : n
            self.ruc = ruc.trimmingCharacters(in: .whitespaces)
            self.ciudad = ciudad.trimmingCharacters(in: .whitespaces)
        }
    }

    /// Un renglón del ticket.
    ///
    /// Trae la tasa ya resuelta y no el `Iva` de `RepoERP` para que este
    /// archivo no dependa de nada: así se puede compilar y probar solo.
    struct Linea {
        var nombre: String
        var qty: Double
        var precio: Int
        /// "10%", "5%" o "Exenta", como se escribe en el papel.
        var iva: String
        /// 0.10, 0.05 o 0.
        var tasa: Double
    }

    struct Venta {
        var numero: String
        /// Como se lee, no como se guarda: "19 oct 2026".
        var fecha: String
        var cliente: String
        var doc: String
        var pago: String
        /// "Cobrada" o "Pendiente".
        var estado: String
        var lineas: [Linea]
    }

    static let piePorDefecto = "¡Gracias por su compra!"

    // MARK: - Medir y acomodar texto

    /// El texto, en la forma en la que se puede contar y encodear.
    ///
    /// NFC junta la letra y su tilde en un solo carácter. Hace falta por dos
    /// razones: "ñ" escrita como n + tilde combinada mide dos caracteres y
    /// corre toda la línea, y además no tiene lugar en Windows-1252, así que la
    /// impresora recibe basura justo en los nombres propios, que es donde más
    /// se nota.
    static func txt(_ s: String?) -> String {
        (s ?? "").precomposedStringWithCanonicalMapping
    }

    /// Cuánto ocupa en el papel, en caracteres de la fuente A.
    static func ancho(_ s: String) -> Int {
        txt(s).unicodeScalars.count
    }

    /// Lo que entra, y lo que no entra se corta. Para una celda de ancho fijo.
    static func recortar(_ s: String, _ cols: Int) -> String {
        let c = Array(txt(s).unicodeScalars)
        guard c.count > cols, cols >= 0 else { return c.map(String.init).joined() }
        return c.prefix(cols).map(String.init).joined()
    }

    /// El texto en varias líneas, cortando por palabra.
    ///
    /// Una palabra más larga que el papel —un nombre de producto pegado, un
    /// código— se parte igual: dejarla salir corre la línea y la impresora la
    /// corta donde quiere, que es siempre peor que cortarla donde decidimos
    /// nosotros.
    static func partir(_ s: String, _ cols: Int) -> [String] {
        let limpio = txt(s)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
        guard !limpio.isEmpty, cols > 0 else { return [] }

        var salida: [String] = []
        var linea = ""
        for palabra in limpio {
            var p = palabra
            // La palabra sola no entra: se llena línea por línea hasta que lo
            // que queda sí entra.
            while ancho(p) > cols {
                if !linea.isEmpty {
                    salida.append(linea)
                    linea = ""
                }
                salida.append(recortar(p, cols))
                p = Array(txt(p).unicodeScalars).dropFirst(cols).map(String.init).joined()
            }
            if p.isEmpty { continue }
            if linea.isEmpty { linea = p }
            else if ancho(linea) + 1 + ancho(p) <= cols { linea += " " + p }
            else {
                salida.append(linea)
                linea = p
            }
        }
        if !linea.isEmpty { salida.append(linea) }
        return salida
    }

    /// Centrado con espacios. No hay otra forma: el papel no sabe de márgenes.
    static func centrar(_ s: String, _ cols: Int) -> String {
        let t = recortar(s, cols)
        let sobra = cols - ancho(t)
        return String(repeating: " ", count: max(0, sobra / 2)) + t
    }

    /// Rótulo a la izquierda, monto a la derecha, pegado al borde del papel.
    ///
    /// Los montos van alineados a la derecha porque es la única forma de poder
    /// sumarlos de un vistazo: con la coma bailando, una columna de precios no
    /// se lee. Cuando los dos no entran, lo que se recorta es el rótulo —el
    /// nombre se adivina, el monto no—.
    static func dosColumnas(_ izq: String, _ der: String, _ cols: Int) -> String {
        let d = recortar(der, cols)
        let lugar = cols - ancho(d) - 1
        if lugar <= 0 {
            return String(repeating: " ", count: max(0, cols - ancho(d))) + d
        }
        let i = recortar(izq, lugar)
        return i + String(repeating: " ", count: max(0, cols - ancho(i) - ancho(d))) + d
    }

    /// Una línea de guiones de punta a punta.
    static func separador(_ cols: Int, _ char: String = "-") -> String {
        String(repeating: char, count: max(0, cols))
    }

    /// Un monto en guaraníes, sin el símbolo.
    ///
    /// Redondeado al entero: el guaraní no tiene centavos, y un ticket con
    /// decimales es un ticket que alguien va a venir a preguntar. El punto de
    /// miles va escrito y no delegado al sistema: la impresora recibe lo que
    /// contamos acá, y el separador que elija el teléfono de cada uno cambiaría
    /// el ancho de la columna de montos.
    static func monto(_ n: Double) -> String {
        let entero = abs(n.rounded())
        var d = Array(String(Int(entero)))
        var salida: [String] = []
        while d.count > 3 {
            salida.insert(String(d.suffix(3)), at: 0)
            d.removeLast(3)
        }
        salida.insert(String(d), at: 0)
        return (n.rounded() < 0 ? "-" : "") + salida.joined(separator: ".")
    }

    static func monto(_ n: Int) -> String { monto(Double(n)) }

    // MARK: - El ticket

    /// El desglose de IVA de la venta.
    ///
    /// El IVA está *contenido* en el precio —así se factura en Paraguay— así
    /// que la base de cada tasa es el bruto menos el impuesto, no el bruto.
    static func desgloseIva(_ v: Venta) -> [(tasa: String, base: Double, iva: Double)] {
        var salida: [(tasa: String, base: Double, iva: Double)] = []
        for etiqueta in ["10%", "5%", "Exenta"] {
            let lineas = v.lineas.filter { $0.iva == etiqueta }
            guard !lineas.isEmpty else { continue }
            let r = lineas[0].tasa
            let bruto = lineas.reduce(0.0) { $0 + $1.qty * Double($1.precio) }
            let iva = bruto * r / (1 + r)
            salida.append((etiqueta, bruto - iva, iva))
        }
        return salida
    }

    /// El ticket entero, línea por línea, ya recortado al ancho del papel.
    ///
    /// Devuelve texto y no comandos de impresora porque así se puede leer en
    /// una prueba y mirar con los ojos. Lo que se manda a imprimir son estas
    /// mismas líneas, sin tocarlas: si acá entra, allá entra.
    static func lineas(_ v: Venta, emisor e: Emisor, ancho mm: Ancho = anchoPorDefecto,
                       pie: String? = nil) -> [String]
    {
        let cols = mm.columnas
        var l: [String] = []

        for linea in partir(e.nombre, cols) { l.append(centrar(linea, cols)) }
        // Sin RUC esto no dice "RUC": dice "Sin RUC cargado". Inventarle uno al
        // papel es exactamente el problema que `falta` vino a resolver.
        for linea in partir(e.linea, cols) { l.append(centrar(linea, cols)) }
        l.append(separador(cols))

        // El título va partido y no en una línea sola porque "Comprobante
        // interno" más el número son 35 caracteres y en 58 mm entran 32: así el
        // número baja a la línea de abajo en vez de perderse.
        for linea in partir("\(e.titulo) \(v.numero)", cols) { l.append(linea) }
        l.append("Fecha: \(txt(v.fecha))")
        for linea in partir("Cliente: \(v.cliente)", cols) { l.append(linea) }
        if !txt(v.doc).isEmpty {
            for linea in partir("RUC/CI: \(v.doc)", cols) { l.append(linea) }
        }
        l.append(separador(cols))

        for li in v.lineas {
            // El nombre arriba, en todo el ancho, y abajo la cuenta: cantidad
            // por precio a la izquierda y el total pegado a la derecha. Al
            // revés —nombre y monto en la misma línea— los nombres de productos
            // reales no entran y el ticket queda lleno de nombres cortados.
            for linea in partir(li.nombre, cols) { l.append(linea) }
            let cant = li.qty == li.qty.rounded() ? String(Int(li.qty)) : String(format: "%.3f", li.qty)
            l.append(dosColumnas("  \(cant) x \(monto(li.precio))",
                                 monto(li.qty * Double(li.precio)), cols))
        }
        l.append(separador(cols))

        for d in desgloseIva(v) {
            if d.tasa == "Exenta" {
                l.append(dosColumnas("Exentas", monto(d.base), cols))
                continue
            }
            l.append(dosColumnas("Gravado \(d.tasa)", monto(d.base), cols))
            l.append(dosColumnas("IVA \(d.tasa)", monto(d.iva), cols))
        }
        l.append(separador(cols))

        let total = v.lineas.reduce(0.0) { $0 + $1.qty * Double($1.precio) }
        l.append(dosColumnas("TOTAL", "Gs \(monto(total))", cols))
        l.append(separador(cols))

        l.append(dosColumnas(txt(v.pago), txt(v.estado), cols))
        l.append("")
        for linea in partir(pie ?? piePorDefecto, cols) { l.append(centrar(linea, cols)) }
        // Lo que falta para ser una factura va en el papel, no sólo en la
        // pantalla: el que se lleva el ticket tiene que poder leer que no es un
        // comprobante legal, igual que el que lo emitió.
        if let falta = e.falta {
            l.append("")
            for linea in partir(falta, cols) { l.append(centrar(linea, cols)) }
        }

        return l
    }

    /// El ticket en texto plano, para mirarlo sin impresora.
    static func texto(_ v: Venta, emisor: Emisor, ancho: Ancho = anchoPorDefecto,
                      pie: String? = nil) -> String
    {
        lineas(v, emisor: emisor, ancho: ancho, pie: pie).joined(separator: "\n")
    }

    // MARK: - El ticket de prueba

    /// Lo que sale cuando se prueba la impresora recién elegida.
    ///
    /// Tres cosas, y cada una contesta una pregunta que de otro modo se
    /// descubre con un cliente esperando:
    ///
    ///   1. La regla de columnas. Si los números no llegan justo al borde del
    ///      papel, el ancho configurado no es el del rollo que está puesto.
    ///   2. Los acentos y la ñ. Si salen símbolos raros, la impresora no está
    ///      en la página de código que le mandamos, y todos los nombres propios
    ///      van a salir mal.
    ///   3. El corte. Si el papel no se corta, la impresora no tiene cuchilla y
    ///      hay que arrancarlo a mano, que conviene saber antes.
    static func lineasDePrueba(_ mm: Ancho) -> [String] {
        let cols = mm.columnas
        var l: [String] = []
        for linea in partir("Zentra · prueba de impresión", cols) { l.append(centrar(linea, cols)) }
        l.append(separador(cols))
        // Un dígito por columna: el último tiene que caer justo en el borde.
        l.append((1...cols).map { String($0 % 10) }.joined())
        l.append("\(cols) columnas · papel de \(mm.rawValue) mm")
        l.append(separador(cols))
        for linea in partir("Acentos y ñ: ñandutí, Caazapá, Ñemby", cols) { l.append(linea) }
        l.append(dosColumnas("Monto de prueba", "Gs \(monto(1_250_000))", cols))
        l.append(separador(cols))
        for linea in partir("Si leés esto, imprime.", cols) { l.append(centrar(linea, cols)) }
        return l
    }

    // MARK: - Lo que va por el cable

    /// El ticket, en los bytes que entiende la impresora.
    ///
    /// Nada de negritas, doble alto ni centrado por comando: todo el formato ya
    /// está en el texto —los espacios del centrado, el relleno de los montos— y
    /// mezclar las dos cosas rompe la cuenta de columnas, porque un texto en
    /// doble ancho ocupa el doble y la línea de 32 pasa a 16.
    ///
    /// `ESC t 16` es la página de código Windows-1252, que es la que tiene los
    /// acentos y la ñ. Sin eso los nombres salen con símbolos en el lugar de
    /// las tildes. Y el avance antes del corte existe porque el cabezal y la
    /// cuchilla no están en el mismo lugar: sin avanzar el papel, la cuchilla
    /// corta arriba del total.
    static func escpos(_ lineas: [String]) -> Data {
        var d = Data()
        d.append(contentsOf: [0x1B, 0x40])        // ESC @   · arranca de cero
        d.append(contentsOf: [0x1B, 0x74, 0x10])  // ESC t 16 · Windows-1252
        d.append(contentsOf: [0x1B, 0x4D, 0x00])  // ESC M 0  · fuente A, 12 puntos
        for linea in lineas {
            let texto = Ticket.txt(linea)
            // Lo que no entra en Windows-1252 se reemplaza en vez de tirar todo
            // el ticket: un carácter raro en un nombre no puede dejar a alguien
            // sin comprobante.
            let datos = texto.data(using: .windowsCP1252, allowLossyConversion: true)
            d.append(datos ?? Data())
            d.append(0x0A)
        }
        d.append(contentsOf: [0x1B, 0x64, 0x03])  // ESC d 3 · tres líneas de avance
        d.append(contentsOf: [0x1D, 0x56, 0x00])  // GS V 0  · corte, si tiene cuchilla
        return d
    }
}

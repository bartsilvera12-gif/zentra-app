import Foundation

/// Lo que se pregunta al crear la cuenta. Port de `src/lib/registro.ts`.
///
/// Las listas y la validación están acá y no en la pantalla porque tienen que
/// decir **exactamente** lo mismo que la app web: si una dice "Instagram o
/// Facebook" y la otra "Instagram/Face", el día que alguien cuente de dónde
/// vienen los clientes va a estar sumando dos cosas distintas.
///
/// Las claves de los metadatos las lee `supabase/16_registro_datos.sql`. Si
/// cambia un nombre hay que cambiarlo en los tres lados —acá, en el TS y en el
/// SQL— y nadie avisa: el dato simplemente llega nulo.
enum Registro {
    static let comoConocio = [
        "Me la recomendó un conocido",
        "Instagram o Facebook",
        "TikTok",
        "Buscando en Google",
        "Por WhatsApp",
        "Un vendedor de Zentra",
        "Otro",
    ]

    static let tamanos = ["Solo yo", "2 a 5 personas", "6 a 10 personas", "11 a 20 personas", "Más de 20"]

    static let rubros = [
        "Despensa o minimercado",
        "Ropa y calzado",
        "Comida y bebidas",
        "Farmacia o perfumería",
        "Ferretería o materiales",
        "Celulares y tecnología",
        "Librería y papelería",
        "Distribuidora o mayorista",
        "Servicios",
        "Otro",
    ]

    static let edadMinima = 16
    static let edadMaxima = 100

    struct Datos: Equatable {
        var nombre = ""
        var empresa = ""
        var correo = ""
        var clave = ""
        var clave2 = ""
        var nacimiento = Date()
        var comoConocio = ""
        var tamano = ""
        var rubro = ""
    }

    /// La fecha como la espera la base: aaaa-mm-dd, sin hora ni zona.
    static func fechaISO(_ d: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "America/Asuncion")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: d)
    }

    static func edad(_ nacimiento: Date, hoy: Date = Date()) -> Int {
        Calendar(identifier: .gregorian).dateComponents([.year], from: nacimiento, to: hoy).year ?? 0
    }

    /// Los pasos del alta, en orden.
    ///
    /// Tres y no una sola pantalla: con nueve campos seguidos el alta se leía
    /// como un formulario de banco, y con el teclado abierto quedaban dos a la
    /// vista. De a tres o cuatro por paso, cada pantalla entra entera.
    ///
    /// Es el mismo reparto que `PASOS_REGISTRO` de `src/lib/registro.ts`: si
    /// cambia allá, cambia acá, o las dos altas dejan de preguntar lo mismo.
    enum Paso: String, CaseIterable {
        case cuenta, negocio, vos

        /// Lo que dice arriba. Corto: es un título, no instrucciones.
        var titulo: String {
            switch self {
            case .cuenta:  "Creá tu cuenta"
            case .negocio: "Contanos de tu negocio"
            case .vos:     "Un último detalle"
            }
        }

        var bajada: String {
            switch self {
            case .cuenta:  "Con esto vas a entrar a la app."
            case .negocio: "Así te mostramos lo que más te sirve."
            case .vos:     "Y listo, empezás a vender."
            }
        }
    }

    /// Qué falta en UN paso. `nil` cuando ese paso está completo.
    ///
    /// Se valida paso por paso y no todo junto al final: descubrir en el
    /// tercero que el correo del primero estaba mal obliga a volver, y para
    /// entonces ya nadie se acuerda de qué escribió.
    static func validarPaso(_ paso: Paso, _ d: Datos, hoy: Date = Date()) -> String? {
        switch paso {
        case .cuenta:
            let nombre = d.nombre.trimmingCharacters(in: .whitespaces)
            let partes = nombre.split(whereSeparator: { $0 == " " }).filter { $0.count >= 2 }
            if partes.count < 2 { return "Escribí tu nombre y tu apellido." }

            let correo = d.correo.trimmingCharacters(in: .whitespaces)
            if correo.range(of: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$", options: .regularExpression) == nil {
                return "Revisá el correo: parece que falta algo."
            }
            if d.clave.count < 6 { return "La contraseña necesita al menos 6 caracteres." }
            if d.clave != d.clave2 { return "Las dos contraseñas no son iguales." }
            return nil

        case .negocio:
            if !rubros.contains(d.rubro) { return "Elegí a qué se dedica tu negocio." }
            if !tamanos.contains(d.tamano) { return "Elegí cuántas personas trabajan con vos." }
            return nil

        case .vos:
            // El campo arranca en hoy, que es lo que trae el calendario del
            // sistema. Nadie nace hoy: si sigue ahí es que no lo tocaron.
            if Calendar(identifier: .gregorian).isDate(d.nacimiento, inSameDayAs: hoy) {
                return "Poné tu fecha de nacimiento."
            }
            let anios = edad(d.nacimiento, hoy: hoy)
            if anios < edadMinima { return "Hay que tener al menos \(edadMinima) años para abrir una cuenta." }
            if anios > edadMaxima { return "Revisá el año de nacimiento." }
            if !comoConocio.contains(d.comoConocio) { return "Contanos cómo conociste Zentra." }
            return nil
        }
    }

    /// En qué paso está lo que falta, para volver ahí y no dejar a nadie
    /// buscando un error en una pantalla donde no está.
    static func pasoConFalta(_ d: Datos, hoy: Date = Date()) -> Paso? {
        Paso.allCases.first { validarPaso($0, d, hoy: hoy) != nil }
    }

    /// Qué falta en todo el alta: lo primero que falte, paso por paso. Es lo
    /// que se corre al final, antes de mandar, por si algún paso quedó a
    /// medias. Es `validarRegistro` de `src/lib/registro.ts`.
    static func validar(_ d: Datos, hoy: Date = Date()) -> String? {
        for paso in Paso.allCases {
            if let falta = validarPaso(paso, d, hoy: hoy) { return falta }
        }
        return nil
    }

    /// Lo que viaja a la base. Sin nombre de negocio, la empresa se llama como
    /// la persona: quien vende por su cuenta no tiene nombre comercial, y
    /// pedirle que invente uno para poder entrar es inventarle un trámite.
    static func metadatos(_ d: Datos) -> [String: String] {
        let nombre = d.nombre.trimmingCharacters(in: .whitespaces)
        let empresa = d.empresa.trimmingCharacters(in: .whitespaces)
        return [
            "nombre": nombre,
            "empresa": empresa.isEmpty ? nombre : empresa,
            "nacimiento": fechaISO(d.nacimiento),
            "como_conocio": d.comoConocio,
            "tamano": d.tamano,
            "rubro": d.rubro,
        ]
    }
}

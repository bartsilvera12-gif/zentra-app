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

    struct Datos {
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

    /// Qué falta, en una frase. `nil` cuando está todo.
    ///
    /// Una sola frase y no una lista: en un teléfono, seis errores en rojo al
    /// mismo tiempo no se leen. El orden es el de la pantalla.
    static func validar(_ d: Datos, hoy: Date = Date()) -> String? {
        let nombre = d.nombre.trimmingCharacters(in: .whitespaces)
        let partes = nombre.split(whereSeparator: { $0 == " " }).filter { $0.count >= 2 }
        if partes.count < 2 { return "Escribí tu nombre y tu apellido." }

        let correo = d.correo.trimmingCharacters(in: .whitespaces)
        if correo.range(of: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$", options: .regularExpression) == nil {
            return "Revisá el correo: parece que falta algo."
        }

        // El campo arranca en hoy, que es el valor que trae el calendario del
        // sistema. Nadie nace hoy: si sigue ahí es que no lo tocaron, y
        // decirle "tenés que tener 16 años" a quien no eligió nada lo manda a
        // buscar un error que no cometió.
        if Calendar(identifier: .gregorian).isDate(d.nacimiento, inSameDayAs: hoy) {
            return "Poné tu fecha de nacimiento."
        }
        let anios = edad(d.nacimiento, hoy: hoy)
        if anios < edadMinima { return "Hay que tener al menos \(edadMinima) años para abrir una cuenta." }
        if anios > edadMaxima { return "Revisá el año de nacimiento." }

        if !rubros.contains(d.rubro) { return "Elegí a qué se dedica tu negocio." }
        if !tamanos.contains(d.tamano) { return "Elegí cuántas personas trabajan con vos." }
        if !comoConocio.contains(d.comoConocio) { return "Contanos cómo conociste Zentra." }

        if d.clave.count < 6 { return "La contraseña necesita al menos 6 caracteres." }
        if d.clave != d.clave2 { return "Las dos contraseñas no son iguales." }

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

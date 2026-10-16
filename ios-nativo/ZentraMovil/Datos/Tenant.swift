import Foundation

/// A qué instalación se conecta la app. Port de `src/lib/tenant/`.
struct TenantConfig: Codable, Equatable {
    /// Código normalizado. Vacío para la instalación pública.
    var codigo: String
    var nombre: String
    var supabaseUrl: String
    var anonKey: String
    /// Schema de Postgres. `zentra` por defecto; una instalación sobre un ERP
    /// usa el schema de sus vistas.
    var schema: String
    /// API del ERP de esa empresa. Vacío cae a `Config.apiUrl`.
    var apiUrl: String
    var publico: Bool
    /// Qué puede escribir esta empresa. Vive en el directorio, que es nuestro,
    /// así que agregar planes no obliga a tocar el ERP de ningún cliente.
    /// Con `apiUrl` (ERP propio) el plan no se consulta: tiene todo.
    var plan: Plan = .free
    /// Hasta cuándo está pagado. `nil` es "nunca pagó", que en el plan gratis
    /// no es una deuda sino lo normal.
    var vence: Date?

    static let schemaPropio = "zentra"
}

enum TenantError: LocalizedError {
    case noEncontrado(String)
    case directorioInaccesible
    case respuestaInvalida

    /// Mensaje para mostrar, sin jerga. Port de `mensajeTenantError`.
    var errorDescription: String? {
        switch self {
        case .noEncontrado:
            "No encontramos ese código de empresa. Revisalo e intentá de nuevo."
        case .directorioInaccesible:
            "No pudimos verificar el código. Revisá tu conexión e intentá de nuevo."
        case .respuestaInvalida:
            "Hubo un problema con la configuración de esa empresa. Escribinos por WhatsApp."
        }
    }
}

enum Directorio {
    /// "jm", " JM " y "j-m" resuelven al mismo código.
    static func normalizar(_ entrada: String) -> String {
        entrada.trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()
            .filter { !$0.isWhitespace && $0 != "-" }
    }

    static func publico() -> TenantConfig {
        TenantConfig(
            codigo: "", nombre: "Zentra",
            supabaseUrl: Config.supabaseUrl, anonKey: Config.supabaseAnonKey,
            schema: TenantConfig.schemaPropio,
            // Sin `apiUrl` a propósito. La instalación pública lee de NUESTRAS
            // tablas, no de ningún ERP. Heredar la URL global hacía dos daños:
            // la app contaba a esa cuenta como "con ERP" —y le escondía el
            // plan— y encima le pedía los datos al ERP de otra empresa con un
            // token que ese ERP no reconoce.
            apiUrl: "", publico: true,
            // Quien baja la app de la tienda y no pone código entra en el gratis.
            plan: .free
        )
    }

    /// Resuelve el código. Orden: paquete → red → lo guardado en el dispositivo.
    static func resolver(_ entrada: String) async throws -> TenantConfig {
        let codigo = normalizar(entrada)
        guard !codigo.isEmpty else {
            Guardado.ultimoCodigo = ""
            return publico()
        }

        do {
            let t = try await consultar(codigo)
            Guardado.guardar(t)
            Guardado.ultimoCodigo = codigo
            return t
        } catch let e as TenantError {
            // Un código inexistente es definitivo: la caché no lo va a arreglar.
            if case .noEncontrado = e { throw e }
            // El directorio falló: si este teléfono ya entró con este código, seguimos.
            if let g = Guardado.leer(codigo) {
                Guardado.ultimoCodigo = codigo
                return g
            }
            throw e
        }
    }

    private static func consultar(_ codigo: String) async throws -> TenantConfig {
        // Lo del paquete gana: no depende de la red ni se puede caer.
        if let local = enJson(codigo) { return local }
        if !Config.directorioUrl.isEmpty { return try await porRed(codigo) }
        // Sin directorio configurado, ningún código existe. Nada de códigos de
        // demostración que fallan más tarde culpando a la conexión.
        throw TenantError.noEncontrado(codigo)
    }

    private static func enJson(_ codigo: String) -> TenantConfig? {
        guard !Config.directorioJson.isEmpty,
              let d = Config.directorioJson.data(using: .utf8),
              let mapa = try? JSONSerialization.jsonObject(with: d) as? [String: Any]
        else { return nil }
        for (k, v) in mapa where normalizar(k) == codigo {
            return try? armar(codigo, v)
        }
        return nil
    }

    private static func porRed(_ codigo: String) async throws -> TenantConfig {
        let esArchivo = Config.directorioUrl.lowercased().hasSuffix(".json")
        let txt = esArchivo
            ? Config.directorioUrl
            : "\(Config.directorioUrl)/\(codigo.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? codigo)"
        guard let url = URL(string: txt) else { throw TenantError.respuestaInvalida }

        var req = URLRequest(url: url, timeoutInterval: Config.timeout)
        req.setValue("application/json", forHTTPHeaderField: "Accept")

        let datos: Data
        let resp: URLResponse
        do {
            (datos, resp) = try await URLSession.shared.data(for: req)
        } catch {
            throw TenantError.directorioInaccesible
        }
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        if code == 404 && !esArchivo { throw TenantError.noEncontrado(codigo) }
        guard (200..<300).contains(code) else { throw TenantError.directorioInaccesible }

        let json = try? JSONSerialization.jsonObject(with: datos)
        if !esArchivo { return try armar(codigo, json as Any) }

        guard let mapa = json as? [String: Any] else { throw TenantError.respuestaInvalida }
        for (k, v) in mapa where normalizar(k) == codigo { return try armar(codigo, v) }
        throw TenantError.noEncontrado(codigo)
    }

    /// `2026-11-15` a fecha. Una fecha ilegible se trata como "sin fecha": ante
    /// la duda, no inventar un vencimiento.
    private static func fecha(_ s: String) -> Date? {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = .current
        return f.date(from: String(s.prefix(10)))
    }

    private static func armar(_ codigo: String, _ crudo: Any) throws -> TenantConfig {
        guard let o = crudo as? [String: Any],
              let url = o["supabaseUrl"] as? String, !url.isEmpty,
              let key = o["anonKey"] as? String, !key.isEmpty
        else { throw TenantError.respuestaInvalida }

        let schema = (o["schema"] as? String)?.trimmingCharacters(in: .whitespaces)
        return TenantConfig(
            codigo: codigo,
            nombre: (o["nombre"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? codigo,
            supabaseUrl: url.hasSuffix("/") ? String(url.dropLast()) : url,
            anonKey: key,
            schema: (schema?.isEmpty == false ? schema! : TenantConfig.schemaPropio),
            apiUrl: (o["apiUrl"] as? String) ?? "",
            publico: false,
            // Un plan que no reconocemos se trata como `free`: ante la duda, el
            // que menos deja, no el que más.
            plan: (o["plan"] as? String).flatMap(Plan.init(rawValue:)) ?? .free,
            vence: (o["vence"] as? String).flatMap(fecha)
        )
    }
}

/// Lo guardado en el dispositivo. Port de `tenant/storage.ts`: todo tolera fallar,
/// la app sigue andando y sólo vuelve a pedir el código.
enum Guardado {
    private static let kTenant = "zentra_tenant_v1"
    private static let kUltimo = "zentra_ultimo_codigo_v1"

    static var ultimoCodigo: String {
        get { UserDefaults.standard.string(forKey: kUltimo) ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: kUltimo) }
    }

    static func leer(_ codigo: String) -> TenantConfig? {
        guard let d = UserDefaults.standard.data(forKey: "\(kTenant):\(codigo)") else { return nil }
        return try? JSONDecoder().decode(TenantConfig.self, from: d)
    }

    static func guardar(_ t: TenantConfig) {
        guard let d = try? JSONEncoder().encode(t) else { return }
        UserDefaults.standard.set(d, forKey: "\(kTenant):\(t.codigo)")
    }
}

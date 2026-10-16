import Foundation

/// Cliente de la API del ERP. Port de `src/lib/repo/http.ts`.
///
/// Se usa para leer y escribir contra un ERP existente: registrar una venta ahí
/// no es insertar una fila, es numeración, caja, factura, asiento contable e
/// idempotencia. Esa lógica vive en el ERP y duplicarla la haría divergir.
///
/// La sesión es de Supabase; acá sólo se manda el token.
enum ApiERP {
    /// Gana la URL de la empresa activa sobre la global: un ERP puede atender a
    /// varias empresas desde un dominio, pero mañana un cliente puede tener el
    /// suyo propio y no queremos recompilar para eso.
    static func base() async throws -> String {
        let delTenant = await Auth.shared.tenantActivo()?.apiUrl ?? ""
        let b = delTenant.isEmpty ? Config.apiUrl : delTenant
        guard !b.isEmpty else { throw ApiError.sinApi }
        return normalizar(b)
    }

    /// La base siempre termina en `/api`, y nunca en `/api/api`.
    ///
    /// Port de `urlDeApi` en `config.ts`: el directorio guarda el host pelado
    /// (`https://sistemas.neura.com.py`) y las rutas se escriben sin el prefijo,
    /// igual que en la web. Duplicarlo da un 404 que se lee como "el endpoint no
    /// existe" y manda a buscar el problema al lado equivocado.
    static func normalizar(_ crudo: String) -> String {
        var s = crudo.trimmingCharacters(in: .whitespaces)
        while s.hasSuffix("/") { s = String(s.dropLast()) }
        return s.hasSuffix("/api") ? s : s + "/api"
    }

    /// El JSON tal cual, sin transformar. Evita tener que anotar el genérico en
    /// cada llamada que sólo quiere los datos.
    static func crudo(_ ruta: String, query: [String: String?] = [:]) async throws -> Any {
        try await pedir(ruta, metodo: "GET", query: query, cuerpo: nil)
    }

    static func get<T>(_ ruta: String, query: [String: String?] = [:], _ leer: (Any) throws -> T) async throws -> T {
        try leer(await pedir(ruta, metodo: "GET", query: query, cuerpo: nil))
    }

    @discardableResult
    static func post(_ ruta: String, cuerpo: [String: Any], idempotencia: String? = nil) async throws -> Any {
        try await pedir(ruta, metodo: "POST", query: [:], cuerpo: cuerpo, idempotencia: idempotencia)
    }

    /// Sube un archivo como multipart. El ERP espera el binario en el campo
    /// `file`; el resto de los campos van como texto al lado.
    @discardableResult
    static func subir(
        _ ruta: String, datos: Data, nombre: String, tipo: String,
        campos: [String: String] = [:]
    ) async throws -> Any {
        let b = try await base()
        guard let url = URL(string: b + ruta) else { throw ApiError.sinApi }

        let borde = "Boundary-\(UUID().uuidString)"
        var cuerpo = Data()
        func agregar(_ s: String) { cuerpo.append(s.data(using: .utf8)!) }

        for (k, v) in campos {
            agregar("--\(borde)\r\n")
            agregar("Content-Disposition: form-data; name=\"\(k)\"\r\n\r\n\(v)\r\n")
        }
        agregar("--\(borde)\r\n")
        agregar("Content-Disposition: form-data; name=\"file\"; filename=\"\(nombre)\"\r\n")
        agregar("Content-Type: \(tipo)\r\n\r\n")
        cuerpo.append(datos)
        agregar("\r\n--\(borde)--\r\n")

        var req = URLRequest(url: url, timeoutInterval: 60)
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(borde)", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = await Auth.shared.tokenVigente() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (resp, http): (Data, URLResponse)
        do { (resp, http) = try await URLSession.shared.upload(for: req, from: cuerpo) }
        catch { throw ApiError.sinRed }

        let code = (http as? HTTPURLResponse)?.statusCode ?? 0
        let json = try? JSONSerialization.jsonObject(with: resp)
        guard (200..<300).contains(code) else {
            let o = json as? [String: Any]
            throw ApiError.http(status: code,
                                mensaje: (o?["error"] as? String) ?? (o?["message"] as? String)
                                    ?? "No se pudo enviar el archivo.",
                                ruta: ruta)
        }
        return json ?? [:]
    }

    // MARK: - interno

    private static func pedir(
        _ ruta: String,
        metodo: String,
        query: [String: String?],
        cuerpo: [String: Any]?,
        idempotencia: String? = nil
    ) async throws -> Any {
        let b = try await base()
        guard var comps = URLComponents(string: b + ruta) else { throw ApiError.sinApi }
        let items = query.compactMap { k, v -> URLQueryItem? in
            guard let v, !v.isEmpty else { return nil }
            return URLQueryItem(name: k, value: v)
        }
        if !items.isEmpty { comps.queryItems = items }
        guard let url = comps.url else { throw ApiError.sinApi }

        var req = URLRequest(url: url, timeoutInterval: Config.timeout)
        req.httpMethod = metodo
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = await Auth.shared.tokenVigente() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let cuerpo {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: cuerpo)
        }
        // Si el teléfono pierde señal y se reintenta, el ERP tiene que devolver
        // la misma venta y no crear otra.
        if let idempotencia {
            req.setValue(idempotencia, forHTTPHeaderField: "Idempotency-Key")
        }

        let datos: Data
        let resp: URLResponse
        do {
            (datos, resp) = try await URLSession.shared.data(for: req)
        } catch {
            throw ApiError.sinRed
        }

        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        let json = try? JSONSerialization.jsonObject(with: datos)

        guard (200..<300).contains(code) else {
            let o = json as? [String: Any]
            // El mensaje del ERP se muestra tal cual: dice más que "algo falló".
            let msg = (o?["message"] as? String) ?? (o?["error"] as? String)
            throw ApiError.http(status: code, mensaje: msg ?? "El ERP respondió \(code).", ruta: ruta)
        }
        return json ?? [:]
    }

    /// Saca la lista venga como venga.
    ///
    /// Cada endpoint envuelve distinto y no hay regla: `/clientes` devuelve el
    /// array pelado en `data`, `/productos` lo pone en `data.productos`,
    /// `/ventas` en `data.ventas`. Asumir una sola forma reventaba con
    /// "map is not a function", que no le dice nada a nadie.
    static func comoLista(_ crudo: Any, clave: String, ruta: String) throws -> [[String: Any]] {
        var nivel = crudo
        if let o = nivel as? [String: Any], let dentro = o["data"] { nivel = dentro }
        if let a = nivel as? [[String: Any]] { return a }
        if let o = nivel as? [String: Any], let a = o[clave] as? [[String: Any]] { return a }
        // Nada de devolver [] en silencio: una lista vacía se lee como "no hay",
        // y acá el problema es que la respuesta tiene otra forma.
        throw ApiError.http(
            status: 200,
            mensaje: "El ERP devolvió algo inesperado en \(ruta) (se esperaba una lista o { \(clave): [...] }).",
            ruta: ruta
        )
    }

    /// `GET /api/usuarios/me`. No se llama `/perfil` y no viene envuelto en
    /// `{ success, data }` como el resto: contesta `{ usuario: {...} }`.
    /// Tampoco devuelve el nombre de la empresa, sólo su `data_schema` — el
    /// nombre sale del directorio, que ya lo sabe.
    static func perfil() async throws -> Perfil {
        // Sin ERP, quién sos sale de `zentra.usuarios`, no de una API ajena.
        if ((await Auth.shared.tenantActivo()?.apiUrl) ?? "").isEmpty {
            return try await SupabaseDatos.perfil()
        }
        let crudo = try await pedir("/usuarios/me", metodo: "GET", query: [:], cuerpo: nil)
        let o = (crudo as? [String: Any])?["usuario"] as? [String: Any]
            ?? (crudo as? [String: Any]) ?? [:]

        let email = (o["email"] as? String) ?? ""
        let nombre = (o["nombre"] as? String).flatMap { $0.isEmpty ? nil : $0 }
            ?? (o["name"] as? String).flatMap { $0.isEmpty ? nil : $0 }
            // Sin nombre cargado, el correo antes de la arroba es mejor que vacío.
            ?? String(email.split(separator: "@").first ?? "")

        let empresa = await Auth.shared.tenantActivo()?.nombre ?? ""
        return Perfil(
            id: (o["id"] as? String) ?? "",
            nombre: nombre,
            rol: (o["rol"] as? String) ?? (o["role"] as? String) ?? "",
            empresa: empresa
        )
    }
}

struct Perfil: Equatable {
    var id: String
    var nombre: String
    var rol: String
    var empresa: String
}

enum ApiError: LocalizedError {
    case sinApi
    case sinRed
    /// El usuario existe pero no está en ninguna cola de atención.
    case sinCola
    /// La instalación no tiene ERP, así que no hay WhatsApp que leer.
    case sinChat
    /// El servidor rechazó el token y renovarlo tampoco alcanzó.
    case sesionVencida
    case http(status: Int, mensaje: String, ruta: String)

    var errorDescription: String? {
        switch self {
        case .sinApi:
            "No hay API configurada para esta empresa. Revisá API_URL en Secretos.plist, o el campo apiUrl de esa empresa en el directorio."
        case .sinRed:
            "No pudimos conectar. Revisá tu conexión e intentá de nuevo."
        case .sinChat:
            "Las conversaciones salen del WhatsApp de tu ERP. Esta instalación no tiene uno conectado."
        case .sinCola:
            "Tu usuario no está en ninguna cola de atención, así que no tiene conversaciones asignadas. Pedile a un administrador que te sume."
        case .sesionVencida:
            "Tu sesión venció. Cerrá sesión y volvé a entrar."
        case .http(_, let m, _): m
        }
    }
}

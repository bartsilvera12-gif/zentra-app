import Foundation

/// Autenticación contra Supabase (GoTrue), hablada directo por HTTP.
///
/// No se usa `supabase-swift`: de todo el SDK sólo haría falta esto —entrar,
/// renovar y salir— y son tres `POST`. Sumar el paquete traería PostgREST,
/// Realtime y Storage que no usamos, y ataría el proyecto a su ciclo de
/// versiones para nada.
///
/// La sesión es la misma que valida la API del ERP: `docs/API-ERP.md` dice que la
/// app entra con Supabase Auth y manda ese `access_token` en cada pedido. Así no
/// hay un segundo sistema de contraseñas que mantener.
actor Auth {
    static let shared = Auth()

    struct Sesion: Codable {
        var accessToken: String
        var refreshToken: String
        /// Momento absoluto de vencimiento, no "segundos desde que llegó": si la
        /// app estuvo cerrada, lo segundo no se puede recalcular.
        var venceEn: Date
        var usuarioId: String
        var email: String

        var vencida: Bool { Date() >= venceEn.addingTimeInterval(-60) }
    }

    private var sesion: Sesion?
    private var tenant: TenantConfig?

    private static let kSesion = "zentra.sesion"

    init() {
        if let d = UserDefaults.standard.data(forKey: Self.kSesion) {
            sesion = try? JSONDecoder().decode(Sesion.self, from: d)
        }
    }

    func activar(_ t: TenantConfig) { tenant = t }
    func tenantActivo() -> TenantConfig? { tenant }
    func haySesion() -> Bool { sesion != nil }

    /// El token para mandarle al ERP, renovado si hace falta.
    ///
    /// Supabase renueva el token cada hora. Guardar una copia al entrar y usarla
    /// siempre es el bug que `http.ts` documenta: a la hora todo pedido contesta
    /// 401 y la app parece haber cerrado sesión sola.
    func tokenVigente() async -> String? {
        guard let s = sesion else { return nil }
        if !s.vencida { return s.accessToken }
        return try? await renovar().accessToken
    }

    @discardableResult
    func entrar(usuario: String, clave: String) async throws -> Sesion {
        let json = try await pedir(
            "token?grant_type=password",
            cuerpo: ["email": usuario, "password": clave]
        )
        return try guardarDesde(json)
    }

    @discardableResult
    func renovar() async throws -> Sesion {
        guard let s = sesion else { throw AuthError.sinSesion }
        let json = try await pedir(
            "token?grant_type=refresh_token",
            cuerpo: ["refresh_token": s.refreshToken]
        )
        return try guardarDesde(json)
    }

    /// Alta en la instalación pública. `necesitaConfirmar` es true cuando el
    /// proyecto tiene activada la confirmación por correo: ahí no hay sesión
    /// todavía y hay que avisarle a la persona que revise su casilla.
    /// `datos` son los metadatos ya armados por `Registro.metadatos`. Antes
    /// eran dos parámetros sueltos —nombre y empresa— y cada pregunta nueva
    /// sumaba uno más, en un orden que se puede equivocar sin que nadie avise:
    /// dos `String` seguidos entran igual al revés.
    func registrar(correo: String, clave: String, datos: [String: String])
        async throws -> Bool
    {
        let json = try await pedir("signup", cuerpo: [
            "email": correo.trimmingCharacters(in: .whitespaces),
            "password": clave,
        ], metadatos: datos)

        // Con confirmación activada Supabase devuelve el usuario pero sin token.
        if json["access_token"] is String {
            _ = try guardarDesde(json)
            return false
        }
        return true
    }

    /// Manda el correo con el enlace para poner una contraseña nueva.
    func recuperar(correo: String) async throws {
        _ = try await pedir("recover", cuerpo: [
            "email": correo.trimmingCharacters(in: .whitespaces),
        ])
    }

    func salir() async {
        if let s = sesion {
            _ = try? await pedir("logout", cuerpo: [:], token: s.accessToken)
        }
        sesion = nil
        UserDefaults.standard.removeObject(forKey: Self.kSesion)
        // La próxima instalación puede tener otros precios: dejar los de ésta
        // en memoria haría que la hoja de planes muestre los del anterior.
        SupabaseDatos.olvidarPrecios()
    }

    // MARK: - interno

    private func pedir(
        _ ruta: String,
        cuerpo: [String: String],
        token: String? = nil,
        metadatos: [String: String]? = nil
    ) async throws -> [String: Any] {
        guard let t = tenant, !t.supabaseUrl.isEmpty, !t.anonKey.isEmpty else {
            throw AuthError.sinInstalacion
        }
        guard let url = URL(string: "\(t.supabaseUrl)/auth/v1/\(ruta)") else {
            throw AuthError.sinInstalacion
        }

        var req = URLRequest(url: url, timeoutInterval: Config.timeout)
        req.httpMethod = "POST"
        req.setValue(t.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token ?? t.anonKey)", forHTTPHeaderField: "Authorization")
        var payload: [String: Any] = cuerpo
        // GoTrue guarda esto en `raw_user_meta_data`, que es de donde el
        // disparador de alta saca el nombre y arma la empresa.
        if let metadatos { payload["data"] = metadatos }
        req.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let datos: Data
        let resp: URLResponse
        do {
            (datos, resp) = try await URLSession.shared.data(for: req)
        } catch {
            throw AuthError.sinRed
        }

        let json = (try? JSONSerialization.jsonObject(with: datos)) as? [String: Any] ?? [:]
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            // Supabase manda el motivo en distintas claves según el error.
            let msg = (json["error_description"] as? String)
                ?? (json["msg"] as? String)
                ?? (json["message"] as? String)
                ?? (json["error"] as? String)
            throw AuthError.rechazado(traducir(msg, code: code))
        }
        return json
    }

    private func guardarDesde(_ json: [String: Any]) throws -> Sesion {
        guard let access = json["access_token"] as? String,
              let refresh = json["refresh_token"] as? String
        else { throw AuthError.rechazado("Supabase no devolvió una sesión.") }

        let segundos = (json["expires_in"] as? Double) ?? 3600
        let user = json["user"] as? [String: Any]

        let s = Sesion(
            accessToken: access,
            refreshToken: refresh,
            venceEn: Date().addingTimeInterval(segundos),
            usuarioId: (user?["id"] as? String) ?? "",
            email: (user?["email"] as? String) ?? ""
        )
        sesion = s
        if let d = try? JSONEncoder().encode(s) {
            UserDefaults.standard.set(d, forKey: Self.kSesion)
        }
        return s
    }

    /// Mensajes que le sirvan a un vendedor, no el texto crudo de GoTrue.
    private nonisolated func traducir(_ msg: String?, code: Int) -> String {
        let m = (msg ?? "").lowercased()
        if m.contains("invalid login") || m.contains("invalid credentials") || code == 400 {
            return "Usuario o contraseña incorrectos."
        }
        if m.contains("email not confirmed") {
            return "Tu cuenta todavía no está confirmada. Revisá tu correo."
        }
        // Supabase tiene la confirmación por correo prendida y no puede mandarlo
        // —sin SMTP, o con uno que falla—. No es culpa de quien se registra, y
        // el texto crudo de GoTrue no le dice a nadie qué hacer.
        if m.contains("error sending confirmation") || m.contains("error sending email") {
            return "No pudimos mandarte el correo de confirmación. Es un problema de configuración nuestro, no tuyo: escribinos y lo resolvemos."
        }
        if m.contains("already registered") || m.contains("already exists") {
            return "Ya hay una cuenta con ese correo. Probá entrar, o recuperá tu contraseña."
        }
        if m.contains("password") && m.contains("short") {
            return "La contraseña es muy corta. Poné al menos 6 caracteres."
        }
        if code == 429 { return "Demasiados intentos. Esperá un momento." }
        return msg?.isEmpty == false ? msg! : "No pudimos validar tus datos."
    }
}

enum AuthError: LocalizedError {
    case sinInstalacion
    case sinSesion
    case sinRed
    case rechazado(String)

    var errorDescription: String? {
        switch self {
        case .sinInstalacion:
            "Esta instalación no tiene Supabase configurado. Revisá Secretos.plist o el directorio."
        case .sinSesion: "No hay sesión iniciada."
        case .sinRed: "No pudimos conectar. Revisá tu conexión e intentá de nuevo."
        case .rechazado(let m): m
        }
    }
}

import Foundation

/// Configuración por entorno. Port de `src/lib/config.ts`.
///
/// En la web esto sale de `.env.local` y Next lo hornea en el bundle. Acá sale de
/// `Secretos.plist`, que **no se versiona** — está en `.gitignore` igual que
/// `.env.local`. Hay un `Secretos.ejemplo.plist` al lado con la forma.
///
/// Lo mismo que avisa `.env.example` vale acá: todo esto viaja dentro del `.ipa`
/// y un `.ipa` se puede abrir. Van la URL y la **anon key** de Supabase, que son
/// públicas por diseño y se protegen con RLS del lado del servidor. Nunca una
/// clave de servicio ni credenciales de base.
enum Config {
    private static let plist: [String: Any] = {
        guard let url = Bundle.main.url(forResource: "Secretos", withExtension: "plist"),
              let d = try? Data(contentsOf: url),
              let p = try? PropertyListSerialization.propertyList(from: d, format: nil)
                as? [String: Any]
        else { return [:] }
        return p
    }()

    private static func texto(_ clave: String) -> String {
        (plist[clave] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    /// URL base de la API del ERP, sin barra final. Ej: `https://api.neura.com.py`
    static var apiUrl: String { sinBarra(texto("API_URL")) }

    /// Supabase de la instalación pública (quien baja la app y se registra).
    static var supabaseUrl: String { sinBarra(texto("SUPABASE_URL")) }
    static var supabaseAnonKey: String { texto("SUPABASE_ANON_KEY") }

    /// Directorio escrito en el paquete: `{"NEURA": {...}}`. Gana sobre el de red.
    static var directorioJson: String { texto("DIRECTORIO_JSON") }
    static var directorioUrl: String { sinBarra(texto("DIRECTORIO_URL")) }

    /// WhatsApp de soporte, sólo dígitos. Vacío oculta los enlaces.
    static var soporteWhatsapp: String {
        texto("SOPORTE_WHATSAPP").filter(\.isNumber)
    }

    static var timeout: TimeInterval { 15 }

    /// true cuando no hay nada configurado: la app no puede entrar a ningún lado.
    static var sinConfigurar: Bool {
        supabaseUrl.isEmpty && directorioJson.isEmpty && directorioUrl.isEmpty
    }

    static func linkWhatsapp(_ mensaje: String) -> URL? {
        guard !soporteWhatsapp.isEmpty else { return nil }
        let t = mensaje.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return URL(string: "https://wa.me/\(soporteWhatsapp)?text=\(t)")
    }

    private static func sinBarra(_ s: String) -> String {
        s.hasSuffix("/") ? String(s.dropLast()) : s
    }
}

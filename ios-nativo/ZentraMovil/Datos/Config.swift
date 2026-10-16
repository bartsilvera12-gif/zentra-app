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

    /// Dónde se paga el plan. Vacío esconde el botón en vez de mandar a una
    /// página que no existe.
    static var cobrosUrl: String { sinBarra(texto("COBROS_URL")) }

    /// Si la app puede mostrar el camino al pago.
    ///
    /// **Apagado salvo que se encienda a mano, y a propósito.** Las dos
    /// tiendas prohíben que una app dirija a pagar afuera —ni botón, ni
    /// enlace, ni mencionar la dirección— y Paraguay no entra en la excepción
    /// que abrieron para EE.UU., Reino Unido y el Espacio Económico Europeo.
    /// Un botón así es rechazo en revisión.
    ///
    /// El valor por defecto es el seguro: olvidarse de apagarlo cuesta una
    /// vuelta de revisión, que son días. Olvidarse de encenderlo, en un canal
    /// donde sí se puede, no cuesta nada.
    ///
    /// Es el mismo interruptor que `NEXT_PUBLIC_LINK_DE_PAGO` en Android, que
    /// allá va en `0` para la compilación de Play y encendido para el APK que
    /// se reparte por fuera. En iOS no hay "por fuera": no se puede instalar
    /// una app sin pasar por Apple, así que en la práctica queda apagado.
    ///
    /// Lo que la app **sí** puede hacer es mostrar los planes y lo que incluye
    /// cada uno. Informar no está prohibido; dirigir a comprar, sí.
    static var mostrarLinkDePago: Bool {
        ["1", "true", "si", "sí"].contains(texto("LINK_DE_PAGO").lowercased())
    }

    static var linkDePago: URL? {
        guard mostrarLinkDePago, !cobrosUrl.isEmpty else { return nil }
        return URL(string: cobrosUrl + "/pagar")
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

import CoreLocation

/// Mandar la ubicación por el chat. Port de `src/lib/ubicacion.ts`.
///
/// WhatsApp tiene un tipo de mensaje "ubicación" —el mapita con el pin— pero el
/// ERP todavía no lo sabe mandar: su endpoint acepta texto, media y stickers, y
/// nada más. Así que la ubicación viaja como lo que sí llega siempre: un enlace
/// de mapa. Del otro lado se toca y abre el mapa del teléfono, que es para lo
/// que se manda.
///
/// Cuando el ERP tenga por dónde, esto cambia en un solo lugar.
@Observable
final class Ubicacion: NSObject, CLLocationManagerDelegate {
    struct Posicion {
        var lat: Double
        var lng: Double
    }

    private let gestor = CLLocationManager()
    private var esperando: CheckedContinuation<Posicion, Error>?

    override init() {
        super.init()
        gestor.delegate = self
        gestor.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    }

    /// Dónde estoy. Pide el permiso la primera vez.
    func actual() async throws -> Posicion {
        let estado = gestor.authorizationStatus
        if estado == .denied || estado == .restricted {
            throw UbicacionError.sinPermiso
        }
        if estado == .notDetermined {
            gestor.requestWhenInUseAuthorization()
        }
        return try await withCheckedThrowingContinuation { c in
            esperando = c
            gestor.requestLocation()
        }
    }

    func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        guard let l = locs.last else { return }
        esperando?.resume(returning: Posicion(lat: l.coordinate.latitude,
                                              lng: l.coordinate.longitude))
        esperando = nil
    }

    func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {
        esperando?.resume(throwing: UbicacionError.noSePudo)
        esperando = nil
    }

    /// Seis decimales: ~11 cm. Más es ruido del GPS escrito como si fuera dato,
    /// y de paso el enlace queda legible.
    private static func coordenada(_ n: Double) -> String {
        var s = String(format: "%.6f", n)
        while s.hasSuffix("0") { s.removeLast() }
        if s.hasSuffix(".") { s.removeLast() }
        return s
    }

    /// El enlace de mapa, con el formato que entienden los tres: Google Maps,
    /// el mapa de Android y el de iPhone.
    static func enlaceDeMapa(_ p: Posicion) -> String {
        "https://www.google.com/maps?q=\(coordenada(p.lat)),\(coordenada(p.lng))"
    }

    /// El mensaje tal como lo va a leer el cliente.
    ///
    /// Con el pin adelante para que se entienda de un vistazo qué es, incluso
    /// en la notificación, donde no se ve más que la primera línea.
    static func texto(_ p: Posicion) -> String {
        "📍 Mi ubicación: \(enlaceDeMapa(p))"
    }
}

enum UbicacionError: LocalizedError {
    case sinPermiso
    case noSePudo

    var errorDescription: String? {
        switch self {
        case .sinPermiso:
            "Necesitamos permiso para usar la ubicación."
        case .noSePudo:
            "No pudimos tomar tu ubicación. Probá de nuevo al aire libre."
        }
    }
}

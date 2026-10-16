import SwiftUI
import UIKit

/// Zentra Móvil — versión nativa para iOS.
///
/// Misma app que el APK de Android (que es Capacitor envolviendo `src/`), pero
/// escrita en SwiftUI. La paridad visual se sostiene portando los tokens de
/// `src/lib/theme.ts` literalmente; lo único que a propósito NO se replica es la
/// barra de abajo, que acá es la nativa con Liquid Glass. Ver `RaizView.swift`.
@main
struct ZentraMovilApp: App {
    /// Hace falta un delegado aunque la app sea toda SwiftUI: el token de APNs
    /// llega por un método de `UIApplicationDelegate` y no hay equivalente en
    /// SwiftUI. Es el único motivo por el que existe.
    @UIApplicationDelegateAdaptor(Delegado.self) private var delegado

    var body: some Scene {
        WindowGroup {
            RaizView()
        }
    }
}

final class Delegado: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions opciones: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        MainActor.assumeIsolated { Push.shared.arrancar() }
        return true
    }

    /// Apple entregó el token del teléfono.
    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken token: Data) {
        MainActor.assumeIsolated { Push.shared.recibioAPNs(token) }
    }

    /// No registrarse es una respuesta válida —sin señal, sin permiso, en el
    /// simulador—, y la app tiene que seguir andando sin avisos. Queda en el
    /// log para poder verlo cuando alguien reporte que no le llegan.
    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("[push] no se pudo registrar: \(error.localizedDescription)")
    }
}

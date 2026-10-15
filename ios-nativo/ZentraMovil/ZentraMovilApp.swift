import SwiftUI

/// Zentra Móvil — versión nativa para iOS.
///
/// Misma app que el APK de Android (que es Capacitor envolviendo `src/`), pero
/// escrita en SwiftUI. La paridad visual se sostiene portando los tokens de
/// `src/lib/theme.ts` literalmente; lo único que a propósito NO se replica es la
/// barra de abajo, que acá es la nativa con Liquid Glass. Ver `RaizView.swift`.
@main
struct ZentraMovilApp: App {
    var body: some Scene {
        WindowGroup {
            RaizView()
        }
    }
}

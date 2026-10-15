import SwiftUI

/// Preferencias del usuario que viven en el dispositivo.
///
/// Equivale a lo que la web guarda en el store (`src/store/state.ts`): el tema
/// arranca en `claro` y no sigue al teléfono, salvo que se pida explícitamente.
/// Ese default es a propósito — es el mismo de Android, y la idea es que la app
/// se vea igual en los dos lados salvo que alguien decida otra cosa.
@Observable
final class Ajustes {
    enum Tema: String {
        case claro, oscuro
    }

    var tema: Tema {
        didSet { UserDefaults.standard.set(tema.rawValue, forKey: Self.kTema) }
    }

    /// Cuando está prendido, manda el modo del teléfono y `tema` se ignora.
    var seguirSistema: Bool {
        didSet { UserDefaults.standard.set(seguirSistema, forKey: Self.kSeguir) }
    }

    /// Preferencias de avisos. Se guardan igual que el tema; el envío todavía
    /// no existe (falta la clave APNs en Firebase y el servidor que dispara).
    var push = false { didSet { g(push, "push") } }
    var stockBajo = true { didSet { g(stockBajo, "stockBajo") } }
    var resumenDiario = false { didSet { g(resumenDiario, "resumenDiario") } }
    var sonido = true { didSet { g(sonido, "sonido") } }

    private func g(_ v: Bool, _ k: String) {
        UserDefaults.standard.set(v, forKey: "zentra.\(k)")
    }

    private static let kTema = "zentra.tema"
    private static let kSeguir = "zentra.seguirSistema"

    init() {
        let guardado = UserDefaults.standard.string(forKey: Self.kTema)
        tema = Tema(rawValue: guardado ?? "") ?? .claro
        // Arranca siguiendo al teléfono, como Android desde `auto: true`.
        // Elegir un tema a mano apaga el seguimiento, que es lo que esa
        // elección quiere decir.
        seguirSistema = UserDefaults.standard.object(forKey: Self.kSeguir) as? Bool ?? true
        let d = UserDefaults.standard
        push = d.bool(forKey: "zentra.push")
        stockBajo = d.object(forKey: "zentra.stockBajo") as? Bool ?? true
        resumenDiario = d.bool(forKey: "zentra.resumenDiario")
        sonido = d.object(forKey: "zentra.sonido") as? Bool ?? true
    }

    /// Qué tema corresponde, ya resuelto contra el del sistema si hace falta.
    func resuelto(sistema: ColorScheme) -> Tema {
        if seguirSistema {
            return sistema == .dark ? .oscuro : .claro
        }
        return tema
    }

    func tokens(sistema: ColorScheme) -> TemaTokens {
        resuelto(sistema: sistema) == .oscuro ? .oscuro : .claro
    }
}

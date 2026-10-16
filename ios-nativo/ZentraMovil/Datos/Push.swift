import FirebaseCore
import FirebaseMessaging
import UIKit

/// El registro del teléfono para recibir avisos del ERP.
///
/// Son dos tokens y conviene no confundirlos:
///
///   - El de **APNs**, que da Apple y que identifica a este teléfono ante sus
///     servidores. No se manda a ningún lado nuestro.
///   - El de **FCM**, que da Firebase a cambio del anterior. Ése es el que
///     guarda el ERP, porque es por Firebase que manda los avisos.
///
/// El token cambia solo: al reinstalar la app, al restaurar el teléfono desde
/// una copia, y Firebase lo rota por su cuenta cada tanto. Por eso se vuelve a
/// guardar en cada arranque y cada vez que Firebase avisa que cambió, en vez
/// de guardarlo una vez y darlo por hecho.
///
/// **Un token sacado en un build de Xcode no sirve en TestFlight**: son dos
/// entornos distintos de APNs, y el `aps-environment` del entitlement decide
/// cuál. Probar con cable no demuestra que ande en TestFlight.
@MainActor
final class Push: NSObject, MessagingDelegate, UNUserNotificationCenterDelegate {
    static let shared = Push()

    /// A quién avisarle cuando llega un token nuevo.
    var alLlegarToken: ((String) -> Void)?

    private var arrancado = false

    /// Arranca Firebase y pide el token. Sin permiso no hace nada.
    ///
    /// No pide el permiso: eso lo decide la pantalla de Configuración, que es
    /// donde la persona prendió el interruptor. Acá sólo se registra si ya
    /// está dado; pedirlo al arrancar gasta el único diálogo que da iOS en un
    /// momento en que nadie entiende para qué.
    func arrancar() {
        guard !arrancado else { return }
        arrancado = true

        // `GoogleService-Info.plist` no se versiona, igual que `Secretos.plist`.
        // Sin él, Firebase no arranca y la app sigue andando sin avisos — que
        // es mejor que no arrancar.
        guard FirebaseApp.app() != nil || Bundle.main.url(
            forResource: "GoogleService-Info", withExtension: "plist") != nil
        else { return }
        if FirebaseApp.app() == nil { FirebaseApp.configure() }

        Messaging.messaging().delegate = self
        UNUserNotificationCenter.current().delegate = self
    }

    /// Se llama cuando el permiso ya está dado.
    func registrar() {
        arrancar()
        UIApplication.shared.registerForRemoteNotifications()
    }

    /// Apple contestó con el token del teléfono: se lo pasamos a Firebase, que
    /// a cambio nos da el suyo por `messaging(_:didReceiveRegistrationToken:)`.
    func recibioAPNs(_ token: Data) {
        Messaging.messaging().apnsToken = token
    }

    nonisolated func messaging(_ messaging: Messaging,
                               didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken, !fcmToken.isEmpty else { return }
        Task { @MainActor in self.alLlegarToken?(fcmToken) }
    }

    /// Con la app abierta, iOS no muestra el aviso salvo que se lo pidan.
    /// Se muestra igual: un mensaje nuevo mientras mirás otra pantalla de la
    /// app es exactamente lo que hay que avisar.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .badge]
    }
}

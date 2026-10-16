import AVFoundation
import Foundation
import Observation

/// Grabar una nota de voz. Port de `Grabador` en `src/lib/grabador.ts`.
///
/// Graba en m4a (AAC) porque es lo que WhatsApp acepta sin reconvertir. En la
/// web el equivalente sale en webm/opus y el ERP lo transcodifica; acá no hace
/// falta, y menos conversión es menos cosas que se rompen en el camino.
@MainActor
@Observable
final class Grabador {
    /// Está grabando ahora.
    private(set) var grabando = false
    /// Cuántos segundos lleva. Es lo que muestra el contador de la barra.
    private(set) var segundos = 0

    @ObservationIgnored private var grabadora: AVAudioRecorder?
    @ObservationIgnored private var reloj: Task<Void, Never>?
    @ObservationIgnored private var archivo: URL?

    struct Grabado {
        var url: URL
        var nombre: String
        var segundos: Int
    }

    /// Pide el micrófono y empieza.
    ///
    /// Tira si no hay permiso. Negarlo es una respuesta válida, no un error que
    /// haya que esconder: quien llama lo convierte en un aviso.
    func arrancar() async throws {
        guard await AVAudioApplication.requestRecordPermission() else {
            throw ErrorGrabador.sinPermiso
        }

        let sesion = AVAudioSession.sharedInstance()
        try sesion.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
        try sesion.setActive(true)

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("nota-\(Int(Date().timeIntervalSince1970)).m4a")
        let g = try AVAudioRecorder(url: url, settings: [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            // Mono y 32 kbps: es una voz, no música. Un minuto pesa ~240 KB,
            // que es lo que hace que llegue con señal de datos mala.
            AVSampleRateKey: 44_100,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 32_000,
        ])
        g.record()

        grabadora = g
        archivo = url
        segundos = 0
        grabando = true

        reloj = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                guard let self, self.grabando else { return }
                self.segundos += 1
            }
        }
    }

    /// Corta y devuelve lo grabado, o `nil` si no alcanzó a grabar nada.
    ///
    /// El piso de un segundo es para el toque sin querer: sin esto, rozar el
    /// botón manda un audio vacío que el otro abre para no escuchar nada.
    func detener() -> Grabado? {
        let dur = segundos
        limpiar()
        guard let url = archivo, dur >= 1 else { descartarArchivo(); return nil }
        archivo = nil
        return Grabado(url: url, nombre: url.lastPathComponent, segundos: dur)
    }

    /// Corta y tira lo grabado.
    func cancelar() {
        limpiar()
        descartarArchivo()
    }

    private func limpiar() {
        reloj?.cancel()
        reloj = nil
        grabadora?.stop()
        grabadora = nil
        grabando = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func descartarArchivo() {
        if let url = archivo { try? FileManager.default.removeItem(at: url) }
        archivo = nil
        segundos = 0
    }

    enum ErrorGrabador: LocalizedError {
        case sinPermiso
        var errorDescription: String? {
            switch self {
            case .sinPermiso: "Necesitamos permiso para usar el micrófono."
            }
        }
    }

    /// `m:ss`, que es como se lee una nota de voz.
    static func reloj(_ seg: Int) -> String {
        String(format: "%d:%02d", seg / 60, seg % 60)
    }
}

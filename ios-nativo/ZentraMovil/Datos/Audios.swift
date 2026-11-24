import AVFoundation
import Foundation

/// El reproductor de notas de voz de toda la app. Uno solo, y vive acá.
///
/// Antes cada burbuja tenía su propio `AVPlayer`, creado al aparecer la fila y
/// destruido en `onDisappear`. La lista del chat es perezosa y se refresca
/// sola, así que la fila se desarmaba mientras el audio sonaba —al scrollear,
/// o al llegar un mensaje nuevo— y el audio se cortaba en el medio. Era el
/// reporte de "los audios se cortan": no es el archivo, es que se apagaba el
/// aparato.
///
/// Sacarlo de la vista arregla eso y además da lo que se espera: la nota sigue
/// sonando mientras uno scrollea o mira otra pantalla, y suena una sola a la
/// vez. Empezar otra apaga la anterior, como en WhatsApp.
@MainActor
@Observable
final class Audios {
    static let shared = Audios()
    private init() {}

    /// Cuál se está escuchando. `nil` = ninguna.
    private(set) var actual: URL?
    private(set) var sonando = false
    private(set) var posicion: Double = 0
    private(set) var duracion: Double = 0

    private var reproductor: AVPlayer?
    private var observadorTiempo: Any?
    private var observadorFin: NSObjectProtocol?
    private var observadorEstado: NSKeyValueObservation?
    /// Las que no se pudieron abrir, para que la burbuja ofrezca compartirlas
    /// en vez de un botón de play que no hace nada.
    private(set) var fallidas: Set<URL> = []

    func esActual(_ url: URL) -> Bool { actual == url }
    func suena(_ url: URL) -> Bool { sonando && actual == url }
    func fallo(_ url: URL) -> Bool { fallidas.contains(url) }

    /// Cuánto de esa nota se escuchó, de 0 a 1. Para las que no se están
    /// escuchando es 0: la barra arranca de cero.
    func progreso(_ url: URL) -> Double {
        guard actual == url, duracion > 0 else { return 0 }
        return min(1, max(0, posicion / duracion))
    }

    /// Los segundos que muestra la burbuja: lo corrido si es la que suena, y
    /// el total —que la propia burbuja mide— si no.
    func segundos(_ url: URL) -> Double? {
        guard actual == url else { return nil }
        return posicion > 0 ? posicion : duracion
    }

    func alternar(_ url: URL, duracionConocida: Double = 0) {
        if actual == url {
            if sonando {
                reproductor?.pause()
                sonando = false
            } else {
                reproductor?.play()
                sonando = true
            }
            return
        }
        preparar(url, duracionConocida: duracionConocida)
        reproductor?.play()
        sonando = true
    }

    func buscar(_ url: URL, a fraccion: Double, duracionConocida: Double = 0) {
        if actual != url { preparar(url, duracionConocida: duracionConocida) }
        guard duracion > 0 else { return }
        let destino = CMTime(seconds: fraccion * duracion, preferredTimescale: 600)
        reproductor?.seek(to: destino, toleranceBefore: .zero, toleranceAfter: .zero)
        posicion = fraccion * duracion
    }

    private func preparar(_ url: URL, duracionConocida: Double) {
        soltar()
        // Sin esto el audio queda mudo con el teléfono en silencio.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        try? AVAudioSession.sharedInstance().setActive(true)

        actual = url
        posicion = 0
        duracion = duracionConocida

        let item = AVPlayerItem(url: url)
        observadorEstado = item.observe(\.status) { [weak self] it, _ in
            let estado = it.status
            let d = it.duration.seconds
            Task { @MainActor in
                guard let self, self.actual == url else { return }
                if estado == .failed {
                    self.fallidas.insert(url)
                    self.sonando = false
                } else if estado == .readyToPlay, d.isFinite, d > 0 {
                    self.duracion = d
                }
            }
        }
        let p = AVPlayer(playerItem: item)
        observadorTiempo = p.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.2, preferredTimescale: 600),
            queue: .main
        ) { [weak self] t in
            MainActor.assumeIsolated {
                guard let self, self.actual == url else { return }
                self.posicion = t.seconds
            }
        }
        observadorFin = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.actual == url else { return }
                self.sonando = false
                self.posicion = 0
                self.reproductor?.seek(to: .zero)
            }
        }
        reproductor = p
    }

    /// Apaga y desengancha todo. No toca `fallidas`: que un archivo no se pueda
    /// abrir no cambia porque se haya dejado de escuchar.
    private func soltar() {
        reproductor?.pause()
        if let o = observadorTiempo { reproductor?.removeTimeObserver(o) }
        if let o = observadorFin { NotificationCenter.default.removeObserver(o) }
        observadorTiempo = nil
        observadorFin = nil
        observadorEstado = nil
        reproductor = nil
        sonando = false
        actual = nil
        posicion = 0
        duracion = 0
    }
}

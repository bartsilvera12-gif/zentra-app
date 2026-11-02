import AVFoundation
import AVKit
import SwiftUI

/// Reproductor de las notas de voz, portado del chat de Zentra Dev.
///
/// Antes acá un audio era un rótulo que decía "Audio": se veía que había llegado
/// uno y no había forma de escucharlo. Es de lo que más manda un cliente.
///
/// La barra es lisa y no una forma de onda: la onda real exige decodificar el
/// archivo entero y no ayuda en nada a escuchar una nota de voz.

struct ReproductorAudio: View {
    let url: URL
    var claro = false
    /// Se enciende mientras el dedo mueve la barra, para que la burbuja no lo tome como
    /// deslizar-para-citar.
    var avisarArrastre: Binding<Bool>? = nil

    @State private var reproductor: AVPlayer?
    @State private var sonando = false
    @State private var fallo = false
    @State private var progreso: Double = 0
    @State private var duracion: Double = 0
    @State private var posicion: Double = 0
    @State private var observadorEstado: NSKeyValueObservation?
    @State private var observadorTiempo: Any?
    /// Mientras se arrastra, el progreso lo manda el dedo y no el reproductor.
    @State private var arrastrando = false

    private var tinte: Color { claro ? .white : .primary }

    var body: some View {
        Group {
            if fallo {
                ShareLink(item: url) {
                    HStack(spacing: 9) {
                        Image(systemName: "exclamationmark.circle.fill").font(.system(size: 26))
                        VStack(alignment: .leading, spacing: 1) {
                            Text("No se puede reproducir acá").font(Tipo.barlow(.semibold, 13))
                            Text("Tocá para abrirlo").font(Tipo.barlow(.regular, 11)).opacity(0.75)
                        }
                    }
                }
                .buttonStyle(.plain)
            } else {
                // Una sola fila: botón, barra y tiempo. Antes el tiempo iba abajo del track
                // y la barra no llegaba al borde, así que quedaba desbalanceado y alto.
                HStack(spacing: 9) {
                    Button(action: alternar) {
                        Image(systemName: sonando ? "pause.fill" : "play.fill")
                            .font(.system(size: 11, weight: .black))
                            .foregroundStyle(claro ? C.cian : .white)
                            .frame(width: 26, height: 26)
                            .background(Circle().fill(claro ? Color.white : C.cian))
                    }
                    .buttonStyle(.plain)

                    // Barra simple, no forma de onda: la onda real exige decodificar el
                    // archivo entero y no aporta nada para escuchar una nota de voz.
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(tinte.opacity(0.3))
                            Capsule().fill(tinte).frame(width: geo.size.width * progreso)
                        }
                        .frame(height: 2.5)
                        .frame(maxHeight: .infinity, alignment: .center)
                        // Perilla: sin algo que agarrar, nadie descubre que se puede mover.
                        .overlay(alignment: .leading) {
                            Circle()
                                .fill(tinte)
                                .frame(width: arrastrando ? 13 : 9, height: arrastrando ? 13 : 9)
                                .offset(x: geo.size.width * progreso - (arrastrando ? 6.5 : 4.5))
                                .animation(.snappy(duration: 0.15), value: arrastrando)
                        }
                        // Toda la altura de la fila responde, no sólo los 2.5pt de la barra.
                        .contentShape(Rectangle())
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { g in
                                    guard geo.size.width > 0 else { return }
                                    arrastrando = true
                                    avisarArrastre?.wrappedValue = true
                                    progreso = min(1, max(0, g.location.x / geo.size.width))
                                    if duracion > 0 { posicion = progreso * duracion }
                                }
                                .onEnded { _ in
                                    arrastrando = false
                                    avisarArrastre?.wrappedValue = false
                                    buscar(a: progreso)
                                }
                        )
                    }
                    .frame(height: 26)

                    Text(tiempoMostrado)
                        .font(Tipo.barlow(.regular, 11).monospacedDigit())
                        .opacity(0.75)
                        .frame(width: 34, alignment: .trailing)
                }
                // Llena el ancho que le den en vez de medir 200 fijo: la burbuja se estira
                // por la fila de la hora, y con ancho fijo el reproductor quedaba pegado a
                // la izquierda con un hueco al costado.
                .frame(maxWidth: .infinity)
            }
        }
        .foregroundStyle(tinte)
        .padding(.vertical, 2)
        .task { await cargarDuracion() }
        .onDisappear { detener() }
    }

    private var tiempoMostrado: String {
        let s = sonando || posicion > 0 ? posicion : duracion
        guard s.isFinite, s > 0 else { return "0:00" }
        let t = Int(s)
        return String(format: "%d:%02d", t / 60, t % 60)
    }

    /// La duración se lee del archivo al aparecer. Antes salía de `AVPlayerItem.duration`,
    /// que recién está lista cuando el item pasa a `readyToPlay` — o sea después de tocar
    /// play: hasta entonces todas las notas mostraban 0:00.
    private func cargarDuracion() async {
        guard duracion == 0 else { return }
        let asset = AVURLAsset(url: url)
        if let d = try? await asset.load(.duration), d.seconds.isFinite, d.seconds > 0 {
            duracion = d.seconds
        }
    }

    /// Lleva la reproducción a una fracción del total. Prepara el reproductor si hace falta,
    /// así se puede elegir desde dónde escuchar sin haber tocado play antes.
    private func buscar(a fraccion: Double) {
        guard duracion > 0 else { return }
        if reproductor == nil { preparar() }
        let destino = CMTime(seconds: fraccion * duracion, preferredTimescale: 600)
        reproductor?.seek(to: destino, toleranceBefore: .zero, toleranceAfter: .zero)
        posicion = fraccion * duracion
    }

    private func alternar() {
        if sonando {
            reproductor?.pause()
            sonando = false
            return
        }
        if reproductor == nil { preparar() }
        reproductor?.play()
        sonando = true
    }

    private func preparar() {
        // Sin esto el audio queda mudo con el teléfono en silencio.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        try? AVAudioSession.sharedInstance().setActive(true)

        let item = AVPlayerItem(url: url)
        observadorEstado = item.observe(\.status) { it, _ in
            Task { @MainActor in
                if it.status == .failed {
                    fallo = true
                    sonando = false
                } else if it.status == .readyToPlay {
                    let d = it.duration.seconds
                    if d.isFinite, d > 0 { duracion = d }
                }
            }
        }
        let p = AVPlayer(playerItem: item)
        observadorTiempo = p.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.2, preferredTimescale: 600),
            queue: .main
        ) { t in
            guard !arrastrando else { return }
            posicion = t.seconds
            if duracion > 0 { progreso = min(1, t.seconds / duracion) }
        }
        // Al terminar vuelve al principio, listo para escucharla de nuevo.
        NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { _ in
            Task { @MainActor in
                sonando = false
                progreso = 0
                posicion = 0
                p.seek(to: .zero)
            }
        }
        reproductor = p
    }

    private func detener() {
        reproductor?.pause()
        if let o = observadorTiempo { reproductor?.removeTimeObserver(o) }
        observadorTiempo = nil
        observadorEstado = nil
        reproductor = nil
        sonando = false
    }
}

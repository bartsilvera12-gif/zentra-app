import AVFoundation
import SwiftUI

/// Las notas de voz en el chat, portado del chat de Zentra Dev.
///
/// Esta vista sólo dibuja y recibe los toques: quien reproduce es `Audios`, que
/// vive fuera de la pantalla. Antes el `AVPlayer` era de la burbuja y moría con
/// ella —`onDisappear`—, así que scrollear o recibir un mensaje cortaba el
/// audio en el medio. Ahora la fila puede desarmarse y la nota sigue sonando.
///
/// La barra es lisa y no una forma de onda: la onda real exige decodificar el
/// archivo entero y no ayuda en nada a escuchar una nota de voz.
struct ReproductorAudio: View {
    let url: URL
    var claro = false
    /// Se enciende mientras el dedo mueve la barra, para que la burbuja no lo tome como
    /// deslizar-para-citar.
    var avisarArrastre: Binding<Bool>? = nil

    private var audios = Audios.shared
    /// El total medido del archivo, para mostrar los segundos antes de tocar
    /// play. Es de la burbuja porque cada burbuja muestra el suyo, aunque esté
    /// sonando otra.
    @State private var duracion: Double = 0
    /// Mientras se arrastra, el progreso lo manda el dedo y no el reproductor.
    @State private var arrastrando = false
    @State private var arrastre: Double = 0

    private var tinte: Color { claro ? .white : .primary }
    private var sonando: Bool { audios.suena(url) }
    private var progreso: Double {
        arrastrando ? arrastre : (audios.esActual(url) ? audios.progreso(url) : 0)
    }

    var body: some View {
        Group {
            if audios.fallo(url) {
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
                    Button { audios.alternar(url, duracionConocida: duracion) } label: {
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
                                    arrastre = min(1, max(0, g.location.x / geo.size.width))
                                }
                                .onEnded { _ in
                                    avisarArrastre?.wrappedValue = false
                                    audios.buscar(url, a: arrastre, duracionConocida: duracion)
                                    arrastrando = false
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
    }

    private var tiempoMostrado: String {
        let s = audios.segundos(url) ?? duracion
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
}

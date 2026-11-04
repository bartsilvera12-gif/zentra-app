import AVFoundation
import SwiftUI

/// El primer cuadro de un video, para el globo del chat.
///
/// Antes el globo pedía la miniatura con `AsyncImage` apuntando al `.mp4`.
/// `AsyncImage` descarga y decodifica **imágenes**: un video nunca iba a
/// decodificar, así que se quedaba para siempre en el gris del marcador de
/// posición. Lo que se veía era un cuadrado vacío con el triángulo encima.
///
/// Un cuadro hay que sacarlo del video, y eso lo hace `AVAssetImageGenerator`.
/// Pide por rango, no el archivo entero.
struct MiniaturaVideo: View {
    let url: URL
    var ancho: CGFloat = 200
    var alto: CGFloat = 150

    @State private var cuadro: UIImage?
    @State private var buscando = true

    var body: some View {
        ZStack {
            if let cuadro {
                Image(uiImage: cuadro).resizable().scaledToFill()
            } else {
                // Negro y no gris: un video sin cuadro se lee como video, no
                // como algo que falta.
                Color.black.opacity(0.85)
                if buscando {
                    ProgressView().tint(.white)
                } else {
                    Image(systemName: "video.fill")
                        .font(.system(size: 26))
                        .foregroundStyle(.white.opacity(0.5))
                }
            }
        }
        .frame(width: ancho, height: alto)
        .clipShape(.rect(cornerRadius: 10))
        .task(id: url) { await traer() }
    }

    private func traer() async {
        if let guardado = Self.guardadas.object(forKey: url.absoluteString as NSString) {
            cuadro = guardado
            buscando = false
            return
        }

        buscando = true
        let activo = AVURLAsset(url: url)
        let gen = AVAssetImageGenerator(asset: activo)
        gen.appliesPreferredTrackTransform = true
        gen.maximumSize = CGSize(width: ancho * 3, height: alto * 3)

        // Medio segundo y no cero: el primer cuadro de un video grabado con el
        // teléfono suele ser negro, el del movimiento de levantarlo.
        let cuando = CMTime(seconds: 0.5, preferredTimescale: 600)
        guard let cg = try? await gen.image(at: cuando).image else {
            buscando = false
            return
        }

        let img = UIImage(cgImage: cg)
        Self.guardadas.setObject(img, forKey: url.absoluteString as NSString)
        cuadro = img
        buscando = false
    }

    /// Para no volver a bajar el video cada vez que el globo vuelve a dibujarse
    /// —que al desplazar la conversación pasa seguido—.
    private static let guardadas = NSCache<NSString, UIImage>()
}

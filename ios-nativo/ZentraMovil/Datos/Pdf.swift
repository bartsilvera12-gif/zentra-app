import CoreText
import Foundation
import UIKit

/// Arma un PDF a partir de texto plano.
///
/// Existe por una diferencia honesta con Android: allá "Exportar PDF" es un
/// botón que cambia su propia etiqueta a "✓ PDF generado" y no produce ningún
/// archivo. Los textos de la app son los mismos en las dos, pero acá el botón
/// entrega el PDF, porque en iOS compartir un archivo ya viene resuelto por el
/// sistema y un botón que promete un archivo y no lo da se descubre justo
/// cuando alguien lo necesita.
enum Pdf {
    /// Hoja A4 en puntos, que es la unidad en la que dibuja CoreGraphics.
    private static let hoja = CGRect(x: 0, y: 0, width: 595, height: 842)
    private static let margen: CGFloat = 40

    /// Escribe el texto en un PDF y devuelve dónde quedó.
    ///
    /// El archivo va a la carpeta temporal: es para compartirlo en el momento,
    /// no para guardarlo. El sistema la limpia solo, y copiarlo a Documentos
    /// llenaría el teléfono con exportaciones que nadie vuelve a abrir.
    static func deTexto(_ texto: String, titulo: String) -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(archivoValido(titulo)).pdf")

        let fuente = UIFont(name: "Barlow-Regular", size: 10)
            ?? .monospacedSystemFont(ofSize: 10, weight: .regular)
        let atribuido = NSAttributedString(string: texto, attributes: [.font: fuente])
        let marco = CTFramesetterCreateWithAttributedString(atribuido)

        let render = UIGraphicsPDFRenderer(bounds: hoja)
        try? render.writePDF(to: url) { ctx in
            var desde = 0
            let caja = hoja.insetBy(dx: margen, dy: margen)
            let camino = CGPath(rect: caja, transform: nil)

            // Una página por vez, preguntándole al framesetter hasta dónde
            // entró: sin esto una lista larga se corta en la primera hoja.
            repeat {
                ctx.beginPage()
                let cg = ctx.cgContext
                // CoreText dibuja con el origen abajo; el PDF, arriba.
                cg.translateBy(x: 0, y: hoja.height)
                cg.scaleBy(x: 1, y: -1)

                let frame = CTFramesetterCreateFrame(
                    marco, CFRange(location: desde, length: 0), camino, nil)
                CTFrameDraw(frame, cg)

                let puesto = CTFrameGetVisibleStringRange(frame)
                guard puesto.length > 0 else { break }
                desde += puesto.length
            } while desde < atribuido.length
        }
        return url
    }

    /// Un nombre de archivo que el sistema acepte, salga de donde salga.
    private static func archivoValido(_ s: String) -> String {
        let limpio = s.components(separatedBy: CharacterSet(charactersIn: "/\\:?%*|\"<>"))
            .joined(separator: "-")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return limpio.isEmpty ? "zentra" : limpio
    }
}

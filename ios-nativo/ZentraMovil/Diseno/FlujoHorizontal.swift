import SwiftUI

/// Acomoda lo que le den en fila y baja de renglón cuando no entra más.
///
/// Es el `flex-wrap` de la web, que en SwiftUI no viene hecho: un `HStack`
/// aprieta a sus hijos hasta deformarlos antes que bajar de línea, y un
/// `ScrollView` horizontal esconde lo último sin avisar. Ninguna de las dos
/// sirve para una fila de opciones donde **todas** tienen que verse: si la
/// quinta unidad de medida queda fuera de pantalla, no existe.
struct FlujoHorizontal: Layout {
    var spacing: CGFloat = 8
    /// Separación entre renglones. Por defecto la misma que entre elementos.
    var spacingVertical: CGFloat?

    private var entreRenglones: CGFloat { spacingVertical ?? spacing }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let ancho = proposal.width ?? .infinity
        let f = renglones(ancho: ancho, subviews: subviews)
        return CGSize(width: proposal.width ?? f.ancho, height: f.alto)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize,
                       subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var altoRenglon: CGFloat = 0

        for v in subviews {
            let t = v.sizeThatFits(.unspecified)
            // El `> bounds.minX` evita el renglón vacío cuando un solo elemento
            // ya es más ancho que todo el espacio disponible.
            if x + t.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX
                y += altoRenglon + entreRenglones
                altoRenglon = 0
            }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(t))
            x += t.width + spacing
            altoRenglon = max(altoRenglon, t.height)
        }
    }

    private func renglones(ancho: CGFloat, subviews: Subviews) -> (ancho: CGFloat, alto: CGFloat) {
        var x: CGFloat = 0
        var alto: CGFloat = 0
        var altoRenglon: CGFloat = 0
        var anchoMax: CGFloat = 0

        for v in subviews {
            let t = v.sizeThatFits(.unspecified)
            if x + t.width > ancho, x > 0 {
                alto += altoRenglon + entreRenglones
                x = 0
                altoRenglon = 0
            }
            x += t.width + spacing
            anchoMax = max(anchoMax, x - spacing)
            altoRenglon = max(altoRenglon, t.height)
        }
        return (anchoMax, alto + altoRenglon)
    }
}

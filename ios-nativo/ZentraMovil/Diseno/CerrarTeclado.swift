import SwiftUI

/// Da forma de cerrar el teclado numérico.
///
/// El teclado de números de iOS **no trae tecla de Return ni botón de Listo**:
/// es una cuadrícula de dígitos y nada más. En un formulario donde el último
/// campo es numérico —un costo, una cantidad— quien escribe queda encerrado:
/// el teclado tapa media pantalla y no hay nada que tocar para bajarlo. Tocar
/// afuera tampoco sirve, porque en SwiftUI eso no saca el foco solo.
///
/// Son dos salidas, porque la gente busca distinto:
///
///   · **Listo**, en una barra sobre el teclado. Es el botón que se busca.
///   · **Arrastrar la lista hacia abajo**, que es el gesto de Mensajes y de
///     casi toda app de Apple, y el que sale sin pensarlo.
///
/// Va en el `ScrollView` del formulario, una vez, en vez de en cada campo.
struct CerrarTeclado: ViewModifier {
    func body(content: Content) -> some View {
        content
            // Aire al final del formulario.
            //
            // iOS sube el campo con foco justo lo necesario para despegarlo
            // del teclado, y "justo" es al ras: el último campo quedaba pegado
            // al borde y el botón "Listo" —que flota— se le montaba encima.
            // Con este colchón, el que escribe ve el campo entero y la
            // etiqueta de arriba.
            .safeAreaPadding(.bottom, 72)
            .scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Listo") { Self.bajar() }
                        .font(Tipo.barlow(.semibold, 15))
                }
            }
    }

    /// Le saca el foco a lo que lo tenga.
    ///
    /// Por `sendAction` y no por `@FocusState`: así no hay que declarar un foco
    /// —y un `enum` de campos— en cada formulario sólo para poder cerrarlo.
    static func bajar() {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}

extension View {
    /// Agrega "Listo" sobre el teclado y lo baja al arrastrar la lista.
    func cerrarTeclado() -> some View { modifier(CerrarTeclado()) }
}

/// Muestra el error de guardar donde se ve, pase lo que pase.
///
/// Estaba dibujado al final del formulario, dentro del scroll. En Nuevo
/// producto eso queda tres pantallas abajo del botón Guardar: tocabas Guardar,
/// el servidor contestaba 401, el aviso aparecía fuera de pantalla y desde
/// afuera la app simplemente **no hacía nada**. Un error que no se ve es peor
/// que no tenerlo, porque el que mira culpa al botón.
///
/// Va anclado arriba, encima del contenido, y se va solo al tocarlo o al
/// arreglar lo que estaba mal.
struct ErrorArriba: ViewModifier {
    @Binding var texto: String?
    @Environment(\.tema) private var t

    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            if let m = texto {
                Button { withAnimation(.easeOut(duration: 0.18)) { texto = nil } } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 9) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.system(size: 13, weight: .semibold))
                        Text(m)
                            .font(Tipo.barlow(.medium, 13))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .foregroundStyle(Tint.errorInk)
                    .padding(.horizontal, 13).padding(.vertical, 11)
                    .background(Tint.errorBg, in: .rect(cornerRadius: 12))
                    .overlay { RoundedRectangle(cornerRadius: 12).stroke(Tint.errorInk.opacity(0.25)) }
                    .shadow(color: .black.opacity(0.12), radius: 10, y: 4)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 14).padding(.top, 8)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
    }
}

extension View {
    /// Ancla el error de guardar arriba, fuera del scroll.
    func errorArriba(_ texto: Binding<String?>) -> some View {
        modifier(ErrorArriba(texto: texto))
    }
}

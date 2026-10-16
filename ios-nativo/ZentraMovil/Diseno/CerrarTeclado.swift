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

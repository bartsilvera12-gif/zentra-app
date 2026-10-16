import SwiftUI

/// El contenedor de la app.
///
/// Acá es donde **a propósito** nos separamos de Android. La web dibuja su propia
/// barra de abajo (`mobile/layout/BottomNav.tsx`): tres botones en un `div` con
/// borde superior. Replicar eso en iOS sería traer un control de Android a un
/// teléfono que ya tiene el suyo, y mejor.
///
/// Esto usa el `TabView` del sistema, que en iOS 26+ ya viene con Liquid Glass:
/// la barra flota, refracta lo que pasa por debajo y se minimiza sola al bajar.
/// No hay que dibujar nada de eso a mano — y no conviene, porque el material real
/// lo resuelve el compositor y cualquier imitación se nota.
///
/// Lo único que conservamos de la web es **cuáles** son las tres pestañas y el
/// color activo (`#209EBB`), para que la app se siga sintiendo la misma.
struct RaizView: View {
    @Environment(\.colorScheme) private var sistema
    @Environment(\.scenePhase) private var fase
    @State private var ajustes = Ajustes()
    @State private var estado = Estado()
    @State private var locales = AjustesLocales()
    @State private var revisando = true

    private var esOscuro: Bool {
        ajustes.resuelto(sistema: sistema) == .oscuro
    }

    var body: some View {
        Group {
            if revisando {
                ZStack { C.azul.ignoresSafeArea(); ProgressView().tint(.white) }
            } else if estado.dentro {
                app
            } else {
                LoginView()
            }
        }
        .environment(estado)
        .environment(locales)
        .task {
            // Sesión guardada: se entra sin volver a pedir la contraseña.
            await estado.reanudar()
            await estado.engancharPush()
            revisando = false
        }
        // Y al volver del segundo plano, releer el plan. `.task` corre una sola
        // vez —cuando la pantalla aparece—, y volver del fondo no la hace
        // aparecer de nuevo: sin esto, pagar no se nota hasta cerrar la app.
        .onChange(of: fase) { _, nueva in
            if nueva == .active { Task { await estado.refrescarPlan() } }
        }
        .environment(\.tema, ajustes.tokens(sistema: sistema))
        .environment(ajustes)
        .preferredColorScheme(
            ajustes.seguirSistema ? nil : (ajustes.tema == .oscuro ? .dark : .light)
        )
    }

    private var app: some View {
        TabView {
            Tab("Inicio", systemImage: "house.fill") {
                InicioView()
            }

            Tab("Reportes", systemImage: "chart.bar.fill") {
                NavigationStack { ReportesView() }
            }

            Tab("Configuración", systemImage: "gearshape.fill") {
                ConfiguracionView()
            }
        }
        // La barra se encoge al bajar y vuelve al subir: da la pantalla entera
        // a la lista sin que el usuario tenga que esconder nada a mano.
        //
        // Es de iOS 26. Abajo de eso la barra queda fija, que es como se
        // comportó iOS siempre y como se ve el APK de Android: se pierde el
        // gesto, no la navegación.
        //
        // Preferir esto antes que pedir iOS 26 para toda la app: el menú que
        // se encoge es lindo, pero no vale dejar afuera a un vendedor con un
        // teléfono de hace cuatro años.
        .modifier(BarraQueSeEncoge())
        // El activo de la web es `#209EBB`, el mismo de `BottomNav.tsx`.
        .tint(C.cian)
    }
}

/// La barra de abajo que se encoge al bajar, donde el sistema la tenga.
///
/// `tabBarMinimizeBehavior` llegó en iOS 26. Se aplica sólo ahí; en iOS 18 a
/// 25 la barra queda fija y todo lo demás funciona igual.
///
/// Va en un modificador aparte y no en un `if` adentro de la vista porque un
/// `if` cambiaría el tipo de la vista según la versión, y SwiftUI recrearía el
/// `TabView` entero —perdiendo la pestaña elegida y el scroll— cada vez que
/// reevalúe.
private struct BarraQueSeEncoge: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.tabBarMinimizeBehavior(.onScrollDown)
        } else {
            content
        }
    }
}

/// Placeholder de las pantallas que todavía no se portaron.
/// Dice qué falta en vez de mostrar algo a medias que parezca terminado.
struct MarcadorView: View {
    let titulo: String
    @Environment(\.tema) private var t

    var body: some View {
        ZStack {
            t.bg.ignoresSafeArea()
            VStack(spacing: 8) {
                Image(systemName: "hammer")
                    .font(.system(size: 32, weight: .light))
                    .foregroundStyle(t.ink3)
                Text("\(titulo) todavía no se portó")
                    .font(Tipo.barlow(.semibold, 15))
                    .foregroundStyle(t.ink2)
            }
        }
    }
}

#Preview {
    RaizView()
}

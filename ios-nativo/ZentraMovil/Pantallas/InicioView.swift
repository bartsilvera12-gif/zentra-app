import SwiftUI

/// Inicio: encabezado, carrusel de dos tarjetas y la grilla de módulos.
///
/// Portada de `src/mobile/screens/HomeScreen.tsx`. Los valores de geometría
/// (radios, paddings, tamaños) son los mismos literales que la web, para que al
/// poner los dos teléfonos al lado no se note la diferencia.
///
/// **No scrollea, y es a propósito**: en la web la grilla usa
/// `gridAutoRows: minmax(96px, 1fr)` dentro de una columna que ocupa el alto del
/// teléfono, así que las filas se estiran para llenar lo que sobra y todo entra
/// sin desplazarse. Con un alto fijo las baldosas quedaban achatadas y no se
/// parecía a Android.
///
/// Los números todavía son de ejemplo: la capa de datos (`src/lib/repo/`) no está
/// portada. Están juntos acá abajo para reemplazarlos en un solo lugar.
struct InicioView: View {
    @Environment(\.tema) private var t
    @Environment(Estado.self) private var estado
    @State private var panel = Panel()

    /// Margen lateral de toda la pantalla. Un solo valor para que el carrusel y
    /// la grilla queden alineados.
    private static let margen: CGFloat = 14

    @State private var pagina = 0
    @State private var aviso: String?

    /// El encabezado del menú: quién sos y dónde estás parado.
    private var cabeceraMenu: String {
        [Formato.nombreCorto(usuarioCompleto), Formato.rolLegible(rolCrudo), empresa]
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    private var empresa: String { estado.tenant?.nombre ?? estado.perfil?.empresa ?? "" }
    private var usuarioCompleto: String { estado.perfil?.nombre ?? "" }
    private var rolCrudo: String { estado.perfil?.rol ?? "" }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                carrusel
                puntos
                grilla
            }
            .navigationDestination(for: Modulo.self) { m in
                switch m {
                case .venta:
                    // Al registrar una venta hay que volver a pedir el panel:
                    // `.task` corrió una sola vez, al abrir Inicio, y volver de
                    // la venta no lo dispara de nuevo. `forzar` porque `cargar`
                    // se niega a repetir el pedido si ya lo hizo.
                    NuevaVentaView { Task { await panel.cargar(forzar: true) } }
                case .clientes: ClientesView()
                case .inventario: InventarioView()
                case .compras: ComprasView()
                case .proveedores: ProveedoresView()
                case .conversaciones: ConversacionesView()
                case .reportes: ReportesView()
                }
            }
        .background(t.bg)
            .safeAreaInset(edge: .top, spacing: 0) { encabezado }
        }
        // Va sobre el NavigationStack y no adentro: adentro, el aviso se iría
        // al navegar a otro módulo, que es justo cuando hay que seguir viéndolo.
        .avisoPlan($aviso)
        .task { await panel.cargar() }
        .refreshable { await panel.cargar(forzar: true) }
    }

    // MARK: - Encabezado

    private var encabezado: some View {
        HStack(spacing: 12) {
            HStack(spacing: 9) {
                Image("MarcaTeal")
                    .resizable()
                    .scaledToFit()
                    .frame(height: 20)

                VStack(alignment: .leading, spacing: 2) {
                    Text(empresa)
                        .font(Tipo.barlow(.semibold, 15.5))
                        .foregroundStyle(t.ink)
                    Text(Formato.fechaDeHoy())
                        .font(Tipo.barlow(.regular, 11))
                        .foregroundStyle(t.ink2)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 0)

            HStack(spacing: 10) {
                VStack(alignment: .trailing, spacing: 2) {
                    Text(Formato.nombreCorto(usuarioCompleto))
                        .font(Tipo.barlow(.semibold, 13))
                        .foregroundStyle(t.ink)
                        .lineLimit(1)
                        .frame(maxWidth: 150, alignment: .trailing)
                    Text(Formato.rolLegible(rolCrudo))
                        .font(Tipo.barlow(.semibold, 10.5))
                        .tracking(1.26) // .12em sobre 10.5px
                        .foregroundStyle(t.ojo)
                }

                NavigationLink { BuscadorView() } label: {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(t.ink2)
                }
                .buttonStyle(.plain)

                Image(systemName: "bell")
                    .font(.system(size: 17, weight: .regular))
                    .foregroundStyle(t.ink2)

                // `Menu` y no `popover`: en iPhone el popover colapsa a una
                // rayita si el contenido no trae alto propio, y además el menú
                // es el control nativo para esto — se ancla solo a la inicial y
                // se cierra tocando al costado sin que haya que manejarlo.
                //
                // Cerrar sesión estaba sólo adentro de Configuración, tres
                // toques más abajo, y en un teléfono que se pasa entre turnos
                // eso se usa seguido.
                Menu {
                    Section(cabeceraMenu) {
                        Button(role: .destructive) {
                            Task { await estado.salir() }
                        } label: {
                            Label("Cerrar sesión", systemImage: "rectangle.portrait.and.arrow.right")
                        }
                    }
                } label: {
                    Text(Formato.inicialDe(usuarioCompleto))
                        .font(Tipo.barlow(.semibold, 13))
                        .foregroundStyle(.white)
                        .frame(width: 32, height: 32)
                        .background(Color(hex: "#04617A"), in: .circle)
                }
                .accessibilityLabel("Tu cuenta")
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 12)
        .background(t.card)
        .overlay(alignment: .bottom) {
            Rectangle().fill(t.border).frame(height: 1)
        }
    }

    /// El aviso de que el plan vence, en la pantalla.
    ///
    /// La notificación puede no haber llegado —permiso apagado, teléfono en
    /// silencio— y quien abre la app el día 5 antes de vencer igual tiene que
    /// verlo. Desde siete días antes y no antes: avisar con un mes es ruido.
    @ViewBuilder
    private var avisoVencimiento: some View {
        if !estado.conErp,
           let d = Vencimiento.dias(estado.tenant?.vence), d <= 7 {
            let vencido = d < 0
            let t0 = Vencimiento.texto(vencido ? -1 : d)
            VStack(alignment: .leading, spacing: 3) {
                Text(t0.titulo).font(Tipo.barlow(.bold, 13.5))
                Text(t0.cuerpo).font(Tipo.barlow(.regular, 12.5))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .foregroundStyle(vencido ? Color(hex: "#7A2220") : Tint.avisoInk)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14).padding(.vertical, 11)
            .background(vencido ? Color(hex: "#FBE9E8") : Tint.avisoBg)
        }
    }

    // MARK: - Carrusel

    private var carrusel: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 12) {
                tarjetaInventario
                tarjetaVentas
            }
            .scrollTargetLayout()
        }
        // El margen va como `contentMargins` y no como padding del HStack: así
        // el ancho que mide `containerRelativeFrame` es el del scroll, no el
        // del contenido ya corrido, y la tarjeta entra entera.
        .contentMargins(.horizontal, Self.margen, for: .scrollContent)
        .scrollTargetBehavior(.viewAligned)
        .scrollIndicators(.hidden)
        // La página se **lee**, no se maneja.
        //
        // Antes esto era un `.scrollPosition(id:)` con un binding: al escribir
        // la página mientras el dedo todavía se movía, el scroll se reconstruía
        // y el ajuste nunca llegaba a engancharse — quedaba clavado a mitad de
        // camino, mostrando media tarjeta de cada una. Leyendo la geometría no
        // se toca el scroll y `.viewAligned` hace su trabajo.
        .onScrollGeometryChange(for: Int.self) { geo in
            let paso = geo.containerSize.width - Self.margen * 2 + 12
            guard paso > 0 else { return 0 }
            return max(0, min(1, Int((geo.contentOffset.x / paso).rounded())))
        } action: { _, nueva in
            pagina = nueva
        }
        .padding(.top, 16)
    }

    /// Los dos puntos de abajo del carrusel: 18×6 el activo, 6×6 el otro.
    /// En claro el azul del encabezado, en oscuro el celeste que se usa sobre él.
    private var puntoActivo: Color {
        t.bg == TemaTokens.oscuro.bg ? C.cianClaro : C.azulMedio
    }

    private var puntos: some View {
        HStack(spacing: 6) {
            ForEach(0..<2, id: \.self) { i in
                RoundedRectangle(cornerRadius: 3)
                    .fill(pagina == i ? puntoActivo : t.dim)
                    .frame(width: pagina == i ? 18 : 6, height: 6)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: pagina)
        .padding(.top, 10)
        .padding(.bottom, 8)
    }

    private var tarjetaInventario: some View {
        HStack(spacing: 20) {
            ZStack {
                Circle()
                    .stroke(Color.white.opacity(0.16), lineWidth: 12)
                Circle()
                    .trim(from: 0, to: Double(panel.inventario?.pctOptimo ?? 0) / 100)
                    .stroke(C.ambar, style: StrokeStyle(lineWidth: 12, lineCap: .butt))
                    .rotationEffect(.degrees(-90))

                VStack(spacing: 1) {
                    Text(panel.inventario.map { "\($0.pctOptimo)%" } ?? "—")
                        .font(Tipo.barlow(.bold, 24))
                        .foregroundStyle(.white)
                    Text("ÓPTIMO")
                        .font(Tipo.barlow(.medium, 10))
                        .tracking(1.0)
                        .foregroundStyle(C.cianClaro)
                }
            }
            .frame(width: 96, height: 96)

            VStack(alignment: .leading, spacing: 7) {
                Text("INVENTARIO")
                    .font(Tipo.barlow(.semibold, 10.5))
                    .tracking(1.68) // .16em
                    .foregroundStyle(C.cianClaro)

                Text(textoItems)
                    .font(Tipo.barlow(.bold, 25))
                    .foregroundStyle(.white)

                HStack(spacing: 14) {
                    metrica(panel.inventario.map { "\($0.bajoMinimo)" } ?? "—", "bajo mínimo", C.ambar)
                    metrica(panel.inventario.map { "\($0.agotados)" } ?? "—", "agotados", C.naranja)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(20)
        .modifier(AltoTarjeta(alineacion: .leading))
        .modifier(AnchoTarjeta(margen: Self.margen))
        .background(Color(hex: "#023047"), in: .rect(cornerRadius: 20))
    }

    private var tarjetaVentas: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("VENTAS DE HOY")
                .font(Tipo.barlow(.semibold, 10.5))
                .tracking(1.68)
                .foregroundStyle(C.cianClaro)

            Text(panel.ventas.map { Panel.gs($0.hoy) } ?? (panel.cargando ? "…" : "—"))
                .font(Tipo.barlow(.bold, 25))
                .foregroundStyle(.white)

            HStack(alignment: .bottom, spacing: 6) {
                ForEach(Array(barras.enumerated()), id: \.offset) { _, h in
                    RoundedRectangle(cornerRadius: 3)
                        .fill(C.ambar)
                        .frame(maxWidth: .infinity)
                        .frame(height: h)
                }
            }
            .frame(height: 30)

            Text("Últimos 7 días")
                .font(Tipo.barlow(.regular, 11))
                .foregroundStyle(.white.opacity(0.7))
        }
        .padding(20)
        .modifier(AltoTarjeta())
        .modifier(AnchoTarjeta(margen: Self.margen))
        .background(Color(hex: "#023047"), in: .rect(cornerRadius: 20))
    }

    /// "1.248 ítems", o qué está pasando si todavía no hay número.
    private var textoItems: String {
        guard let i = panel.inventario else { return panel.cargando ? "…" : "sin datos" }
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "es_PY")
        return (f.string(from: NSNumber(value: i.total)) ?? "\(i.total)") + " ítems"
    }

    /// Las barras se escalan contra el día más alto del período, no contra un
    /// máximo fijo: con montos chicos todas quedarían al ras y no se leería nada.
    private var barras: [CGFloat] {
        let s = panel.ventas?.serie ?? Array(repeating: 0, count: 7)
        let tope = max(1, s.max() ?? 1)
        return s.map { max(3, CGFloat($0) / CGFloat(tope) * 30) }
    }

    private func metrica(_ valor: String, _ etiqueta: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(valor)
                .font(Tipo.barlow(.semibold, 18))
                .foregroundStyle(color)
            Text(etiqueta)
                .font(Tipo.barlow(.regular, 11))
                .foregroundStyle(.white.opacity(0.72))
        }
    }

    // MARK: - Grilla de módulos

    /// Tres filas de dos, **todas exactamente del mismo alto**.
    ///
    /// Con `maxHeight: .infinity` SwiftUI reparte el espacio sobrante en
    /// proporción a la flexibilidad de cada fila, no en partes iguales: como la
    /// baldosa de "Nueva venta" tiene una línea más ("(Factura)"), su mínimo es
    /// mayor y su fila terminaba más alta que las otras dos. Por eso el alto se
    /// calcula a mano y se reparte en tres: tres filas idénticas, y entre todas
    /// ocupan el alto disponible completo.
    private var grilla: some View {
        let filas: [[Modulo]] = [
            [.venta, .clientes],
            [.compras, .inventario],
            [.conversaciones, .proveedores],
        ]

        return GeometryReader { geo in
            let alto = max(96, (geo.size.height - 24) / 3) // dos separaciones de 12

            VStack(spacing: 12) {
                ForEach(Array(filas.enumerated()), id: \.offset) { _, fila in
                    HStack(spacing: 12) {
                        ForEach(fila) { m in
                            Baldosa(
                                modulo: m,
                                bloqueo: m.accion.flatMap {
                                    Planes.motivoBloqueo($0, estado.contextoPlan())
                                },
                                aviso: $aviso)
                        }
                    }
                    .frame(height: alto)
                }
            }
        }
        .padding(.horizontal, Self.margen)
        .padding(.bottom, 12)
    }
}

/// Ancho de una tarjeta del carrusel: el del contenedor menos los dos márgenes.
/// Con `containerRelativeFrame` a secas la tarjeta quedaba del ancho completo de
/// la pantalla y, corrida por el margen, se le cortaba el borde derecho.
/// Las dos tarjetas del carrusel, del mismo alto.
///
/// En la web el carrusel es un flex y `align-items: stretch` las iguala solo: la
/// más alta manda y la otra se estira. El `HStack` de SwiftUI no estira nada, así
/// que cada tarjeta quedaba del alto de su propio contenido — la de ventas tiene
/// título, monto, barras y pie, y salía ~22pt más alta que la de inventario.
///
/// Con `maxHeight: .infinity` el HStack propone a las dos el alto de la más alta
/// y las dos lo ocupan.
private struct AltoTarjeta: ViewModifier {
    /// Alto fijo, y el mismo para las dos.
    ///
    /// Es el `minHeight: 150` de la web, que allá alcanza porque el flex iguala
    /// las tarjetas y ninguna lo pasa. Acá tiene que ser fijo: con
    /// `maxHeight: .infinity` adentro de un scroll horizontal sin alto definido
    /// la tarjeta crece hasta comerse la pantalla, y con `minHeight` suelto cada
    /// una queda del alto de su propio contenido y quedan desparejas.
    static let alto: CGFloat = 150

    /// `.leading` centra vertical (el `align-items: center` de la tarjeta de
    /// inventario) y `.topLeading` pega arriba (la de ventas, que apila).
    var alineacion: Alignment = .topLeading

    func body(content: Content) -> some View {
        content.frame(height: Self.alto, alignment: alineacion)
    }
}

private struct AnchoTarjeta: ViewModifier {
    let margen: CGFloat

    func body(content: Content) -> some View {
        // Sin restar nada: `contentMargins` ya le descontó los dos márgenes al
        // contenedor, así que lo que mide `containerRelativeFrame` es el ancho
        // útil. Restarlos de nuevo acá dejaba la tarjeta 28pt más angosta de lo
        // que debía y con un hueco feo a la derecha.
        content.containerRelativeFrame(.horizontal)
    }
}

/// Un módulo de la grilla.
///
/// En la web, al pasar el mouse un punto crece hasta llenar la baldosa y aparece
/// el label con una flecha. En un teléfono no hay hover: acá el mismo efecto se
/// dispara al mantener presionado, que es el gesto equivalente.
struct Baldosa: View {
    let modulo: Modulo
    /// Por qué no se puede entrar, si el plan no lo incluye.
    var bloqueo: String? = nil
    @Binding var aviso: String?
    @State private var presionada = false

    init(modulo: Modulo, bloqueo: String? = nil,
         aviso: Binding<String?> = .constant(nil)) {
        self.modulo = modulo
        self.bloqueo = bloqueo
        self._aviso = aviso
    }

    /// Si el texto va en blanco, la baldosa es oscura: ahí el velo blanco se
    /// nota poco y hay que subirlo. Sobre las claras el velo es oscuro y con la
    /// misma intensidad se ve sucio en vez de decorativo.
    private var esOscura: Bool { modulo.over == Color(hex: "#ffffff") }

    private var adorno: some View {
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            ZStack {
                RadialGradient(
                    colors: [modulo.over.opacity(esOscura ? 0.16 : 0.10), .clear],
                    center: .init(x: 1.12, y: 1.18), startRadius: 0, endRadius: max(w, h) * 0.70
                )
                RadialGradient(
                    colors: [modulo.over.opacity(esOscura ? 0.10 : 0.06), .clear],
                    center: .init(x: -0.08, y: -0.14), startRadius: 0, endRadius: max(w, h) * 0.72
                )
            }
        }
    }

    @ViewBuilder
    var body: some View {
        if let b = bloqueo {
            // No se apaga ni desaparece: se toca y dice por qué. Esconder el
            // módulo haría creer que la app no lo tiene.
            // Mismos valores que Android: la baldosa entera al 50% y el
            // candado arriba a la derecha, 13pt al 85%.
            Button { withAnimation(.spring(duration: 0.3)) { aviso = b } } label: {
                cara
                    .overlay(alignment: .topTrailing) {
                        // Android usa un emoji; acá va el símbolo del sistema,
                        // que se dibuja con el peso de la tipografía y toma el
                        // color del módulo en vez de traer el suyo.
                        Image(systemName: "lock.fill")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(modulo.over)
                            .opacity(0.85)
                            .padding(.top, 9)
                            .padding(.trailing, 10)
                    }
                    .opacity(0.5)
            }
            .buttonStyle(.plain)
        } else {
            navegable
        }
    }

    private var navegable: some View {
        NavigationLink(value: modulo) { cara }
            .buttonStyle(.plain)
            .animation(.timingCurve(0.4, 0, 0.2, 1, duration: 0.36), value: presionada)
            .onLongPressGesture(minimumDuration: 0.12, pressing: { presionada = $0 },
                                perform: {})
    }

    /// Lo que se ve. Igual esté bloqueada o no — la diferencia es el candado y
    /// qué pasa al tocarla, no cómo se dibuja.
    private var cara: some View {
        ZStack {
                modulo.color

                // El círculo que crece, igual que en la web.
                //
                // El `frame` fijo no es decorativo: `Circle()` no tiene tamaño
                // propio y dentro del ZStack se expandía hasta llenar el ancho
                // disponible, estirando cada baldosa. Con el frame el tamaño lo
                // manda el contenido y el crecimiento lo hace `scaleEffect`, que
                // no participa del layout.
                Circle()
                    .fill(modulo.fill)
                    .frame(width: 9, height: 9)
                    .scaleEffect(presionada ? 70 : 1)
                    .opacity(presionada ? 1 : 0)

                // El adorno del fondo.
                //
                // Antes eran dos círculos sólidos: donde se cruzaban quedaba un
                // borde duro en forma de lente, justo detrás del texto. Ahora
                // son dos degradados radiales que se apagan antes de llegar al
                // centro, así que no hay ningún borde que mirar.
                //
                // Va ENCIMA del punto que crece y no debajo: si no, al apretar
                // la baldosa el adorno desaparecía y la tarjeta se veía plana.
                adorno
                    .allowsHitTesting(false)

                VStack(spacing: modulo == .venta ? 8 : 10) {
                    Image(systemName: modulo.simbolo)
                        .font(.system(size: 22, weight: .regular))
                    Text(modulo.titulo)
                        .font(Tipo.barlow(.semibold, modulo == .venta ? 16 : 15))
                    if modulo == .venta {
                        Text("(Factura)")
                            .font(Tipo.barlow(.regular, 12))
                            .opacity(0.7)
                    }
                }
                .foregroundStyle(modulo.over)
                .offset(x: presionada ? 44 : 0)
                .opacity(presionada ? 0 : 1)

                HStack(spacing: 8) {
                    Text(modulo.titulo)
                        .font(Tipo.barlow(.semibold, 15))
                    Image(systemName: "arrow.right")
                        .font(.system(size: 14, weight: .semibold))
                }
                .foregroundStyle(modulo.over)
                .offset(x: presionada ? 0 : 44)
                .opacity(presionada ? 1 : 0)
            }
            // El alto lo fija la fila, que lo reparte en tres iguales. Acá sólo
            // se ocupa todo lo que la fila dé, a lo ancho y a lo alto.
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipShape(.rect(cornerRadius: 14))
    }
}

#Preview {
    InicioView().environment(\.tema, .claro)
}

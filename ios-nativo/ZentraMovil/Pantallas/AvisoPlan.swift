import SwiftUI

/// Lo que aparece al tocar algo que el plan no incluye.
/// Port de `src/mobile/ui/AvisoPlan.tsx`.
///
/// Era un cartelito abajo que decía "Tu plan no incluye esto · Tocá para
/// cerrar". Decía la verdad y no servía de nada: quien lo leía se quedaba sin
/// saber qué plan sí lo incluye, cuánto sale ni dónde se paga. Un "no" sin
/// salida.
///
/// Después fue una hoja con los tres planes y un enlace a pagar por la web.
/// Eso tampoco podía quedar: Apple prohíbe que una app dirija a pagar afuera
/// —ni botón, ni enlace, ni nombrar la dirección— y Paraguay no entra en la
/// excepción que abrieron para EE.UU. Ahora el plan se compra acá, con la caja
/// de Apple, y la hoja tiene un botón por plan.
///
/// Cuando no se puede comprar —sin red, o con los productos todavía sin
/// aprobar en App Store Connect— queda la hoja informativa con la salida de
/// escribirnos. Informar qué incluye cada plan no está prohibido; dirigir a
/// comprar afuera, sí.
/// Lo que mide el contenido de la hoja.
///
/// SwiftUI no tiene una altura "lo que ocupe": o se elige media pantalla, o
/// entera, o un numero fijo. Con media se cortaba el ultimo plan y con entera
/// quedaba medio telefono en blanco, asi que se mide y se usa ese numero.
private struct AltoDelContenido: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

struct HojaPlanes: View {
    /// El motivo, tal como lo escribió `Planes.motivoBloqueo()`.
    let motivo: String
    @Environment(\.tema) private var t
    @Environment(Estado.self) private var estado
    @Environment(\.dismiss) private var cerrar

    /// El precio de `zentra.planes`, que es el que cobra el server por la web.
    @State private var precios: [Plan: Int] = [:]
    /// El precio que dice Apple. Cuando está, gana: es el que se va a cobrar.
    @State private var deApple: [Plan: String] = [:]
    /// Si en este teléfono se puede comprar. Arranca en `nil` —todavía no
    /// sabemos— y no en `false`: mostrar la hoja sin botones y un segundo
    /// después llenarla de botones es peor que esperar.
    @State private var conCompras: Bool?
    @State private var comprando: Plan?
    @State private var falla = ""
    @State private var alto: CGFloat = 0

    private var actual: Plan { estado.tenant?.plan ?? .free }

    /// Las alturas que puede tomar la hoja.
    ///
    /// Los 44 son el tirador de arriba, que esta fuera del scroll y por lo
    /// tanto fuera de lo medido. Mientras no se midio nada va entera: abrir
    /// chica y crecer se ve peor que abrir grande.
    private var alturas: Set<PresentationDetent> {
        guard alto > 0 else { return [.large] }
        return [.height(alto + 44), .large]
    }

    /// El título, que no siempre es el mismo.
    ///
    /// "Esto viene con otro plan" está escrito para cuando alguien toca algo
    /// con candado. Pero la hoja también se abre desde Configuración, a mirar,
    /// y a quien ya está en el plan más alto le quedaba un título que le dice
    /// que lo que quiere viene con otro plan — y no hay otro plan. Estar
    /// arriba de todo es la señal: no llegaste acá por un candado.
    private var titulo: String {
        actual == Plan.orden.last ? "Los planes de Zentra" : "Esto viene con otro plan"
    }

    /// Los planes que se pueden comprar ahora mismo.
    ///
    /// Es una sola lista y la usan las dos partes que tienen que estar de
    /// acuerdo: los botones de las tarjetas y la salida del pie. Con dos
    /// condiciones separadas se separan, y se separaron: los botones pasaron a
    /// pedir que exista ese producto y el pie se quedó pidiendo que exista
    /// alguno, así que con un solo producto creado y ya comprado la hoja
    /// quedaba sin botones y sin salida.
    private var comprables: [Plan] {
        Plan.orden.filter { $0 != .free && $0 != actual && deApple[$0] != nil }
    }

    var body: some View {
        VStack(spacing: 0) {
            // El tirador, dibujado por nosotros y fuera del scroll.
            //
            // El del sistema flota encima del contenido, así que al bajar la
            // lista los precios le pasaban por debajo y quedaban cortados a la
            // mitad. Acá ocupa su lugar y nada se mete abajo. El gesto de
            // arrastrar la hoja sigue siendo el del sistema: esta franja no
            // scrollea, así que el dedo que la agarra mueve la hoja.
            Capsule()
                .fill(t.border)
                .frame(width: 38, height: 4)
                .padding(.top, 8).padding(.bottom, 10)
                .frame(maxWidth: .infinity)
                .background(t.card)

            ScrollView {
            VStack(spacing: 10) {
                VStack(spacing: 6) {
                    Text(titulo)
                        .font(Tipo.barlow(.bold, 20)).foregroundStyle(t.ink)
                    Text("\(motivo) Mirá qué suma cada uno y seguí trabajando sin topes.")
                        .font(Tipo.barlow(.regular, 13.5)).foregroundStyle(t.ink2)
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 6).padding(.top, 8).padding(.bottom, 6)

                ForEach(Plan.orden, id: \.self) { tarjeta($0) }

                // Al final de las tarjetas y no clavado al pie.
                //
                // Clavado abajo quedaba un enlace solo a media pantalla de
                // distancia, con un hueco blanco en el medio. El pie se
                // justificaba cuando llevaba un boton a lo ancho, y ya no lo
                // lleva: los de comprar estan en cada tarjeta.
                Button("Ahora no") { cerrar() }
                    .font(Tipo.barlow(.semibold, 14))
                    .foregroundStyle(t.ink2)
                    .padding(.top, 6).padding(.bottom, 2)
            }
            .padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 8)
            .background(GeometryReader { g in
                Color.clear.preference(key: AltoDelContenido.self, value: g.size.height)
            })
            }
            // Anclado abajo, no a continuación de las tarjetas.
            //
            // Pegado al final del contenido quedaba a media pantalla cuando
            // los planes no la llenaban, lejos del pulgar y con un hueco
            // debajo que lo hacía parecer un renglón más. Acá está siempre en
            // el mismo lugar, y las tarjetas scrollean por detrás.
            .safeAreaInset(edge: .bottom) { pie }
        }
        .background(t.card)
        .onPreferenceChange(AltoDelContenido.self) { alto = $0 }
        // A la medida del contenido.
        //
        // Abria en `.medium` y los tres planes no entran: el ultimo quedaba
        // cortado detras del pie, y justo ese es Max —el que mas se quiere
        // mostrar— o el que ya tenes. Con `.large` entran, pero en un telefono
        // grande sobra medio alto en blanco.
        //
        // `.height` se recorta solo cuando el contenido no entra, asi que en
        // un telefono chico se comporta como `.large` sin hacer nada especial.
        // `.large` queda como segunda altura para poder arrastrarla.
        .presentationDetents(alturas)
        // Apagado: el nuestro va arriba, en la franja que no scrollea.
        .presentationDragIndicator(.hidden)
        .task {
            precios = await SupabaseDatos.preciosDePlanes()
            let sePuede = await Compras.sePuedeComprar()
            conCompras = sePuede
            // El precio de Apple sólo si se va a comprar ahí: Apple cobra en la
            // moneda de la cuenta y le suma sus impuestos, así que el número
            // que ve la persona tiene que ser el que se le va a cobrar.
            if sePuede { deApple = await Compras.precios() }
        }
    }

    /// Comprar desde la app.
    ///
    /// Al final se relee el plan, que es de donde sale todo lo que esta hoja
    /// bloquea. Sin eso habría que cerrar y abrir la app para ver lo que se
    /// acaba de pagar.
    private func comprar(_ p: Plan) async {
        falla = ""
        comprando = p
        defer { comprando = nil }

        switch await Compras.comprar(p) {
        case .cancelado:
            break
        case .pendiente:
            falla = "La compra quedó esperando aprobación. "
                  + "Cuando se apruebe, el plan se activa solo."
        case .error(let que):
            falla = que
        case .listo:
            await estado.refrescarPlan()
            cerrar()
        }
    }

    /// El error, fijo al pie.
    ///
    /// Esto si va clavado abajo y no al final del scroll: un error al pie de
    /// una lista larga no lo ve nadie, y ya nos paso mas de una vez.
    @ViewBuilder
    private var pie: some View {
        if !falla.isEmpty {
            Text(falla)
                .font(Tipo.barlow(.regular, 12.5))
                .foregroundStyle(Tint.errorInk)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 13).padding(.vertical, 11)
                .background(Tint.errorBg, in: .rect(cornerRadius: 10))
                .padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 12)
                .frame(maxWidth: .infinity)
                .background(t.card)
        }
    }

    /// El precio que se muestra: el de Apple si lo hay, el nuestro si no.
    ///
    /// En el plan gratis no va nada: el nombre ya lo dice, y repetir "Gratis"
    /// al lado de "Gratis" se lee como un error. Sin precio tampoco se escribe
    /// nada: el plan se entiende por lo que incluye.
    private func precio(_ p: Plan) -> String? {
        if let deApple = deApple[p] { return deApple }
        if let n = precios[p], n > 0 { return Panel.gs(n) + " /mes" }
        return nil
    }

    private func tarjeta(_ p: Plan) -> some View {
        let esElTuyo = p == actual
        return VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(p.nombre)
                    .font(Tipo.barlow(.bold, 16))
                    .foregroundStyle(esElTuyo ? C.azul : t.ink)
                if esElTuyo {
                    Text("TU PLAN")
                        .font(Tipo.barlow(.semibold, 10)).tracking(1)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 7).padding(.vertical, 4)
                        .background(C.cian, in: .capsule)
                }
                Spacer(minLength: 0)
                if let texto = precio(p) {
                    Text(texto)
                        .font(Tipo.barlow(.bold, 15))
                        .foregroundStyle(esElTuyo ? C.azul : t.ink)
                        .lineLimit(1)
                }
            }

            ForEach(p.resumen, id: \.self) { linea in
                HStack(alignment: .firstTextBaseline, spacing: 7) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(C.cian)
                    Text(linea)
                        .font(Tipo.barlow(.regular, 12.5))
                        .foregroundStyle(esElTuyo ? C.azul : t.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            // El botón sólo en los planes que no son el tuyo y que se pueden
            // comprar. En el gratis no hay nada que cobrar.
            //
            // `deApple[p]` y no `conCompras` a secas: que la App Store sepa
            // cobrar no quiere decir que haya algo que comprar. Si Apple
            // conoce Emprendedor y todavía no Max —porque falta crearlo o
            // está esperando aprobación—, el botón de Max abriría una compra
            // que falla con "producto no disponible", y quien la toca se
            // queda sin saber si el problema es la app, su tarjeta o su
            // teléfono. Si hay precio, hay producto.
            if comprables.contains(p) {
                Button {
                    Task { await comprar(p) }
                } label: {
                    Text(comprando == p ? "Abriendo la App Store…" : "Suscribirme a \(p.nombre)")
                        .font(Tipo.barlow(.semibold, 14)).foregroundStyle(.white)
                        .frame(maxWidth: .infinity).padding(.vertical, 12)
                        .background(C.cian, in: .rect(cornerRadius: 10))
                }
                .buttonStyle(.plain)
                .disabled(comprando != nil)
                .opacity(comprando != nil && comprando != p ? 0.5 : 1)
                .padding(.top, 2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14).padding(.vertical, 13)
        .background(esElTuyo ? Tint.avisoBg : t.bg, in: .rect(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .stroke(esElTuyo ? C.cian : t.border, lineWidth: 1.5)
        }
    }
}

struct AvisoPlanFlotante: ViewModifier {
    @Binding var motivo: String?

    func body(content: Content) -> some View {
        content.sheet(isPresented: Binding(
            get: { motivo != nil },
            set: { if !$0 { motivo = nil } }
        )) {
            if let m = motivo { HojaPlanes(motivo: m) }
        }
    }
}

extension View {
    /// Muestra la hoja de planes con el motivo del bloqueo.
    func avisoPlan(_ motivo: Binding<String?>) -> some View {
        modifier(AvisoPlanFlotante(motivo: motivo))
    }
}

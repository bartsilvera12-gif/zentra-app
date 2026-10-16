import SwiftUI

/// Lo que aparece al tocar algo que el plan no incluye.
/// Port de `src/mobile/ui/AvisoPlan.tsx`.
///
/// Era un cartelito abajo que decía "Tu plan no incluye esto · Tocá para
/// cerrar". Decía la verdad y no servía de nada: quien lo leía se quedaba sin
/// saber qué plan sí lo incluye, cuánto sale ni dónde se paga. Un "no" sin
/// salida.
///
/// Ahora es una hoja con los tres planes, el que se tiene marcado, y el botón
/// para pagar. El precio se lee de la base —el mismo que cobra el server— y si
/// no se puede leer, se muestran los planes sin precio: mejor eso que un
/// número inventado.
struct HojaPlanes: View {
    /// El motivo, tal como lo escribió `Planes.motivoBloqueo()`.
    let motivo: String
    @Environment(\.tema) private var t
    @Environment(Estado.self) private var estado
    @Environment(\.dismiss) private var cerrar
    @State private var precios: [Plan: Int] = [:]

    private var actual: Plan { estado.tenant?.plan ?? .free }

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
                    Text("Esto viene con otro plan")
                        .font(Tipo.barlow(.bold, 20)).foregroundStyle(t.ink)
                    Text("\(motivo) Mirá qué suma cada uno y seguí trabajando sin topes.")
                        .font(Tipo.barlow(.regular, 13.5)).foregroundStyle(t.ink2)
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 6).padding(.top, 8).padding(.bottom, 6)

                ForEach(Plan.orden, id: \.self) { tarjeta($0) }

            }
            .padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 8)
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
        .presentationDetents([.medium, .large])
        // Apagado: el nuestro va arriba, en la franja que no scrollea.
        .presentationDragIndicator(.hidden)
        .task { precios = await SupabaseDatos.preciosDePlanes() }
    }

    /// El botón de pagar y la salida, fijos al pie de la hoja.
    private var pie: some View {
        VStack(spacing: 0) {
            if let link = Config.linkDePago {
                Link(destination: link) {
                    Text("Ver planes y pagar")
                        .font(Tipo.barlow(.semibold, 15)).foregroundStyle(.white)
                        .frame(maxWidth: .infinity).padding(.vertical, 14)
                        .background(C.cian, in: .rect(cornerRadius: 12))
                }
            } else if let wa = Soporte.link(Config.soporteWhatsapp, .ayuda,
                                            Soporte.contacto(nombre: estado.perfil?.nombre,
                                                             empresa: estado.perfil?.empresa)) {
                // Sin el botón de pagar, la salida es escribirnos. Las tiendas
                // prohíben dirigir a pagar afuera, y nombrar la dirección de
                // cobro cuenta igual que enlazarla.
                //
                // Dejar sólo "Ahora no" sería un callejón: alguien que acaba
                // de ver que su plan no incluye algo necesita saber qué hacer.
                Link(destination: wa) {
                    Text("Escribirnos para cambiar de plan")
                        .font(Tipo.barlow(.semibold, 15)).foregroundStyle(.white)
                        .frame(maxWidth: .infinity).padding(.vertical, 14)
                        .background(C.cian, in: .rect(cornerRadius: 12))
                }
            }

            Button("Ahora no") { cerrar() }
                .font(Tipo.barlow(.semibold, 14))
                .foregroundStyle(t.ink2)
                .padding(.top, 10).padding(.bottom, 2)
        }
        .padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 10)
        .background(t.card)
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
                // En el plan gratis no va nada: el nombre ya lo dice, y repetir
                // "Gratis" al lado de "Gratis" se lee como un error. Sin precio
                // tampoco se escribe nada: el plan se entiende por lo que incluye.
                if let n = precios[p], n > 0 {
                    Text("\(Panel.gs(n)) /mes")
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

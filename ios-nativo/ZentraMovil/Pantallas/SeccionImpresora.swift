import SwiftUI

/// La impresora térmica, en Configuración. Port de lo que Android tiene en su
/// `ConfigScreen`.
///
/// Se elige una vez y queda. Acá va también el ancho del rollo, que la
/// impresora no sabe —lo ve la persona que lo cambia— y el ticket de prueba,
/// que es la única forma de saber si quedó bien elegida sin esperar a tener un
/// cliente adelante.
struct SeccionImpresora: View {
    @Environment(\.tema) private var t
    @State private var impresora = Impresora.shared
    @State private var buscada = false
    @State private var aviso: String?
    @State private var avisoBueno = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("IMPRESORA")
                .font(Tipo.barlow(.semibold, 10.5)).tracking(1.68).foregroundStyle(t.ink2)

            if let g = impresora.guardada {
                elegida(g)
            } else {
                Text("Para imprimir el ticket de una venta en una térmica Bluetooth, elegila una vez acá.")
                    .font(Tipo.barlow(.regular, 12.5)).foregroundStyle(t.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }

            rollo

            Button {
                Task {
                    aviso = nil
                    buscada = false
                    let r = await impresora.buscar()
                    buscada = true
                    if case let .error(motivo, _) = r { mostrar(motivo, bueno: false) }
                }
            } label: {
                HStack(spacing: 8) {
                    if impresora.buscando { ProgressView().controlSize(.small) }
                    Text(impresora.buscando ? "Buscando…"
                         : impresora.guardada == nil ? "Buscar impresoras" : "Buscar otra")
                        .font(Tipo.barlow(.semibold, 14))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity).frame(height: 44)
                .background(impresora.buscando ? t.dim : C.teal, in: .rect(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .disabled(impresora.buscando)

            if !impresora.encontradas.isEmpty {
                VStack(spacing: 8) {
                    ForEach(impresora.encontradas) { encontrada($0) }
                }
            } else if buscada && !impresora.buscando {
                // Que no aparezca nada es, casi siempre, una impresora que el
                // iPhone no puede ver. Decirlo evita media hora de probar.
                Text("No apareció ninguna. Fijate que esté prendida y cerca. Si es una impresora "
                    + "vieja —de las que no son Bluetooth LE—, el iPhone no puede usarla: esas "
                    + "andan sólo con Android.")
                    .font(Tipo.barlow(.regular, 12)).foregroundStyle(t.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let aviso {
                Text(aviso)
                    .font(Tipo.barlow(.regular, 12.5))
                    .foregroundStyle(avisoBueno ? Tint.okInk : Tint.errorInk)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(11)
                    .background(avisoBueno ? Tint.okBg : Tint.errorBg, in: .rect(cornerRadius: 10))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(t.card, in: .rect(cornerRadius: 14))
    }

    private func elegida(_ g: Impresora.Vista) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: "printer")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(C.teal)
                    .frame(width: 38, height: 38)
                    .background(t.bg, in: .rect(cornerRadius: 10))
                VStack(alignment: .leading, spacing: 2) {
                    Text(g.nombre).font(Tipo.barlow(.semibold, 14)).foregroundStyle(t.ink)
                    // No dice "Conectada": la conexión se abre al imprimir, y
                    // afirmar acá que está conectada sería inventar un estado
                    // que nadie comprobó.
                    Text("Elegida · se conecta al imprimir")
                        .font(Tipo.barlow(.regular, 11.5)).foregroundStyle(t.ink2)
                }
                Spacer(minLength: 0)
            }

            HStack(spacing: 10) {
                Button {
                    Task {
                        aviso = nil
                        switch await impresora.imprimirPrueba() {
                        case .enviado:
                            mostrar("Mandamos el ticket de prueba. Si no sale, fijate el papel y la tapa.",
                                    bueno: true)
                        case let .error(motivo, _):
                            mostrar(motivo, bueno: false)
                        }
                    }
                } label: {
                    HStack(spacing: 6) {
                        if impresora.imprimiendo { ProgressView().controlSize(.small) }
                        Text(impresora.imprimiendo ? "Mandando…" : "Imprimir prueba")
                    }
                    .font(Tipo.barlow(.semibold, 13.5)).foregroundStyle(t.ink)
                    .frame(maxWidth: .infinity).frame(height: 40)
                    .overlay { RoundedRectangle(cornerRadius: 10).stroke(t.border, lineWidth: 1.5) }
                }
                .buttonStyle(.plain)
                .disabled(impresora.imprimiendo)

                Button {
                    impresora.olvidar()
                    mostrar("Listo, la sacamos. Elegí otra cuando quieras.", bueno: true)
                } label: {
                    Text("Olvidar")
                        .font(Tipo.barlow(.semibold, 13.5)).foregroundStyle(Tint.errorInk)
                        .frame(maxWidth: .infinity).frame(height: 40)
                        .overlay { RoundedRectangle(cornerRadius: 10).stroke(Tint.errorInk.opacity(0.3), lineWidth: 1.5) }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func encontrada(_ v: Impresora.Vista) -> some View {
        Button {
            Task {
                aviso = nil
                switch await impresora.elegir(v) {
                case .enviado: mostrar("Quedó elegida \(v.nombre). Probala con un ticket de prueba.", bueno: true)
                case let .error(motivo, _): mostrar(motivo, bueno: false)
                }
            }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: v.guardada ? "checkmark.circle.fill" : "printer")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(v.guardada ? C.teal : t.ink3)
                VStack(alignment: .leading, spacing: 2) {
                    Text(v.nombre).font(Tipo.barlow(.semibold, 13.5)).foregroundStyle(t.ink)
                    Text(v.detalle).font(Tipo.barlow(.regular, 11)).foregroundStyle(t.ink3).lineLimit(1)
                }
                Spacer(minLength: 0)
                if !v.guardada {
                    Text("Elegir").font(Tipo.barlow(.semibold, 12.5)).foregroundStyle(t.marca)
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(t.bg, in: .rect(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    /// El ancho del rollo.
    ///
    /// Es lo que decide cuántas columnas tiene el ticket que armamos. Puesto
    /// mal, el de 48 columnas sale partido a la mitad en un rollo de 58.
    private var rollo: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("ANCHO DEL ROLLO")
                .font(Tipo.barlow(.semibold, 10)).tracking(1.2).foregroundStyle(t.ink2)
            HStack(spacing: 10) {
                ForEach(Ticket.Ancho.allCases) { mm in
                    let activo = impresora.ancho == mm
                    Button { impresora.ancho = mm } label: {
                        VStack(spacing: 2) {
                            Text(mm.legible).font(Tipo.barlow(.semibold, 14))
                            Text("\(mm.columnas) columnas").font(Tipo.barlow(.regular, 11))
                        }
                        .foregroundStyle(activo ? Tint.tealInk : t.ink)
                        .frame(maxWidth: .infinity).padding(.vertical, 10)
                        .background(activo ? Tint.tealBg : t.bg, in: .rect(cornerRadius: 10))
                        .overlay {
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(activo ? C.teal : t.border, lineWidth: activo ? 1.5 : 1)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func mostrar(_ texto: String, bueno: Bool) {
        avisoBueno = bueno
        withAnimation(.easeOut(duration: 0.2)) { aviso = texto }
    }
}

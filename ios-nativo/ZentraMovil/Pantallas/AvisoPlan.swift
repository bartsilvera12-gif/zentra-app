import SwiftUI

/// El aviso de por qué algo no se puede con el plan actual.
/// Port de `src/mobile/ui/AvisoPlan.tsx`.
///
/// Aparece abajo, sobre la pantalla, y se va al tocarlo. **No es un diálogo**:
/// no corta lo que la persona estaba haciendo, porque no hay nada que decidir
/// — sólo hay que enterarse.
///
/// El texto ya viene escrito desde `Planes.motivoBloqueo()`, que es quien
/// conoce el plan y el límite. Acá no se arma ningún mensaje: si esta vista
/// tuviera que saber qué plan incluye qué, el dato viviría en dos lugares.
struct AvisoPlanFlotante: ViewModifier {
    @Binding var motivo: String?
    @Environment(\.tema) private var t

    func body(content: Content) -> some View {
        content.overlay(alignment: .bottom) {
            if let m = motivo {
                Button {
                    withAnimation(.easeOut(duration: 0.18)) { motivo = nil }
                } label: {
                    HStack(spacing: 11) {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Tint.avisoInk)
                            .frame(width: 30, height: 30)
                            .background(Tint.avisoBg, in: .circle)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(m)
                                .font(Tipo.barlow(.medium, 13.5))
                                .foregroundStyle(t.ink)
                                .fixedSize(horizontal: false, vertical: true)

                            // La segunda línea no es decoración: el aviso no
                            // tiene botón de cerrar, y sin esto no hay nada que
                            // diga que se va tocándolo.
                            Text("Tocá para cerrar")
                                .font(Tipo.barlow(.regular, 12))
                                .foregroundStyle(t.ink3)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 13)
                    .background(t.card, in: .rect(cornerRadius: 13))
                    .overlay { RoundedRectangle(cornerRadius: 13).stroke(t.border) }
                    .shadow(color: .black.opacity(0.18), radius: 12, y: 6)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 14)
                .padding(.bottom, 18)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
    }
}

extension View {
    /// Muestra el motivo del bloqueo flotando abajo, hasta que lo toquen.
    func avisoPlan(_ motivo: Binding<String?>) -> some View {
        modifier(AvisoPlanFlotante(motivo: motivo))
    }
}

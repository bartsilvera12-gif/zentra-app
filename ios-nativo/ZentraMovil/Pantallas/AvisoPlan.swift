import SwiftUI

/// Lo que el plan no deja hacer, dicho en pantalla.
///
/// Port de `src/mobile/ui/AvisoPlan.tsx`. La idea de `motivoBloqueo` es que
/// devuelve **el motivo** y no un booleano: un botón gris sin explicación hace
/// que la persona crea que la app se rompió, no que le falta plan.
struct AvisoPlan: View {
    let motivo: String

    var body: some View {
        Aviso(texto: motivo, bg: Tint.avisoBg, ink: Tint.avisoInk)
    }
}

extension View {
    /// Apaga el control y deja a la vista decir por qué, si hay motivo.
    func segunPlan(_ motivo: String?) -> some View {
        self.disabled(motivo != nil).opacity(motivo == nil ? 1 : 0.45)
    }
}

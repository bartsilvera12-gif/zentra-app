import SwiftUI

/// Elegir cuáles productos quedan a la vista cuando el plan no alcanza para
/// todos.
///
/// Nada se borra: lo que no entra se esconde y vuelve solo el día que el plan
/// lo permita. Lo que se decide acá es cuáles de los que hay son los que se
/// pueden usar mientras tanto.
///
/// Por defecto quedan los que cargó primero, que es una regla que no sorprende
/// a nadie. Esta pantalla existe porque esa regla casi nunca es la que uno
/// quiere: los primeros veinte que cargó un sábado a la noche probando la app
/// no son los veinte que vende.
struct ElegirVisiblesView: View {
    let productos: [InvProducto]
    /// Cuántos entran. Es el tope del plan.
    let tope: Int
    /// Para que el inventario se vuelva a leer al cerrar.
    let alCerrar: () async -> Void

    @Environment(\.tema) private var t
    @Environment(\.dismiss) private var cerrar

    @State private var fijados: Set<String> = []
    @State private var q = ""
    @State private var guardando: Set<String> = []
    @State private var error: String?

    /// Los que quedarían a la vista con lo elegido hasta ahora: los fijados
    /// primero y el resto por antigüedad, igual que `Planes.visibles`.
    private var aLaVista: Set<String> {
        var copia = productos
        for i in copia.indices { copia[i].fijado = fijados.contains(copia[i].id) }
        return Set(Planes.visibles(copia, tope: tope).map(\.id))
    }

    private var vistas: [InvProducto] {
        let n = q.trimmingCharacters(in: .whitespaces).lowercased()
        guard !n.isEmpty else { return productos }
        return productos.filter {
            $0.nombre.lowercased().contains(n) || $0.sku.lowercased().contains(n)
        }
    }

    var body: some View {
        NavigationStack {
            let visibles = aLaVista

            List {
                Section {
                    Text("Tu plan muestra \(tope) productos a la vez. Los demás quedan guardados y vuelven cuando el plan los permita: no se borra ninguno.")
                        .font(Tipo.barlow(.regular, 13))
                        .foregroundStyle(t.ink2)
                        .listRowBackground(Color.clear)
                }

                if let error {
                    Section {
                        Aviso(texto: error, bg: Tint.errorBg, ink: Tint.errorInk)
                            .listRowBackground(Color.clear)
                    }
                }

                Section("\(visibles.count) de \(tope) a la vista") {
                    ForEach(vistas) { p in
                        fila(p, visible: visibles.contains(p.id))
                    }
                }
            }
            .searchable(text: $q, prompt: "Buscar producto")
            .navigationTitle("Qué se ve")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Listo") {
                        Task { await alCerrar(); cerrar() }
                    }
                }
            }
        }
        .onAppear {
            fijados = Set(productos.filter(\.fijado).map(\.id))
        }
    }

    private func fila(_ p: InvProducto, visible: Bool) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(p.nombre)
                    .font(Tipo.barlow(.semibold, 14))
                    .foregroundStyle(visible ? t.ink : t.ink3)
                    .lineLimit(1)
                Text(visible ? (fijados.contains(p.id) ? "Fijado" : "A la vista") : "Escondido")
                    .font(Tipo.barlow(.regular, 11.5))
                    .foregroundStyle(visible ? t.ok : t.ink3)
            }

            Spacer(minLength: 0)

            if guardando.contains(p.id) {
                ProgressView()
            } else {
                // Un botón de chinche y no un interruptor: lo que se elige es
                // "éste no puede faltar", no "mostrar sí/no". El interruptor
                // prometería apagar uno y no se puede — si hay lugar, se ve.
                Button { Task { await alternar(p) } } label: {
                    Image(systemName: fijados.contains(p.id) ? "pin.fill" : "pin")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(fijados.contains(p.id) ? t.marca : t.ink3)
                        .frame(width: 44, height: 36)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func alternar(_ p: InvProducto) async {
        let nuevo = !fijados.contains(p.id)

        // Fijar más de los que entran no sirve de nada: el corte los dejaría
        // afuera igual y la pantalla mostraría una chinche que no hace nada.
        if nuevo, fijados.count >= tope {
            error = "Ya tenés \(tope) fijados, que es lo que muestra tu plan. Soltá uno para fijar otro."
            return
        }

        error = nil
        guardando.insert(p.id)
        defer { guardando.remove(p.id) }

        do {
            try await RepoERP.fijarProducto(p.id, nuevo)
            if nuevo { fijados.insert(p.id) } else { fijados.remove(p.id) }
        } catch {
            // Sin tocar la marca: mentir diciendo que quedó guardado es peor
            // que no guardar, porque se descubre al volver a entrar.
            self.error = (error as? LocalizedError)?.errorDescription
                ?? "No pudimos guardar el cambio."
        }
    }
}

import Foundation
import StoreKit

/// Comprar el plan adentro de la app, con la caja de Apple.
/// Port de `src/lib/compras-play.ts`, que hace lo mismo con la de Google.
///
/// Existe porque Apple no deja otra cosa: vender una suscripción adentro de
/// una app de la App Store obliga a cobrar con su sistema, y mandar a pagar
/// afuera —con un botón, un enlace o hasta un texto con la dirección— está
/// prohibido. Paraguay no entra en la excepción que abrieron para EE.UU. El
/// cobro por la web con PagoPar sigue existiendo y sigue siendo mejor negocio
/// (no hay comisión), pero la app no puede nombrarlo.
///
/// Lo que la app **no** hace: activar el plan. La compra termina con un
/// comprobante que se le manda al servidor, y es el servidor el que comprueba
/// la firma de Apple y recién ahí activa. Ese comprobante es tan falsificable
/// como el monto que nunca le creímos a PagoPar.
///
/// Y una cosa que no está en la versión de Android, porque allá no existe: en
/// iOS la transacción hay que **terminarla**, y terminarla es lo último que se
/// hace. Mientras no se termine, Apple la vuelve a ofrecer cada vez que
/// arranca la app, así que una compra que se cobró y no se pudo registrar se
/// recupera sola en el próximo arranque. Terminarla antes de que el servidor
/// confirme la borra para siempre, con la plata ya cobrada.
@MainActor
enum Compras {
    /// Los identificadores de los productos, tal cual están creados en App
    /// Store Connect. Si no coinciden carácter por carácter, la lista de
    /// productos vuelve vacía y no hay forma de darse cuenta mirando el código.
    static let productoDePlan: [Plan: String] = [
        .emprendedor: "zentra_emprendedor_mensual",
        .max: "zentra_max_mensual",
    ]

    /// El plan gratis no se compra: no hay producto para él, y está bien así.
    static func productoDe(_ plan: Plan) -> String? { productoDePlan[plan] }

    /// De vuelta: qué plan es un producto. Lo usan los avisos de renovación,
    /// que llegan sin que nadie haya apretado nada.
    static func planDe(_ id: String) -> Plan? {
        productoDePlan.first { $0.value == id }?.key
    }

    /// Cómo terminó el intento, para poder decirlo en pantalla.
    enum Resultado {
        case listo(plan: Plan)
        case cancelado
        case pendiente
        case error(String)
    }

    private static var leidos: [Plan: Product] = [:]

    /// Lo que Apple dice de nuestros productos.
    ///
    /// Vuelve vacío cuando no hay red, cuando los identificadores no coinciden
    /// con App Store Connect, o cuando la suscripción todavía no está
    /// aprobada. No se distingue entre esos casos a propósito: para quien está
    /// mirando la pantalla son todos lo mismo —no se puede comprar ahora—, y
    /// el motivo queda en el registro.
    static func productos() async -> [Plan: Product] {
        if !leidos.isEmpty { return leidos }
        do {
            let encontrados = try await Product.products(for: Set(productoDePlan.values))
            var salida: [Plan: Product] = [:]
            for (plan, id) in productoDePlan {
                if let p = encontrados.first(where: { $0.id == id }) { salida[plan] = p }
            }
            if salida.count < productoDePlan.count {
                let faltan = productoDePlan.values.filter { id in !encontrados.contains { $0.id == id } }
                print("[compras] Apple no conoce estos productos: \(faltan.joined(separator: ", "))")
            }
            leidos = salida
            return salida
        } catch {
            print("[compras] no se pudieron leer los productos: \(error)")
            return [:]
        }
    }

    /// Si en este teléfono, ahora, se puede comprar.
    ///
    /// Las dos condiciones hacen falta. Que Apple conozca los productos es la
    /// obvia. La otra es tener a dónde avisar: sin `COBROS_URL` la compra se
    /// cobraría y el plan no se activaría nunca, que es exactamente el peor
    /// resultado posible. Mejor no mostrar el botón.
    static func sePuedeComprar() async -> Bool {
        guard !Config.cobrosUrl.isEmpty else { return false }
        return !(await productos()).isEmpty
    }

    /// Lo que Apple dice que sale cada plan.
    ///
    /// El precio lo pone App Store Connect, no nosotros: Apple cobra en la
    /// moneda de la cuenta y le aplica sus impuestos, así que el número que ve
    /// la persona puede no ser el mismo que figura en `zentra.planes`.
    /// Mostramos el de Apple, que es el que se le va a cobrar.
    static func precios() async -> [Plan: String] {
        (await productos()).mapValues(\.displayPrice)
    }

    /// Comprar, y después avisarle al servidor.
    static func comprar(_ plan: Plan) async -> Resultado {
        guard let producto = (await productos())[plan] else {
            return .error("Ese plan no se puede comprar ahora. Probá más tarde.")
        }

        let compra: Product.PurchaseResult
        do {
            compra = try await producto.purchase()
        } catch {
            print("[compras] purchase() falló: \(error)")
            return .error("No se pudo completar la compra.")
        }

        switch compra {
        case .userCancelled:
            // Arrepentirse no es fallar, y no lleva mensaje de error.
            return .cancelado
        case .pending:
            // "Pedir permiso para comprar" —una cuenta de menor— o un banco que
            // pide confirmar aparte. La compra puede aprobarse horas después, y
            // cuando se apruebe llega por `escuchar()`.
            return .pendiente
        case .success(let firmado):
            return await registrar(firmado, esperado: producto.id)
        @unknown default:
            return .error("No se pudo completar la compra.")
        }
    }

    /// Mandar el comprobante al servidor y, sólo si contestó bien, terminar la
    /// transacción.
    ///
    /// Se manda el JWS tal como vino, incluso cuando el teléfono dice que no
    /// verifica: quien decide es el servidor, que comprueba la firma contra el
    /// certificado raíz de Apple. Un `.unverified` acá es una pista, no un
    /// veredicto, y descartarlo del lado del teléfono sería confiar en el
    /// teléfono para decidir qué llega a revisarse.
    private static func registrar(
        _ firmado: VerificationResult<StoreKit.Transaction>,
        esperado: String
    ) async -> Resultado {
        if case .unverified(_, let por) = firmado {
            print("[compras] el teléfono no pudo verificar la transacción: \(por)")
        }
        let transaccion = firmado.unsafePayloadValue
        let comprobante = firmado.jwsRepresentation

        guard let plan = planDe(transaccion.productID) else {
            print("[compras] producto desconocido: \(transaccion.productID)")
            return .error("Esa compra no corresponde a ningún plan.")
        }

        do {
            try await avisar(productId: transaccion.productID, comprobante: comprobante)
        } catch {
            // Lo peor que puede pasar: la plata salió y el plan no se activó.
            // No se puede tapar con un "intentá de nuevo", porque intentar de
            // nuevo cobra otra vez. Y la transacción NO se termina: Apple la
            // va a volver a ofrecer en el próximo arranque y ahí se recupera
            // sola, sin que nadie pague dos veces.
            print("[compras] el server no pudo confirmar: "
                  + ((error as? LocalizedError)?.errorDescription ?? "\(error)"))
            return .error("Se cobró, pero no pudimos activar el plan. "
                          + "No vuelvas a comprar: escribinos y lo resolvemos.")
        }

        // Recién acá. Ya está registrada del lado nuestro, así que si Apple la
        // vuelve a ofrecer no hay nada que perder.
        await transaccion.finish()
        if transaccion.productID != esperado {
            // Pasa de verdad: alguien compra Max mientras tiene pendiente un
            // Emprendedor de antes y Apple entrega los dos. Se activó lo que
            // se compró, no lo que se apretó, y conviene que quede dicho.
            print("[compras] se terminó una transacción de \(transaccion.productID), no de \(esperado)")
        }
        return .listo(plan: plan)
    }

    /// El aviso al servidor.
    ///
    /// El servidor es el que decide: comprueba la firma de Apple y recién ahí
    /// activa el plan. La app no puede hacer ninguna de esas dos cosas, y no
    /// debería poder.
    /// Un error de este camino y nada más.
    ///
    /// No se reusa `ApiError` porque sus casos son los del ERP —`sinApi`,
    /// `sinCola`, `sinChat`— y ninguno dice lo que pasa acá. Lo único que hace
    /// falta es un texto que se pueda mostrar.
    private struct Falla: LocalizedError {
        let que: String
        var errorDescription: String? { que }
    }

    private static func avisar(productId: String, comprobante: String) async throws {
        let base = Config.cobrosUrl
        guard !base.isEmpty, let url = URL(string: base + "/apple/verificar") else {
            throw Falla(que: "No hay a dónde avisar de la compra.")
        }
        guard let token = await Auth.shared.tokenVigente() else {
            throw Falla(que: "Volvé a iniciar sesión y probá de nuevo.")
        }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 30
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONSerialization.data(
            withJSONObject: ["productId": productId, "comprobante": comprobante]
        )

        let (datos, resp) = try await URLSession.shared.data(for: req)
        let codigo = (resp as? HTTPURLResponse)?.statusCode ?? 0
        let json = (try? JSONSerialization.jsonObject(with: datos)) as? [String: Any]
        guard codigo == 200, json?["ok"] as? Bool == true else {
            throw Falla(que: (json?["error"] as? String) ?? "No pudimos confirmar la compra.")
        }
    }

    /* ───────────────────── las compras que llegan solas ───────────────────── */

    private static var oreja: Task<Void, Never>?

    /// Escuchar lo que Apple entrega sin que nadie apriete nada.
    ///
    /// Son tres cosas y las tres pasan: la renovación de cada mes, la compra
    /// que quedó esperando aprobación y se aprobó más tarde, y la que se hizo
    /// en otro dispositivo de la misma cuenta. Sin esto, el mes que viene la
    /// suscripción se cobra, el servidor no se entera, y el plan vence con la
    /// persona pagando.
    ///
    /// Se llama una vez al arrancar. Llamarla de nuevo no hace nada.
    static func escuchar() {
        guard oreja == nil else { return }
        oreja = Task.detached {
            for await firmado in StoreKit.Transaction.updates {
                let r = await registrar(firmado, esperado: firmado.unsafePayloadValue.productID)
                if case .error(let motivo) = r {
                    print("[compras] una compra que llegó sola no se pudo registrar: \(motivo)")
                }
            }
        }
    }

    /// Las compras cobradas que nunca llegaron a registrarse.
    ///
    /// Esto es la red de seguridad de todo lo de arriba. Si el servidor estaba
    /// caído, si se cortó la red en el peor momento, si la app se cerró entre
    /// el cobro y el aviso: la transacción quedó sin terminar, Apple la vuelve
    /// a ofrecer, y acá se reintenta. El servidor contesta `repetido` si ya
    /// estaba, así que reintentar de más no le regala meses a nadie.
    ///
    /// Devuelve `true` si recuperó alguna, para poder releer el plan.
    static func reclamarPendientes() async -> Bool {
        guard !Config.cobrosUrl.isEmpty else { return false }
        var alguna = false
        for await firmado in StoreKit.Transaction.unfinished {
            let id = firmado.unsafePayloadValue.productID
            guard planDe(id) != nil else { continue }
            print("[compras] había una compra sin registrar · \(id)")
            if case .listo = await registrar(firmado, esperado: id) { alguna = true }
        }
        return alguna
    }
}

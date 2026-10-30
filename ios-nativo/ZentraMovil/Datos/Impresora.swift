import CoreBluetooth
import Foundation

/// La impresora térmica Bluetooth: buscarla, guardarla y mandarle el ticket.
/// Port de `src/lib/impresora.ts`, con la diferencia que impone iOS.
///
/// **Qué se puede y qué no en iPhone.** En Android el plugin habla con las
/// impresoras por Bluetooth clásico (SPP), que es como funcionan casi todas las
/// ESC/POS baratas. En iPhone ese canal está cerrado: una app sólo puede usar
/// Bluetooth clásico si la impresora está certificada MFi por Apple, y las
/// genéricas no lo están. Lo que sí se puede es **BLE**, que es lo que traen
/// los modelos de los últimos años. Por eso acá se buscan las BLE y, cuando no
/// aparece ninguna, la pantalla lo dice con todas las letras en vez de dejar a
/// alguien probando media hora con una impresora que este teléfono no puede
/// ver.
///
/// **Qué se afirma.** El canal es de ida: la app escribe bytes y la impresora
/// no contesta. Que los bytes hayan salido no es que el papel haya salido
/// —puede estar sin rollo, con la tapa abierta, o haberse cortado a mitad del
/// ticket—. Por eso el resultado bueno se llama `enviado` y no "impreso": es lo
/// único que nos consta. La regla es la misma que en Android, y es la que
/// arregló el botón que decía que imprimía sin imprimir.
@Observable
final class Impresora: NSObject {
    static let shared = Impresora()

    // MARK: - Lo que la pantalla necesita saber

    /// Una impresora encontrada o guardada, con lo justo para poder elegirla.
    struct Vista: Identifiable, Equatable {
        /// El identificador que da iOS. No es la dirección MAC —Apple no la
        /// expone— y es propio de este teléfono: el mismo aparato tiene otro id
        /// en otro iPhone. Alcanza, porque la impresora se elige en cada
        /// teléfono.
        var id: UUID
        var nombre: String
        var detalle: String
        var guardada: Bool
    }

    enum Resultado: Equatable {
        case enviado
        case error(String, reintentable: Bool)
    }

    /// Lo que va apareciendo mientras busca. Se publica de a una y no al final
    /// porque ocho segundos mirando una pantalla quieta es mucho tiempo.
    private(set) var encontradas: [Vista] = []
    private(set) var buscando = false
    private(set) var imprimiendo = false

    /// La elegida, si hay. Se guarda el id entre sesiones: nadie quiere elegir
    /// impresora en cada venta, pero la primera vez hay que elegirla.
    private(set) var guardada: Vista?

    /// Qué rollo tiene puesto.
    ///
    /// Se guarda acá y no se le pregunta a la impresora porque la impresora no
    /// lo sabe. El rollo lo ve la persona que lo cambia, así que se elige una
    /// vez en Configuración y queda.
    var ancho: Ticket.Ancho = Ticket.anchoPorDefecto {
        didSet { UserDefaults.standard.set(ancho.rawValue, forKey: Self.kAncho) }
    }

    private static let kAncho = "zentra.impresora.ancho"
    private static let kId = "zentra.impresora.id"
    private static let kNombre = "zentra.impresora.nombre"

    // MARK: - Lo de adentro

    private var central: CBCentralManager?
    private var aparato: CBPeripheral?
    private var canal: CBCharacteristic?

    /// Las esperas que están colgadas de un callback de CoreBluetooth.
    private var esperandoEncendido: [CheckedContinuation<Bool, Never>] = []
    private var esperandoConexion: CheckedContinuation<Resultado, Never>?
    private var esperandoCanal: CheckedContinuation<Resultado, Never>?
    private var esperandoEco: CheckedContinuation<Void, Never>?
    private var fin: DispatchWorkItem?

    private override init() {
        super.init()
        let mm = UserDefaults.standard.integer(forKey: Self.kAncho)
        ancho = Ticket.anchoValido(mm == 0 ? nil : mm)
        if let s = UserDefaults.standard.string(forKey: Self.kId), let id = UUID(uuidString: s) {
            guardada = Vista(id: id,
                             nombre: UserDefaults.standard.string(forKey: Self.kNombre) ?? "Impresora",
                             detalle: "Bluetooth", guardada: true)
        }
    }

    /// El manager se crea recién cuando hace falta.
    ///
    /// Crearlo es lo que dispara el cartel de permiso de Bluetooth del sistema.
    /// Hacerlo al abrir la app sería pedir un permiso en frío, sin que la
    /// persona haya tocado nada que lo explique, y eso se niega. Es la misma
    /// regla que ya sigue la ubicación.
    private func prender() -> CBCentralManager {
        if let central { return central }
        // En `main` a propósito: así los callbacks llegan en el hilo donde vive
        // la pantalla y no hace falta saltar de cola en cada uno.
        let c = CBCentralManager(delegate: self, queue: .main)
        central = c
        return c
    }

    /// Espera a que el Bluetooth diga en qué estado está. `false` si no quedó
    /// encendido.
    private func listo() async -> Bool {
        let c = prender()
        if c.state == .poweredOn { return true }
        if c.state != .unknown && c.state != .resetting { return false }
        // `unknown` es el estado del primer instante, antes del primer aviso
        // del sistema: no es que esté apagado, es que todavía no contestó.
        return await withCheckedContinuation { cont in
            esperandoEncendido.append(cont)
        }
    }

    private func porQueNo(_ estado: CBManagerState) -> String {
        switch estado {
        case .poweredOff: "El Bluetooth del teléfono está apagado. Prendelo y volvé a intentar."
        case .unauthorized:
            "Falta el permiso de Bluetooth. Se habilita en Ajustes → Zentra → Bluetooth."
        case .unsupported: "Este teléfono no puede hablar con impresoras Bluetooth."
        default: "El Bluetooth no está disponible en este momento."
        }
    }

    // MARK: - Buscar

    /// Busca impresoras durante unos segundos.
    ///
    /// Sin filtrar por servicio: cada marca usa el suyo —FFE0, 18F0, FF00 y
    /// unos cuantos más— y una lista de servicios conocidos deja afuera
    /// justamente a la impresora rara que alguien compró. Se muestran las que
    /// anuncian nombre, que es lo único con lo que alguien puede reconocer la
    /// suya en una lista.
    @discardableResult
    func buscar(segundos: TimeInterval = 8) async -> Resultado {
        guard await listo() else {
            return .error(porQueNo(central?.state ?? .unknown), reintentable: true)
        }
        encontradas = []
        buscando = true
        let c = prender()
        // `retrieveConnectedPeripherals` trae las que el sistema ya tiene
        // conectadas: una impresora emparejada desde Ajustes no aparece en el
        // escaneo, y sin esto no habría forma de elegirla.
        for p in c.retrieveConnectedPeripherals(withServices: Self.serviciosConocidos) {
            anotar(p, rssi: nil)
        }
        c.scanForPeripherals(withServices: nil,
                             options: [CBCentralManagerOptionShowPowerAlertKey: true])

        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            let w = DispatchWorkItem { cont.resume() }
            fin = w
            DispatchQueue.main.asyncAfter(deadline: .now() + segundos, execute: w)
        }
        c.stopScan()
        buscando = false
        return .enviado
    }

    /// Los servicios de impresora más vistos. Sólo se usan para preguntar por
    /// las ya conectadas: el escaneo va sin filtro.
    private static let serviciosConocidos = [
        CBUUID(string: "FFE0"), CBUUID(string: "18F0"), CBUUID(string: "FF00"),
        CBUUID(string: "FFF0"), CBUUID(string: "49535343-FE7D-4AE5-8FA9-9FAFD205E455"),
    ]

    private func anotar(_ p: CBPeripheral, rssi: NSNumber?) {
        guard let nombre = p.name, !nombre.isEmpty else { return }
        guard !encontradas.contains(where: { $0.id == p.identifier }) else { return }
        let señal = rssi.map { " · señal \($0.intValue) dBm" } ?? " · ya conectada"
        encontradas.append(Vista(id: p.identifier, nombre: nombre,
                                 detalle: "Bluetooth" + señal,
                                 guardada: p.identifier == guardada?.id))
    }

    // MARK: - Elegir

    /// Conecta con una y la deja guardada.
    ///
    /// Se guarda recién si la conexión funcionó y si el aparato tiene por dónde
    /// recibir el ticket: guardar una impresora a la que no se pudo conectar es
    /// guardar un problema para la primera venta apurada.
    func elegir(_ v: Vista) async -> Resultado {
        let r = await conectar(v.id)
        guard case .enviado = r else { return r }
        guardada = Vista(id: v.id, nombre: v.nombre, detalle: v.detalle, guardada: true)
        UserDefaults.standard.set(v.id.uuidString, forKey: Self.kId)
        UserDefaults.standard.set(v.nombre, forKey: Self.kNombre)
        encontradas = encontradas.map {
            Vista(id: $0.id, nombre: $0.nombre, detalle: $0.detalle, guardada: $0.id == v.id)
        }
        return .enviado
    }

    /// La saca de la lista. Vuelve a preguntar la próxima vez que se imprima.
    func olvidar() {
        if let a = aparato { central?.cancelPeripheralConnection(a) }
        aparato = nil
        canal = nil
        guardada = nil
        UserDefaults.standard.removeObject(forKey: Self.kId)
        UserDefaults.standard.removeObject(forKey: Self.kNombre)
        encontradas = encontradas.map {
            Vista(id: $0.id, nombre: $0.nombre, detalle: $0.detalle, guardada: false)
        }
    }

    private func conectar(_ id: UUID) async -> Resultado {
        guard await listo() else {
            return .error(porQueNo(central?.state ?? .unknown), reintentable: true)
        }
        let c = prender()

        if let a = aparato, a.identifier == id, a.state == .connected, canal != nil {
            return .enviado
        }
        guard let p = c.retrievePeripherals(withIdentifiers: [id]).first else {
            return .error("No encontramos la impresora guardada. Prendela, acercate, y si sigue sin "
                + "aparecer volvé a elegirla en Configuración.", reintentable: true)
        }

        aparato = p
        canal = nil
        p.delegate = self

        let conexion = await conTiempo(10, "La impresora no responde: puede estar apagada o fuera de alcance.") {
            await withCheckedContinuation { (cont: CheckedContinuation<Resultado, Never>) in
                self.esperandoConexion = cont
                c.connect(p, options: nil)
            }
        }
        guard case .enviado = conexion else {
            esperandoConexion = nil
            c.cancelPeripheralConnection(p)
            return conexion
        }

        return await conTiempo(10, "La impresora se conectó pero no contestó qué sabe hacer. Apagala y prendela.") {
            await withCheckedContinuation { (cont: CheckedContinuation<Resultado, Never>) in
                self.esperandoCanal = cont
                p.discoverServices(nil)
            }
        }
    }

    /// Lo mismo pero con un límite de paciencia.
    ///
    /// CoreBluetooth no avisa cuando algo simplemente no pasa: si la impresora
    /// está apagada, `connect` queda esperando para siempre y la pantalla se
    /// queda girando sin decir nada.
    private func conTiempo(_ segundos: TimeInterval, _ motivo: String,
                           _ cuerpo: @escaping () async -> Resultado) async -> Resultado
    {
        await withTaskGroup(of: Resultado.self) { grupo in
            grupo.addTask { await cuerpo() }
            grupo.addTask {
                try? await Task.sleep(nanoseconds: UInt64(segundos * 1_000_000_000))
                return .error(motivo, reintentable: true)
            }
            let primera = await grupo.next() ?? .error(motivo, reintentable: true)
            grupo.cancelAll()
            return primera
        }
    }

    // MARK: - Imprimir

    /// Manda el ticket de una venta.
    func imprimir(_ v: Ticket.Venta, emisor: Ticket.Emisor) async -> Resultado {
        await mandar(Ticket.lineas(v, emisor: emisor, ancho: ancho))
    }

    /// Un ticket de prueba, para saber si la impresora quedó bien elegida sin
    /// tener que hacer una venta.
    func imprimirPrueba() async -> Resultado {
        await mandar(Ticket.lineasDePrueba(ancho))
    }

    private func mandar(_ lineas: [String]) async -> Resultado {
        guard let destino = guardada else {
            return .error("Todavía no elegiste impresora. Se elige una vez, en Configuración.",
                          reintentable: false)
        }
        imprimiendo = true
        defer { imprimiendo = false }

        let r = await conectar(destino.id)
        guard case .enviado = r else { return r }
        guard let canal, let aparato else {
            return .error("La impresora no tiene por dónde recibir el ticket. Puede ser un aparato "
                + "Bluetooth que no es una impresora.", reintentable: false)
        }

        let bytes = Ticket.escpos(lineas)
        // De a pedacitos: BLE manda paquetes chicos, y una impresora que recibe
        // más de lo que su buffer aguanta imprime media línea y descarta el
        // resto. El tamaño lo dice el propio aparato.
        let tipo: CBCharacteristicWriteType =
            canal.properties.contains(.write) ? .withResponse : .withoutResponse
        let tope = max(20, aparato.maximumWriteValueLength(for: tipo))

        var desde = bytes.startIndex
        while desde < bytes.endIndex {
            guard aparato.state == .connected else {
                return .error("La impresora se desconectó a mitad del ticket. Si salió medio papel, "
                    + "es esto: revisá el rollo antes de reimprimir.", reintentable: true)
            }
            let hasta = bytes.index(desde, offsetBy: tope, limitedBy: bytes.endIndex) ?? bytes.endIndex
            let pedazo = Data(bytes[desde..<hasta])
            if tipo == .withResponse {
                await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
                    esperandoEco = cont
                    aparato.writeValue(pedazo, for: canal, type: .withResponse)
                }
            } else {
                aparato.writeValue(pedazo, for: canal, type: .withoutResponse)
                // Sin respuesta no hay a qué esperar, y mandar todo de golpe
                // desborda el buffer de las impresoras chicas.
                try? await Task.sleep(nanoseconds: 20_000_000)
            }
            desde = hasta
        }
        return .enviado
    }

}

// MARK: - CoreBluetooth
//
// Los callbacks llegan en `main` porque así se creó el manager, de modo que
// todo esto toca el estado de la pantalla sin saltar de cola.

extension Impresora: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        let encendido = central.state == .poweredOn
        let esperando = esperandoEncendido
        esperandoEncendido = []
        for c in esperando { c.resume(returning: encendido) }
    }

    func centralManager(_ central: CBCentralManager, didDiscover p: CBPeripheral,
                        advertisementData: [String: Any], rssi: NSNumber)
    {
        anotar(p, rssi: rssi)
    }

    func centralManager(_ central: CBCentralManager, didConnect p: CBPeripheral) {
        esperandoConexion?.resume(returning: .enviado)
        esperandoConexion = nil
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) {
        esperandoConexion?.resume(returning: .error(
            "No pudimos conectarnos a la impresora. Fijate que esté prendida, cerca, y que no esté "
                + "conectada a otro teléfono.", reintentable: true))
        esperandoConexion = nil
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral p: CBPeripheral,
                        error: Error?)
    {
        if p.identifier == aparato?.identifier { canal = nil }
        // Si algo estaba esperando, se le contesta: una espera sin respuesta es
        // la pantalla girando para siempre.
        esperandoCanal?.resume(returning: .error(
            "La impresora se desconectó. Fijate que esté prendida y cerca.", reintentable: true))
        esperandoCanal = nil
        esperandoEco?.resume()
        esperandoEco = nil
    }
}

extension Impresora: CBPeripheralDelegate {
    func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
        guard error == nil, let servicios = p.services, !servicios.isEmpty else {
            esperandoCanal?.resume(returning: .error(
                "La impresora no dijo qué sabe hacer. Apagala, prendela y volvé a elegirla.",
                reintentable: true))
            esperandoCanal = nil
            return
        }
        for s in servicios { p.discoverCharacteristics(nil, for: s) }
    }

    func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
        // La primera por donde se pueda escribir, venga del servicio que venga:
        // cada marca usa el suyo y una lista de servicios conocidos deja afuera
        // justo a la impresora que alguien tiene.
        if canal == nil,
           let c = s.characteristics?.first(where: {
               $0.properties.contains(.write) || $0.properties.contains(.writeWithoutResponse)
           })
        {
            canal = c
            esperandoCanal?.resume(returning: .enviado)
            esperandoCanal = nil
            return
        }
        // El último servicio sin haber encontrado nada: es un aparato Bluetooth
        // que no recibe. Decirlo es más útil que un "no se pudo imprimir".
        if canal == nil, let ultimo = p.services?.last, ultimo.uuid == s.uuid {
            esperandoCanal?.resume(returning: .error(
                "Ese aparato no recibe tickets: no es una impresora, o es de las que el iPhone no "
                    + "puede usar (las que no son Bluetooth LE).", reintentable: false))
            esperandoCanal = nil
        }
    }

    func peripheral(_ p: CBPeripheral, didWriteValueFor c: CBCharacteristic, error: Error?) {
        esperandoEco?.resume()
        esperandoEco = nil
    }
}

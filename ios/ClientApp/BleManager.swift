import Foundation
import CoreBluetooth

/// Gestionnaire BLE côté iPhone : joue le rôle de central et détecte le lecteur de porte à proximité.
final class BleManager: NSObject, ObservableObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    @Published var isNearby: Bool = false
    
    private var central: CBCentralManager!
    private var targetPeripheral: CBPeripheral?
    
    /// UUID de service BLE exposé par le lecteur de porte (à configurer aussi côté Raspberry Pi).
    /// Mets ici un vrai UUID que tu utiliseras sur le Pi, par ex. généré avec `uuidgen`.
    private let serviceUUID = CBUUID(string: "00000000-0000-0000-0000-000000000001")
    
    /// Préfixe du nom Bluetooth du lecteur, par ex. "SmartRoom-101"
    private let deviceNamePrefix = "SmartRoom-"
    
    private var onDoorShouldOpen: (() -> Void)?
    private var isScanning: Bool = false
    private var expectedRoomId: String?
    
    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: .main)
    }
    
    /// Démarre la détection automatique pour une chambre donnée.
    /// Quand un lecteur correspondant est détecté et connecté, on déclenche `onProximity`.
    func startMonitoring(roomId: String, onProximity: @escaping () -> Void) {
        expectedRoomId = roomId
        onDoorShouldOpen = onProximity
        
        guard central.state == .poweredOn else {
            // Le scan sera (re)lancé dans `centralManagerDidUpdateState`
            return
        }
        
        startScanIfNeeded()
    }
    
    /// Arrête complètement la détection BLE.
    func stopMonitoring() {
        isScanning = false
        central.stopScan()
        if let p = targetPeripheral {
            central.cancelPeripheralConnection(p)
        }
        targetPeripheral = nil
        isNearby = false
        onDoorShouldOpen = nil
        expectedRoomId = nil
    }
    
    private func startScanIfNeeded() {
        guard !isScanning else { return }
        isScanning = true
        let options: [String: Any] = [CBCentralManagerScanOptionAllowDuplicatesKey: false]
        central.scanForPeripherals(withServices: [serviceUUID], options: options)
        print("🔍 [BleManager] Scan BLE démarré pour service \(serviceUUID.uuidString)")
    }
    
    // MARK: - CBCentralManagerDelegate
    
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        switch central.state {
        case .poweredOn:
            print("✅ [BleManager] Bluetooth ON")
            if onDoorShouldOpen != nil {
                startScanIfNeeded()
            }
        case .poweredOff:
            print("⚠️ [BleManager] Bluetooth OFF")
            stopMonitoring()
        default:
            print("ℹ️ [BleManager] État Bluetooth: \(central.state.rawValue)")
        }
    }
    
    func centralManager(_ central: CBCentralManager,
                        didDiscover peripheral: CBPeripheral,
                        advertisementData: [String : Any],
                        rssi RSSI: NSNumber) {
        let name = peripheral.name ?? "Unknown"
        print("🔎 [BleManager] Périphérique découvert: \(name), RSSI=\(RSSI)")
        
        // Filtre sur le préfixe + (optionnel) numéro de chambre attendu
        if name.hasPrefix(deviceNamePrefix),
           let expectedRoomId = expectedRoomId {
            let expectedName = deviceNamePrefix + expectedRoomId
            guard name == expectedName else {
                return
            }
        }
        
        // On a trouvé notre lecteur : on se connecte puis on déclenche l'ouverture.
        isNearby = true
        targetPeripheral = peripheral
        central.stopScan()
        isScanning = false
        central.connect(peripheral, options: nil)
        print("✅ [BleManager] Lecteur détecté, connexion en cours…")
    }
    
    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        print("✅ [BleManager] Connecté au lecteur BLE \(peripheral.name ?? "Unknown")")
        
        // Pour la démo : pas d'échange GATT complexe, on déclenche directement l'ouverture via HTTP.
        onDoorShouldOpen?()
        
        // On se déconnecte ensuite pour économiser la batterie et permettre d'autres démos.
        central.cancelPeripheralConnection(peripheral)
        targetPeripheral = nil
        isNearby = false
        
        // On relance le scan tant que le monitoring est actif.
        if onDoorShouldOpen != nil {
            startScanIfNeeded()
        }
    }
    
    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        print("❌ [BleManager] Échec de connexion au lecteur BLE: \(error?.localizedDescription ?? "inconnu")")
        targetPeripheral = nil
        isNearby = false
        if onDoorShouldOpen != nil {
            startScanIfNeeded()
        }
    }
}


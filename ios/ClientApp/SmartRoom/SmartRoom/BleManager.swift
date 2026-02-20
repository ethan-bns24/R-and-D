import Foundation
import CoreBluetooth
import CryptoKit
import Combine

final class BleManager: NSObject, ObservableObject, CBCentralManagerDelegate, CBPeripheralDelegate, CBPeripheralManagerDelegate {
    struct ScannedDevice: Identifiable, Equatable {
        let id: UUID
        let name: String
        let identifier: String
        let rssi: Int
        let lastSeen: Date
        let isRegistered: Bool
    }

    struct OpenRequest {
        let doorID: UUID
        let keyID: UUID
        let grantID: UUID
        let secretBase: Data
    }

    struct OpenResult {
        let success: Bool
        let errorCode: UInt16
        let message: String
    }

    private let serviceUUID = CBUUID(string: "C0DE0001-3F2A-4E9B-9B1E-0A8C2D3A4B5C")
    private let controlUUID = CBUUID(string: "C0DE0002-3F2A-4E9B-9B1E-0A8C2D3A4B5C")
    private let statusUUID = CBUUID(string: "C0DE0003-3F2A-4E9B-9B1E-0A8C2D3A4B5C")
    private let infoUUID = CBUUID(string: "C0DE0004-3F2A-4E9B-9B1E-0A8C2D3A4B5C")

    @Published var isScanning = false
    @Published private(set) var scannedDevices: [ScannedDevice] = []
    @Published private(set) var centralStateLabel: String = "Initialisation"
    @Published private(set) var emitterTestStatus: String = "Non lance"

    private var central: CBCentralManager!
    private var peripheralManager: CBPeripheralManager?
    private var peripheral: CBPeripheral?

    private var controlChar: CBCharacteristic?
    private var statusChar: CBCharacteristic?
    private var infoChar: CBCharacteristic?

    private var request: OpenRequest?
    private var completion: ((OpenResult) -> Void)?

    private var protoVersion: UInt8 = 1
    private var challengeNonce: Data?
    private var knownDoorIDs: Set<UUID> = []
    private var knownBleNames: Set<String> = []
    private var isConnecting = false
    private var connectedDoorID: UUID?
    private var statusNotifyReady = false
    private var pendingGetChallenge = false
    private var pendingGetChallengeWorkItem: DispatchWorkItem?
    private var challengeRetryWorkItem: DispatchWorkItem?
    private var challengeRetryCount = 0
    private let maxChallengeRetries = 4
    private var scannedByPeripheralID: [UUID: ScannedDevice] = [:]
    private var openTimeoutWorkItem: DispatchWorkItem?
    private var sawCompatibleDuringOpen = false
    private var sawChallengeDuringOpen = false
    private let openTimeoutSeconds: TimeInterval = 25
    private var emitterTestCompletion: ((String) -> Void)?
    private var emitterTestWorkItem: DispatchWorkItem?
    private let emitterTestServiceUUID = CBUUID(string: "C0DE0001-3F2A-4E9B-9B1E-0A8C2D3A4B5C")
    private let forcedDoorDeviceName = "DoorAccess-1a7d2ade"

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: .main)
    }

    func setRegisteredDoors(doorIDs: [String], bleIDs: [String]) {
        knownDoorIDs = Set(doorIDs.compactMap { UUID(uuidString: $0) })
        knownBleNames = Set(bleIDs.map { normalizeBleIdentifier($0) })
        knownBleNames.insert(normalizeBleIdentifier(forcedDoorDeviceName))

        if central.state == .poweredOn {
            startScanIfNeeded()
        }
    }

    func setRegisteredDoorIDs(_ doorIDs: [String]) {
        setRegisteredDoors(doorIDs: doorIDs, bleIDs: [])
    }

    func runEmitterSelfTest(completion: @escaping (String) -> Void) {
        emitterTestCompletion = completion
        emitterTestStatus = "Test emission en cours..."

        if let peripheralManager {
            handleEmitterState(peripheralManager.state)
            return
        }

        peripheralManager = CBPeripheralManager(delegate: self, queue: .main)
    }

    func openDoor(doorID: String, keyID: String, grantID: String, secretBaseB64: String, completion: @escaping (OpenResult) -> Void) {
        guard let doorUUID = UUID(uuidString: doorID),
              let keyUUID = UUID(uuidString: keyID),
              let grantUUID = UUID(uuidString: grantID),
              let secretData = Data(base64Encoded: secretBaseB64) else {
            completion(OpenResult(success: false, errorCode: 0x0009, message: "Parametres invalides"))
            return
        }

        self.request = OpenRequest(doorID: doorUUID, keyID: keyUUID, grantID: grantUUID, secretBase: secretData)
        self.completion = completion
        self.challengeNonce = nil
        self.sawCompatibleDuringOpen = false
        self.sawChallengeDuringOpen = false
        bumpOpenTimeout()

        switch central.state {
        case .poweredOn:
            if isReadyForDoor(doorUUID) {
                sendGetChallenge()
                return
            }
            if let peripheral, let infoChar, peripheral.state == .connected {
                peripheral.readValue(for: infoChar)
            }
            startScanIfNeeded()
        case .unknown, .resetting:
            // Etat transitoire du stack BLE: on attend le callback poweredOn.
            break
        default:
            failPending(message: bluetoothUnavailableMessage(for: central.state))
        }
    }

    private func startScanIfNeeded() {
        guard central.state == .poweredOn else { return }
        guard !isScanning else { return }
        isScanning = true
        central.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
    }

    private func stopScan() {
        isScanning = false
        central.stopScan()
    }

    private func finish(_ result: OpenResult) {
        openTimeoutWorkItem?.cancel()
        openTimeoutWorkItem = nil
        sawCompatibleDuringOpen = false
        sawChallengeDuringOpen = false
        completion?(result)
        completion = nil
        request = nil
        challengeNonce = nil
        if let peripheral {
            central.cancelPeripheralConnection(peripheral)
        }
    }

    private func failPending(message: String, errorCode: UInt16 = 0x0009) {
        guard let completion else { return }
        openTimeoutWorkItem?.cancel()
        openTimeoutWorkItem = nil
        sawCompatibleDuringOpen = false
        sawChallengeDuringOpen = false
        let result = OpenResult(success: false, errorCode: errorCode, message: message)
        self.completion = nil
        self.request = nil
        self.challengeNonce = nil
        completion(result)
    }

    private func bumpOpenTimeout() {
        guard request != nil else { return }
        openTimeoutWorkItem?.cancel()

        let workItem = DispatchWorkItem { [weak self] in
            guard let self else { return }
            guard self.request != nil else { return }

            if self.sawChallengeDuringOpen {
                self.failPending(message: "Challenge BLE recu mais authentification non finalisee")
            } else if self.sawCompatibleDuringOpen {
                self.failPending(message: "Porte BLE detectee, mais connexion GATT impossible")
            } else if self.scannedDevices.isEmpty {
                self.failPending(message: "Aucun device BLE detecte")
            } else {
                self.failPending(message: "Aucune porte BLE compatible detectee")
            }
        }

        openTimeoutWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + openTimeoutSeconds, execute: workItem)
    }

    private func bluetoothUnavailableMessage(for state: CBManagerState) -> String {
        switch state {
        case .poweredOff:
            return "Bluetooth desactive sur le telephone"
        case .unauthorized:
            return "Autorisation Bluetooth refusee"
        case .unsupported:
            return "Bluetooth non supporte (simulateur?)"
        default:
            return "Bluetooth indisponible"
        }
    }

    private func centralStateText(for state: CBManagerState) -> String {
        switch state {
        case .poweredOn:
            return "Bluetooth actif"
        case .poweredOff:
            return "Bluetooth desactive"
        case .unauthorized:
            return "Bluetooth non autorise"
        case .unsupported:
            return "Bluetooth non supporte"
        case .resetting:
            return "Bluetooth en reinitialisation"
        case .unknown:
            return "Etat Bluetooth inconnu"
        @unknown default:
            return "Etat Bluetooth inconnu"
        }
    }

    private func handleEmitterState(_ state: CBManagerState) {
        switch state {
        case .poweredOn:
            startEmitterAdvertisingTest()
        case .poweredOff:
            completeEmitterTest("Test emission KO: Bluetooth desactive")
        case .unauthorized:
            completeEmitterTest("Test emission KO: permission Bluetooth refusee")
        case .unsupported:
            completeEmitterTest("Test emission KO: mode peripheral non supporte")
        case .resetting, .unknown:
            emitterTestStatus = "Test emission: attente de l'etat Bluetooth..."
        @unknown default:
            completeEmitterTest("Test emission KO: etat Bluetooth inconnu")
        }
    }

    private func startEmitterAdvertisingTest() {
        guard let peripheralManager else { return }

        emitterTestWorkItem?.cancel()
        peripheralManager.stopAdvertising()
        peripheralManager.removeAllServices()

        let service = CBMutableService(type: emitterTestServiceUUID, primary: true)
        peripheralManager.add(service)

        let timeout = DispatchWorkItem { [weak self] in
            self?.completeEmitterTest("Test emission KO: timeout advertising")
        }
        emitterTestWorkItem = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 8, execute: timeout)
    }

    private func completeEmitterTest(_ message: String) {
        emitterTestWorkItem?.cancel()
        emitterTestWorkItem = nil

        peripheralManager?.stopAdvertising()
        peripheralManager?.removeAllServices()

        emitterTestStatus = message
        emitterTestCompletion?(message)
        emitterTestCompletion = nil
    }

    private func isReadyForDoor(_ doorID: UUID) -> Bool {
        guard let peripheral else { return false }
        guard peripheral.state == .connected else { return false }
        guard connectedDoorID == doorID else { return false }
        return controlChar != nil && statusNotifyReady
    }

    private func resetGattState() {
        controlChar = nil
        statusChar = nil
        infoChar = nil
        statusNotifyReady = false
        pendingGetChallenge = false
        pendingGetChallengeWorkItem?.cancel()
        pendingGetChallengeWorkItem = nil
        challengeRetryWorkItem?.cancel()
        challengeRetryWorkItem = nil
        challengeRetryCount = 0
        protoVersion = 1
    }

    private func disconnectActivePeripheral() {
        guard let peripheral else { return }
        if peripheral.state != .disconnected {
            central.cancelPeripheralConnection(peripheral)
            return
        }
        self.peripheral = nil
        connectedDoorID = nil
        isConnecting = false
        resetGattState()
    }

    private func handleConnectionIssue(message: String) {
        if request != nil {
            finish(OpenResult(success: false, errorCode: 0x0009, message: message))
        } else {
            disconnectActivePeripheral()
            startScanIfNeeded()
        }
    }

    private func normalizeBleIdentifier(_ raw: String) -> String {
        raw
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
    }

    private func isKnownBleName(_ raw: String?) -> Bool {
        guard let raw else { return false }
        return knownBleNames.contains(normalizeBleIdentifier(raw))
    }

    private func isRegisteredDiscovery(peripheral: CBPeripheral, advertisementData: [String: Any]) -> Bool {
        let localName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
        return isKnownBleName(peripheral.name)
            || isKnownBleName(localName)
    }

    private func shouldConnectToDiscovered(peripheral: CBPeripheral, advertisementData: [String: Any]) -> Bool {
        if request != nil {
            return knownBleNames.isEmpty || isRegisteredDiscovery(peripheral: peripheral, advertisementData: advertisementData)
        }
        return isRegisteredDiscovery(peripheral: peripheral, advertisementData: advertisementData)
    }

    private func updateScannedDevice(peripheral: CBPeripheral, advertisementData: [String: Any], rssi: NSNumber) {
        let localName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
        let name = localName ?? peripheral.name ?? "Inconnu"
        let now = Date()
        let isRegistered = isRegisteredDiscovery(peripheral: peripheral, advertisementData: advertisementData)
        if request != nil && isRegistered {
            sawCompatibleDuringOpen = true
        }
        let device = ScannedDevice(
            id: peripheral.identifier,
            name: name,
            identifier: peripheral.identifier.uuidString,
            rssi: rssi.intValue,
            lastSeen: now,
            isRegistered: isRegistered
        )

        scannedByPeripheralID[peripheral.identifier] = device
        scannedDevices = scannedByPeripheralID.values.sorted { lhs, rhs in
            if lhs.rssi == rhs.rssi {
                return lhs.lastSeen > rhs.lastSeen
            }
            return lhs.rssi > rhs.rssi
        }
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        centralStateLabel = centralStateText(for: central.state)

        if central.state == .poweredOn {
            startScanIfNeeded()
            return
        }

        if central.state != .unknown && central.state != .resetting {
            failPending(message: bluetoothUnavailableMessage(for: central.state))
        }
        disconnectActivePeripheral()
        if central.state != .poweredOn {
            stopScan()
        }
    }

    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        guard peripheral === peripheralManager else { return }
        guard emitterTestCompletion != nil else { return }
        handleEmitterState(peripheral.state)
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
        guard peripheral === peripheralManager else { return }
        guard emitterTestCompletion != nil else { return }

        if let error {
            completeEmitterTest("Test emission KO: ajout service impossible (\(error.localizedDescription))")
            return
        }

        peripheral.startAdvertising([
            CBAdvertisementDataLocalNameKey: "SmartRoom-Test",
            CBAdvertisementDataServiceUUIDsKey: [emitterTestServiceUUID]
        ])
    }

    func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
        guard peripheral === peripheralManager else { return }
        guard emitterTestCompletion != nil else { return }

        if let error {
            completeEmitterTest("Test emission KO: advertising refuse (\(error.localizedDescription))")
            return
        }

        emitterTestWorkItem?.cancel()
        let success = DispatchWorkItem { [weak self] in
            self?.completeEmitterTest("Test emission OK: le telephone emet en BLE")
        }
        emitterTestWorkItem = success
        DispatchQueue.main.asyncAfter(deadline: .now() + 2, execute: success)
    }

    func centralManager(_ central: CBCentralManager,
                        didDiscover peripheral: CBPeripheral,
                        advertisementData: [String : Any],
                        rssi RSSI: NSNumber) {
        updateScannedDevice(peripheral: peripheral, advertisementData: advertisementData, rssi: RSSI)
        guard self.peripheral == nil else { return }
        guard !isConnecting else { return }
        guard shouldConnectToDiscovered(peripheral: peripheral, advertisementData: advertisementData) else { return }
        bumpOpenTimeout()
        resetGattState()
        self.peripheral = peripheral
        self.connectedDoorID = nil
        self.isConnecting = true
        peripheral.delegate = self
        central.connect(peripheral, options: nil)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        isConnecting = false
        bumpOpenTimeout()
        peripheral.discoverServices([serviceUUID])
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        if self.peripheral?.identifier == peripheral.identifier {
            self.peripheral = nil
            self.connectedDoorID = nil
            self.isConnecting = false
            resetGattState()
        }
        startScanIfNeeded()
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        if self.peripheral?.identifier == peripheral.identifier {
            self.peripheral = nil
            self.connectedDoorID = nil
            self.isConnecting = false
            resetGattState()
        }
        startScanIfNeeded()
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard error == nil else {
            handleConnectionIssue(message: "Services BLE indisponibles")
            return
        }
        bumpOpenTimeout()

        guard let services = peripheral.services, !services.isEmpty else {
            handleConnectionIssue(message: "Aucun service GATT detecte")
            return
        }

        guard let service = services.first(where: { $0.uuid == serviceUUID }) else {
            handleConnectionIssue(message: "Porte detectee mais service GATT attendu introuvable")
            return
        }

        peripheral.discoverCharacteristics([controlUUID, statusUUID, infoUUID], for: service)
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard error == nil else {
            handleConnectionIssue(message: "Caracteristiques BLE indisponibles")
            return
        }
        bumpOpenTimeout()

        service.characteristics?.forEach { ch in
            switch ch.uuid {
            case controlUUID: controlChar = ch
            case statusUUID: statusChar = ch
            case infoUUID: infoChar = ch
            default: break
            }
        }

        guard let statusChar, let infoChar else {
            handleConnectionIssue(message: "Profil GATT incomplet")
            return
        }

        peripheral.setNotifyValue(true, for: statusChar)
        if statusChar.isNotifying {
            statusNotifyReady = true
        }
        peripheral.readValue(for: infoChar)
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        guard characteristic.uuid == statusUUID else { return }
        if error != nil {
            // Certains stacks BLE ne remontent pas proprement ce callback:
            // on garde un fallback vers l'envoi GET_CHALLENGE.
            statusNotifyReady = false
            if pendingGetChallenge {
                pendingGetChallenge = false
                pendingGetChallengeWorkItem?.cancel()
                pendingGetChallengeWorkItem = nil
                sendGetChallenge()
            }
            return
        }

        statusNotifyReady = characteristic.isNotifying
        if statusNotifyReady && pendingGetChallenge {
            pendingGetChallenge = false
            pendingGetChallengeWorkItem?.cancel()
            pendingGetChallengeWorkItem = nil
            sendGetChallenge()
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard error == nil else {
            handleConnectionIssue(message: "Echange BLE en erreur")
            return
        }

        guard let data = characteristic.value else { return }

        if characteristic.uuid == infoUUID {
            handleInfo(data)
            return
        }

        if characteristic.uuid == statusUUID {
            handleStatus(data)
        }
    }

    private func handleInfo(_ data: Data) {
        let fields = parseTLV(data)

        guard let doorData = fields[0x01], doorData.count == 16,
              let door = UUID(data: doorData) else {
            handleConnectionIssue(message: "Info door_id invalide")
            return
        }

        connectedDoorID = door

        if let version = fields[0x02]?.first {
            protoVersion = version
        }

        // Pendant une demande d'ouverture, on valide uniquement la porte demandee.
        if let req = request {
            if door != req.doorID {
                failPending(
                    message: "Porte detectee (\(door.uuidString.lowercased())) mais grant selectionne pour \(req.doorID.uuidString.lowercased())"
                )
                return
            }

            bumpOpenTimeout()
            requestGetChallenge()
            return
        }

        // Hors ouverture, on ne garde la connexion que pour les portes connues.
        guard knownDoorIDs.contains(door) else {
            disconnectActivePeripheral()
            startScanIfNeeded()
            return
        }
    }

    private func sendGetChallenge() {
        guard let peripheral, let controlChar else {
            finish(OpenResult(success: false, errorCode: 0x0009, message: "ControlPoint absent"))
            return
        }

        let payload = Data([0x01])
        peripheral.writeValue(payload, for: controlChar, type: .withResponse)
        armChallengeRetry()
    }

    private func armChallengeRetry() {
        challengeRetryWorkItem?.cancel()
        guard request != nil else { return }
        guard challengeNonce == nil else { return }
        guard challengeRetryCount < maxChallengeRetries else { return }

        let workItem = DispatchWorkItem { [weak self] in
            guard let self else { return }
            guard self.request != nil else { return }
            guard self.challengeNonce == nil else { return }
            guard self.challengeRetryCount < self.maxChallengeRetries else { return }

            self.challengeRetryCount += 1
            self.sendGetChallenge()
        }

        challengeRetryWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0, execute: workItem)
    }

    private func requestGetChallenge() {
        guard let peripheral, let controlChar, let statusChar else {
            finish(OpenResult(success: false, errorCode: 0x0009, message: "Status ou ControlPoint absent"))
            return
        }

        if statusNotifyReady {
            let payload = Data([0x01])
            peripheral.writeValue(payload, for: controlChar, type: .withResponse)
            armChallengeRetry()
            return
        }

        pendingGetChallenge = true
        pendingGetChallengeWorkItem?.cancel()
        let fallback = DispatchWorkItem { [weak self] in
            guard let self else { return }
            guard self.pendingGetChallenge else { return }
            self.pendingGetChallenge = false
            self.sendGetChallenge()
        }
        pendingGetChallengeWorkItem = fallback
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5, execute: fallback)
        peripheral.setNotifyValue(true, for: statusChar)
    }

    private func handleStatus(_ data: Data) {
        guard data.count >= 1 else { return }
        let eventType = data[0]
        let tlv = parseTLV(data.dropFirst())

        if eventType == 0x81 {
            guard let nonce = tlv[0x12], nonce.count == 32 else {
                finish(OpenResult(success: false, errorCode: 0x0009, message: "Nonce invalide"))
                return
            }
            challengeRetryWorkItem?.cancel()
            challengeRetryWorkItem = nil
            challengeRetryCount = 0
            sawChallengeDuringOpen = true
            bumpOpenTimeout()
            challengeNonce = nonce
            sendAuthenticate()
            return
        }

        if eventType == 0x82 {
            let ok = (tlv[0x20]?.first ?? 0) == 1
            let err = beUInt16(tlv[0x21])
            finish(OpenResult(success: ok, errorCode: err, message: ok ? "Porte ouverte" : "Acces refuse (code: \(err))"))
        }
    }

    private func sendAuthenticate() {
        guard let req = request,
              let nonce = challengeNonce,
              let peripheral,
              let controlChar else {
            finish(OpenResult(success: false, errorCode: 0x0009, message: "Etat auth invalide"))
            return
        }

        let secretDoor = deriveSecretDoor(secretBase: req.secretBase, doorID: req.doorID)

        var msg = Data()
        msg.append(nonce)
        msg.append(req.doorID.data)
        msg.append(req.keyID.data)
        msg.append(protoVersion)

        let mac = Data(HMAC<SHA256>.authenticationCode(for: msg, using: SymmetricKey(data: secretDoor)))

        var payload = Data([0x02])
        payload.append(tlv(type: 0x10, value: req.keyID.data))
        payload.append(tlv(type: 0x12, value: nonce))
        payload.append(tlv(type: 0x13, value: mac))
        payload.append(tlv(type: 0x14, value: req.grantID.data))

        peripheral.writeValue(payload, for: controlChar, type: .withResponse)
    }

    private func deriveSecretDoor(secretBase: Data, doorID: UUID) -> Data {
        let salt = doorID.data
        return hkdfSha256(ikm: secretBase, salt: salt, info: Data("door-access-v1".utf8), length: 32)
    }

    private func hkdfSha256(ikm: Data, salt: Data, info: Data, length: Int) -> Data {
        let prk = Data(HMAC<SHA256>.authenticationCode(for: ikm, using: SymmetricKey(data: salt)))
        var okm = Data()
        var previous = Data()
        var counter: UInt8 = 1

        while okm.count < length {
            var material = Data()
            material.append(previous)
            material.append(info)
            material.append(counter)
            previous = Data(HMAC<SHA256>.authenticationCode(for: material, using: SymmetricKey(data: prk)))
            okm.append(previous)
            counter = counter &+ 1
        }

        return okm.prefix(length)
    }

    private func parseTLV(_ data: Data) -> [UInt8: Data] {
        var out: [UInt8: Data] = [:]
        var i = 0
        let bytes = [UInt8](data)

        while i + 2 <= bytes.count {
            let t = bytes[i]
            let l = Int(bytes[i + 1])
            i += 2
            if i + l > bytes.count { break }
            out[t] = Data(bytes[i..<(i + l)])
            i += l
        }

        return out
    }

    private func tlv(type: UInt8, value: Data) -> Data {
        var d = Data([type, UInt8(value.count)])
        d.append(value)
        return d
    }

    private func beUInt16(_ data: Data?) -> UInt16 {
        guard let data, data.count == 2 else { return 0x0009 }
        return (UInt16(data[0]) << 8) | UInt16(data[1])
    }
}

private extension UUID {
    var data: Data {
        var value = uuid
        return withUnsafeBytes(of: &value) { Data($0) }
    }

    init?(data: Data) {
        guard data.count == 16 else { return nil }
        var uuidBytes: uuid_t = (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
        _ = withUnsafeMutableBytes(of: &uuidBytes) { data.copyBytes(to: $0)}
        self = UUID(uuid: uuidBytes)
    }
}

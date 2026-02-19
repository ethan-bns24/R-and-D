import Foundation
import CoreBluetooth
import CryptoKit

final class BleManager: NSObject, ObservableObject, CBCentralManagerDelegate, CBPeripheralDelegate {
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

    private var central: CBCentralManager!
    private var peripheral: CBPeripheral?

    private var controlChar: CBCharacteristic?
    private var statusChar: CBCharacteristic?
    private var infoChar: CBCharacteristic?

    private var request: OpenRequest?
    private var completion: ((OpenResult) -> Void)?

    private var protoVersion: UInt8 = 1
    private var challengeNonce: Data?

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: .main)
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

        guard central.state == .poweredOn else {
            completion(OpenResult(success: false, errorCode: 0x0009, message: "Bluetooth indisponible"))
            return
        }

        startScan()
    }

    private func startScan() {
        isScanning = true
        central.scanForPeripherals(withServices: [serviceUUID], options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
    }

    private func stopScan() {
        isScanning = false
        central.stopScan()
    }

    private func finish(_ result: OpenResult) {
        completion?(result)
        completion = nil
        request = nil
        challengeNonce = nil
        if let peripheral {
            central.cancelPeripheralConnection(peripheral)
        }
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state != .poweredOn {
            stopScan()
        }
    }

    func centralManager(_ central: CBCentralManager,
                        didDiscover peripheral: CBPeripheral,
                        advertisementData: [String : Any],
                        rssi RSSI: NSNumber) {
        stopScan()
        self.peripheral = peripheral
        peripheral.delegate = self
        central.connect(peripheral, options: nil)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.discoverServices([serviceUUID])
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        finish(OpenResult(success: false, errorCode: 0x0009, message: "Connexion BLE impossible"))
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard error == nil else {
            finish(OpenResult(success: false, errorCode: 0x0009, message: "Services BLE indisponibles"))
            return
        }

        peripheral.services?.forEach { service in
            if service.uuid == serviceUUID {
                peripheral.discoverCharacteristics([controlUUID, statusUUID, infoUUID], for: service)
            }
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard error == nil else {
            finish(OpenResult(success: false, errorCode: 0x0009, message: "Caracteristiques BLE indisponibles"))
            return
        }

        service.characteristics?.forEach { ch in
            switch ch.uuid {
            case controlUUID: controlChar = ch
            case statusUUID: statusChar = ch
            case infoUUID: infoChar = ch
            default: break
            }
        }

        guard let statusChar, let infoChar else {
            finish(OpenResult(success: false, errorCode: 0x0009, message: "Profil GATT incomplet"))
            return
        }

        peripheral.setNotifyValue(true, for: statusChar)
        peripheral.readValue(for: infoChar)
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard error == nil else {
            finish(OpenResult(success: false, errorCode: 0x0009, message: "Echange BLE en erreur"))
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
        guard let req = request else { return }
        let fields = parseTLV(data)

        guard let doorData = fields[0x01], doorData.count == 16,
              let door = UUID(data: doorData) else {
            finish(OpenResult(success: false, errorCode: 0x0009, message: "Info door_id invalide"))
            return
        }

        if door != req.doorID {
            finish(OpenResult(success: false, errorCode: 0x0001, message: "Mauvaise porte detectee"))
            return
        }

        if let version = fields[0x02]?.first {
            protoVersion = version
        }

        sendGetChallenge()
    }

    private func sendGetChallenge() {
        guard let peripheral, let controlChar else {
            finish(OpenResult(success: false, errorCode: 0x0009, message: "ControlPoint absent"))
            return
        }

        let payload = Data([0x01])
        peripheral.writeValue(payload, for: controlChar, type: .withResponse)
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
        var uuidBytes = uuid_t()
        _ = withUnsafeMutableBytes(of: &uuidBytes) { data.copyBytes(to: $0)}
        self = UUID(uuid: uuidBytes)
    }
}

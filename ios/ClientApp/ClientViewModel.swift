import Foundation
import Combine

@MainActor
final class ClientViewModel: ObservableObject {
    struct DoorRealtimeStatus: Identifiable {
        let id: String
        let grantID: String
        let doorID: String
        let bleID: String
        let validFrom: Date
        let validTo: Date
        let isDetected: Bool
        let rssi: Int?
        let estimatedDistanceMeters: Double?
        let isCloseEnoughToOpen: Bool
        let lastSeen: Date?
    }

    @Published var email: String = "guest@example.com"
    @Published var password: String = "guest123"

    @Published var statusMessage: String = ""
    @Published var isBusy: Bool = false
    @Published var isAuthenticated: Bool = false

    @Published var grants: [ApiClient.MobileGrant] = []
    @Published var selectedGrantID: String?
    @Published var selectedDoorID: String?
    @Published var doorRealtimeStatuses: [DoorRealtimeStatus] = []
    @Published var autoOpenCooldownRemaining: Int = 0

    @Published var scannedDevices: [BleManager.ScannedDevice] = []
    @Published var isBleScanning: Bool = false
    @Published var bleCentralStateLabel: String = "Initialisation"
    @Published var bleEmitterTestStatus: String = "Non lance"

    private let api = ApiClient()
    private let auth = AuthService()
    let bleManager = BleManager()

    private var token: String?
    private var keyID: String?
    private var secretBaseB64: String?
    private var cancellables: Set<AnyCancellable> = []

    // Seuils durcis pour eviter les ouvertures a distance.
    private let autoOpenCooldownSeconds: TimeInterval = 30
    private let autoOpenMaxDistanceMeters: Double = 0.30
    private let autoOpenMinRSSI: Int = -50
    private let autoOpenTxPowerAt1m: Double = -59
    private let autoOpenPathLossExponent: Double = 2.0
    private var nextAutoOpenAllowedAt: Date = .distantPast

    init() {
        bleManager.$scannedDevices
            .receive(on: DispatchQueue.main)
            .sink { [weak self] devices in
                guard let self else { return }
                self.scannedDevices = devices
                self.rebuildDoorRealtimeStatuses(from: devices)
                self.handleAutoOpen(devices: devices)
            }
            .store(in: &cancellables)

        bleManager.$isScanning
            .receive(on: DispatchQueue.main)
            .sink { [weak self] scanning in
                self?.isBleScanning = scanning
            }
            .store(in: &cancellables)

        bleManager.$centralStateLabel
            .receive(on: DispatchQueue.main)
            .sink { [weak self] value in
                self?.bleCentralStateLabel = value
            }
            .store(in: &cancellables)

        bleManager.$emitterTestStatus
            .receive(on: DispatchQueue.main)
            .sink { [weak self] value in
                self?.bleEmitterTestStatus = value
            }
            .store(in: &cancellables)

        Timer.publish(every: 1, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                self?.refreshCooldownRemaining()
            }
            .store(in: &cancellables)

        token = auth.loadToken()
        isAuthenticated = token != nil
        if isAuthenticated {
            statusMessage = "Session restauree"
            Task { await refreshGrants() }
        }
    }

    var autoOpenRuleLabel: String {
        let distance = String(format: "%.2f", autoOpenMaxDistanceMeters)
        return "Auto-ouverture: RSSI >= \(autoOpenMinRSSI) dBm et distance <= \(distance) m"
    }

    var nearestDetectedDoor: DoorRealtimeStatus? {
        doorRealtimeStatuses
            .filter { $0.isDetected }
            .sorted { lhs, rhs in
                (lhs.rssi ?? -200) > (rhs.rssi ?? -200)
            }
            .first
    }

    func login() async {
        isBusy = true
        defer { isBusy = false }
        do {
            let result = try await api.guestLogin(email: email, password: password)
            token = result.access_token
            auth.saveToken(result.access_token)
            isAuthenticated = true
            statusMessage = "Connecte"
            await refreshGrants()
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func logout() {
        auth.clearToken()
        token = nil
        keyID = nil
        secretBaseB64 = nil
        isAuthenticated = false

        grants = []
        selectedGrantID = nil
        selectedDoorID = nil
        doorRealtimeStatuses = []
        scannedDevices = []

        nextAutoOpenAllowedAt = .distantPast
        autoOpenCooldownRemaining = 0

        bleManager.setRegisteredDoors(doorIDs: [], bleIDs: [])
        statusMessage = "Deconnecte"
    }

    func refreshGrants() async {
        guard let token else {
            statusMessage = "Non connecte"
            return
        }

        isBusy = true
        defer { isBusy = false }

        do {
            let payload = try await api.fetchMobileGrants(token: token)
            keyID = payload.key_id
            secretBaseB64 = payload.secret_base_b64
            grants = payload.grants
            selectedGrantID = payload.grants.first?.grant_id
            selectedDoorID = payload.grants.first?.doors.first?.door_id

            let registeredDoorIDs = payload.grants.flatMap { grant in
                grant.doors.map(\.door_id)
            }
            let registeredBleIDs = payload.grants.flatMap { grant in
                grant.doors.map(\.ble_id)
            }
            bleManager.setRegisteredDoors(doorIDs: registeredDoorIDs, bleIDs: registeredBleIDs)

            rebuildDoorRealtimeStatuses(from: scannedDevices)
            statusMessage = "\(payload.grants.count) grant(s) charge(s)"
        } catch {
            if let apiError = error as? ApiClient.ApiError, case .unauthorized = apiError {
                logout()
                statusMessage = "Session expiree, reconnectez-vous"
                return
            }
            statusMessage = error.localizedDescription
        }
    }

    func openSelectedDoor() {
        openDoor(autoTriggered: false, detectedDevice: nil)
    }

    private func openDoor(autoTriggered: Bool, detectedDevice: BleManager.ScannedDevice?) {
        guard let keyID,
              let secretBaseB64 else {
            statusMessage = "Selection grant/door invalide"
            return
        }

        var grantToUse = selectedGrant
        var doorToUse = selectedDoor

        let resolvedFromScan = resolveGrantFromDetectedDoor(detectedDevice)

        if let resolved = resolvedFromScan {
            grantToUse = resolved.grant
            doorToUse = resolved.door
            selectedGrantID = resolved.grant.grant_id
            selectedDoorID = resolved.door.door_id
        } else if let detected = (detectedDevice ?? scannedDevices.first(where: { $0.isRegistered })) {
            statusMessage = "Porte detectee (\(detected.name)) mais aucun grant mobile ne correspond a cette porte"
            return
        }

        guard let grant = grantToUse,
              let door = doorToUse else {
            statusMessage = "Selection grant/door invalide"
            return
        }

        isBusy = true
        if autoTriggered, let detectedDevice {
            statusMessage = "Porte proche detectee (\(detectedDevice.name), \(detectedDevice.rssi) dBm). Connexion BLE en cours..."
        } else {
            statusMessage = "Connexion BLE en cours..."
        }

        bleManager.openDoor(
            doorID: door.door_id,
            keyID: keyID,
            grantID: grant.grant_id,
            secretBaseB64: secretBaseB64
        ) { [weak self] result in
            Task { @MainActor in
                guard let self else { return }
                self.isBusy = false
                if autoTriggered {
                    self.statusMessage = "\(result.message) (cooldown auto 30s)"
                } else {
                    self.statusMessage = result.message
                }
                self.rebuildDoorRealtimeStatuses(from: self.scannedDevices)
            }
        }
    }

    private func normalizeBleID(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private func fallbackBleIDForDoor(_ doorID: String) -> String? {
        let compact = doorID.replacingOccurrences(of: "-", with: "").lowercased()
        guard compact.count >= 8 else { return nil }
        return "dooraccess-\(compact.prefix(8))"
    }

    private func resolveGrantFromDetectedDoor(_ detectedDevice: BleManager.ScannedDevice? = nil) -> (grant: ApiClient.MobileGrant, door: ApiClient.MobileDoor)? {
        guard let detected = (detectedDevice ?? scannedDevices.first(where: { $0.isRegistered })) else { return nil }
        let detectedName = normalizeBleID(detected.name)

        for grant in grants {
            if let door = grant.doors.first(where: { normalizeBleID($0.ble_id) == detectedName }) {
                return (grant, door)
            }
        }

        if detectedName.hasPrefix("dooraccess-") {
            let suffix = String(detectedName.dropFirst("dooraccess-".count))
            guard suffix.count == 8 else { return nil }

            for grant in grants {
                if let door = grant.doors.first(where: {
                    let compact = $0.door_id.replacingOccurrences(of: "-", with: "").lowercased()
                    return compact.hasPrefix(suffix)
                }) {
                    return (grant, door)
                }
            }
        }

        return nil
    }

    private func matchingScannedDevice(for door: ApiClient.MobileDoor, in devices: [BleManager.ScannedDevice]) -> BleManager.ScannedDevice? {
        let bleID = normalizeBleID(door.ble_id)
        if let matchByBleID = devices.first(where: { normalizeBleID($0.name) == bleID }) {
            return matchByBleID
        }

        guard let fallback = fallbackBleIDForDoor(door.door_id) else { return nil }
        return devices.first(where: { normalizeBleID($0.name) == fallback })
    }

    private func rebuildDoorRealtimeStatuses(from devices: [BleManager.ScannedDevice]) {
        var output: [DoorRealtimeStatus] = []

        for grant in grants {
            for door in grant.doors {
                let matched = matchingScannedDevice(for: door, in: devices)
                let rssi = matched?.rssi
                let distance = rssi.map { estimatedDistanceMeters(fromRSSI: $0) }
                let ready = matched.map(isWithinAutoOpenRange) ?? false

                output.append(
                    DoorRealtimeStatus(
                        id: "\(grant.grant_id)|\(door.door_id)",
                        grantID: grant.grant_id,
                        doorID: door.door_id,
                        bleID: door.ble_id,
                        validFrom: Date(timeIntervalSince1970: TimeInterval(grant.from_ts)),
                        validTo: Date(timeIntervalSince1970: TimeInterval(grant.to_ts)),
                        isDetected: matched != nil,
                        rssi: rssi,
                        estimatedDistanceMeters: distance,
                        isCloseEnoughToOpen: ready,
                        lastSeen: matched?.lastSeen
                    )
                )
            }
        }

        doorRealtimeStatuses = output.sorted { lhs, rhs in
            if lhs.isCloseEnoughToOpen != rhs.isCloseEnoughToOpen {
                return lhs.isCloseEnoughToOpen && !rhs.isCloseEnoughToOpen
            }
            if lhs.isDetected != rhs.isDetected {
                return lhs.isDetected && !rhs.isDetected
            }
            return (lhs.rssi ?? -200) > (rhs.rssi ?? -200)
        }
    }

    private func handleAutoOpen(devices: [BleManager.ScannedDevice]) {
        refreshCooldownRemaining()

        guard isAuthenticated else { return }
        guard keyID != nil, secretBaseB64 != nil else { return }
        guard !isBusy else { return }
        guard autoOpenCooldownRemaining == 0 else { return }

        let eligibleDevices = devices
            .filter { $0.isRegistered }
            .sorted { $0.rssi > $1.rssi }

        guard let candidate = eligibleDevices.first(where: { isWithinAutoOpenRange($0) && resolveGrantFromDetectedDoor($0) != nil }) else {
            return
        }

        nextAutoOpenAllowedAt = Date().addingTimeInterval(autoOpenCooldownSeconds)
        refreshCooldownRemaining()
        openDoor(autoTriggered: true, detectedDevice: candidate)
    }

    private func refreshCooldownRemaining() {
        let remaining = max(0, Int(ceil(nextAutoOpenAllowedAt.timeIntervalSinceNow)))
        autoOpenCooldownRemaining = remaining
    }

    private func isWithinAutoOpenRange(_ device: BleManager.ScannedDevice) -> Bool {
        guard device.rssi != 127 else { return false }
        guard device.rssi >= autoOpenMinRSSI else { return false }
        let estimatedDistance = estimatedDistanceMeters(fromRSSI: device.rssi)
        return estimatedDistance <= autoOpenMaxDistanceMeters
    }

    private func estimatedDistanceMeters(fromRSSI rssi: Int) -> Double {
        let exponent = (autoOpenTxPowerAt1m - Double(rssi)) / (10 * autoOpenPathLossExponent)
        return pow(10, exponent)
    }

    func runBleEmitterTest() {
        bleManager.runEmitterSelfTest { [weak self] message in
            Task { @MainActor in
                self?.statusMessage = message
            }
        }
    }

    var selectedGrant: ApiClient.MobileGrant? {
        grants.first(where: { $0.grant_id == selectedGrantID })
    }

    var selectedDoor: ApiClient.MobileDoor? {
        selectedGrant?.doors.first(where: { $0.door_id == selectedDoorID })
            ?? selectedGrant?.doors.first
    }
}

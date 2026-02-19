import Foundation

@MainActor
final class ClientViewModel: ObservableObject {
    @Published var email: String = "guest@example.com"
    @Published var password: String = "guest123"

    @Published var statusMessage: String = ""
    @Published var isBusy: Bool = false

    @Published var grants: [ApiClient.MobileGrant] = []
    @Published var selectedGrantID: String?
    @Published var selectedDoorID: String?

    private let api = ApiClient()
    private let auth = AuthService()
    let bleManager = BleManager()

    private var token: String?
    private var keyID: String?
    private var secretBaseB64: String?

    init() {
        token = auth.loadToken()
        if token != nil {
            Task { await refreshGrants() }
        }
    }

    func login() async {
        isBusy = true
        defer { isBusy = false }
        do {
            let result = try await api.guestLogin(email: email, password: password)
            token = result.access_token
            auth.saveToken(result.access_token)
            statusMessage = "Connecte"
            await refreshGrants()
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func logout() {
        auth.clearToken()
        token = nil
        grants = []
        keyID = nil
        secretBaseB64 = nil
        selectedGrantID = nil
        selectedDoorID = nil
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
            self.keyID = payload.key_id
            self.secretBaseB64 = payload.secret_base_b64
            self.grants = payload.grants
            self.selectedGrantID = payload.grants.first?.grant_id
            self.selectedDoorID = payload.grants.first?.doors.first?.door_id
            statusMessage = "\(payload.grants.count) grant(s) charge(s)"
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func openSelectedDoor() {
        guard let keyID,
              let secretBaseB64,
              let grant = selectedGrant,
              let door = selectedDoor else {
            statusMessage = "Selection grant/door invalide"
            return
        }

        isBusy = true
        statusMessage = "Connexion BLE en cours..."

        bleManager.openDoor(
            doorID: door.door_id,
            keyID: keyID,
            grantID: grant.grant_id,
            secretBaseB64: secretBaseB64
        ) { [weak self] result in
            Task { @MainActor in
                guard let self else { return }
                self.isBusy = false
                self.statusMessage = result.message
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


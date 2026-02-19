import Foundation
import Combine

@MainActor
final class ClientViewModel: ObservableObject {
    @Published var roomId: String = "101"
    @Published var token: String = ""
    @Published var statusMessage: String = ""
    @Published var isVerifying: Bool = false
    
    // Authentification
    @Published var isAuthenticated: Bool = false
    @Published var currentUser: User? = nil
    @Published var email: String = ""
    @Published var password: String = ""
    @Published var isLoggingIn: Bool = false
    @Published var loginError: String = ""
    @Published var isFetchingToken: Bool = false

    private let api = ApiClient()
    
    init() {
        // Mode démo : on utilise le même token client hardcodé que le dashboard web
        // (DEMO_CLIENT_TOKEN dans grms-web/src/App.jsx)
        let demoToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiN2ZjOTY3OTQtYTA4My00YWExLWI1YjktYzE4OWRjNmYzOTlmIiwiZW1haWwiOiIxQDIuZnIiLCJuYW1lIjoiSmVhbiBKZWFuIiwiZXhwIjo0ODY3MTIwMDAwLCJpYXQiOjE3Mzk4NDgwMDAsImlzcyI6ImdybXMifQ.OPJA1RvlYzm_EXVAqoZbL1x-mT4rhAkQrKx0nEjX1js"
        let demoUser = User(
            id: -1,
            name: "Jean Jean (démo)",
            email: "1@2.fr",
            phone: nil,
            status: nil
        )
        AuthService.shared.saveAuth(token: demoToken, user: demoUser)
        isAuthenticated = true
        currentUser = demoUser

        // Optionnel : récupère automatiquement l'accès actif pour afficher la chambre + clé
        Task { await self.fetchMyToken() }
    }
    
    func checkAuthStatus() {
        isAuthenticated = AuthService.shared.isAuthenticated()
        currentUser = AuthService.shared.getUser()
    }
    
    func login() async {
        guard !email.isEmpty && !password.isEmpty else {
            loginError = "Email et mot de passe requis"
            return
        }
        
        isLoggingIn = true
        loginError = ""
        defer { isLoggingIn = false }
        
        do {
            let response = try await api.login(email: email, password: password)
            AuthService.shared.saveAuth(token: response.token, user: response.user)
            isAuthenticated = true
            currentUser = response.user
            email = ""
            password = ""
        } catch {
            loginError = error.localizedDescription
        }
    }
    
    func logout() {
        AuthService.shared.logout()
        isAuthenticated = false
        currentUser = nil
        email = ""
        password = ""
        token = ""
        statusMessage = ""
    }

    func fetchMyToken() async {
        guard isAuthenticated else { return }

        isFetchingToken = true
        defer { isFetchingToken = false }

        do {
            let grantsResponse = try await api.getMobileGrants()
            guard let firstGrant = grantsResponse.grants.first else {
                token = ""
                roomId = ""
                statusMessage = "Aucun accès actif. Fais un check-in pour ce client dans le dashboard."
                return
            }

            // Chambre : room_number si dispo, sinon fallback sur ble_id de la 1ère porte
            if let roomNumber = firstGrant.room_number, !roomNumber.trimmingCharacters(in: .whitespaces).isEmpty {
                roomId = roomNumber
            } else if let bleId = firstGrant.doors?.first?.ble_id, !bleId.trimmingCharacters(in: .whitespaces).isEmpty {
                roomId = bleId
            } else {
                roomId = ""
            }

            // Clé active : on utilise grant_id (clé masquée dans l'UI)
            token = firstGrant.grant_id
            statusMessage = "Accès trouvé pour la chambre \(roomId). Clé active prête pour le BLE."
        } catch {
            statusMessage = "Erreur lors de la récupération des accès mobiles: \(error.localizedDescription)"
        }
    }

    func verifyAccess() async {
        guard let room = Int(roomId.trimmingCharacters(in: .whitespaces)), !token.isEmpty else {
            statusMessage = "Renseigne un Room ID valide et une clé."
            return
        }

        isVerifying = true
        defer { isVerifying = false }

        do {
            let result = try await api.verifyToken(token: token, roomId: room)
            if result.ok {
                statusMessage = "Accès autorisé – la porte s'ouvre !"
            } else {
                let reason = result.reason ?? "erreur"
                statusMessage = "Accès refusé : \(reason)."
            }
        } catch {
            statusMessage = "Erreur de connexion au room-core : \(error.localizedDescription)"
        }
    }
}

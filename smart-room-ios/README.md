# smart-room-ios

Application iOS (Swift/SwiftUI) pour le projet de chambre intelligente Accor.

## Structure recommandée du projet Xcode

- `SmartRoomApp.swift` : point d'entrée SwiftUI.
- `Models/` : structures `Stay`, `Room`, `AccessToken`.
- `Services/ApiClient.swift` : communication avec l'API GRMS (HTTP).
- `Services/BleController.swift` : gestion CoreBluetooth pour l'échange de token avec le room-core.
- `ViewModels/` : logique de présentation (ex: `DashboardViewModel`, `RoomAccessViewModel`).
- `Views/` : écrans SwiftUI.

## Étapes pour créer le projet sur ta machine

1. Ouvrir Xcode et créer un nouveau projet **App iOS**.
2. Nom du projet : `SmartRoom` ; Interface : **SwiftUI**, Langage : **Swift**.
3. Enregistrer le projet dans ce dossier : `smart-room-ios`.
4. Ajouter les groupes suivants dans Xcode : `Models`, `Services`, `ViewModels`, `Views`.
5. Activer la capacité **Bluetooth** dans les `Signing & Capabilities`.
6. Dans `Info.plist`, ajouter les clés de permission Bluetooth (`NSBluetoothAlwaysUsageDescription`).

## Configuration de base

Dans `ApiClient`, prévoir :
- une propriété `baseURL` pointant sur `http://localhost:4000` (ou l'IP de ta machine si tu testes sur un iPhone physique),
- des méthodes pour récupérer les séjours / tokens et mettre à jour l'état de la chambre.

Dans `BleController`, prévoir :
- un rôle **central** CoreBluetooth,
- le scan du périphérique simulant la chambre,
- une méthode `sendToken(_:)` qui écrit le token dans une caractéristique définie.

Ce README sert de guide pour que tu puisses créer et lancer l'app iOS localement via Xcode.

---

## Application iOS cliente (SmartRoomClientApp)

Une ébauche d'app iOS côté client est fournie dans le dossier `smart-room-ios/ClientApp`.
Elle est écrite en **SwiftUI** et se connecte directement à l'API GRMS existante.

### Fichiers principaux

- `SmartRoomClientApp.swift` : point d'entrée `@main` de l'app.
- `ApiClient.swift` : petit client HTTP qui appelle `POST /tokens/verify` sur le backend.
- `ClientViewModel.swift` : logique de présentation (Room ID, token, statut, appel réseau).
- `ContentView.swift` : interface SwiftUI (formulaire simple pour saisir la clé et simuler l'approche du lecteur).

### Flux côté appli iOS

1. Le token est généré côté accueil (dashboard web) après un check-in.
2. Le client copie/colle (ou scanne, dans une version future) ce token dans l'app iOS.
3. L'app appelle `POST /tokens/verify` avec `tokenValue` + `roomId`.
4. Le backend applique la même logique que pour la simulation web (fenêtre de validité, état de la chambre, verrouillage intrusion) et renvoie `ok` / `reason`.
5. L'app affiche un message :
   - **"Accès autorisé – la porte s'ouvre (simulation)."**
   - ou **"Accès refusé : ..."** en cas de clé expirée / invalide / chambre verrouillée.

### Création du projet Xcode

1. Ouvre Xcode et crée un nouveau projet **iOS App**.
2. Nom du projet : `SmartRoomClient` (par exemple), Interface : **SwiftUI**, Langage : **Swift**.
3. Enregistre le projet dans `smart-room-ios` puis remplace les fichiers générés par ceux du dossier `ClientApp` (ou ajoute-les au projet via "Add Files to...").
4. Dans `ApiClient.swift`, adapte la constante `baseURL` :
   - `http://localhost:4000` pour tester sur le **simulateur iOS** sur le même Mac.
   - `http://IP_DE_TON_MAC:4000` si tu testes sur un **iPhone réel** connecté au même réseau que ton Mac.
5. Lance l'app sur le simulateur : tu peux maintenant vérifier un token en temps réel contre ton backend GRMS.


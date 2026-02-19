# 📱 Configuration iOS - Communication avec le backend

## Problème résolu

Les fichiers `ApiClient.swift` ont été mis à jour pour utiliser `localhost` par défaut, ce qui fonctionne avec le **simulateur iOS**.

## Configuration actuelle

### Pour le simulateur iOS (sur le même Mac)
- **GRMS API** : `http://localhost:4000`
- **Room Core** : `http://localhost:5001`

### Pour iPhone physique (sur le réseau local)
Si tu testes sur un iPhone réel, tu dois utiliser l'IP réseau de ton Mac :

1. Trouve l'IP de ton Mac :
   ```bash
   ipconfig getifaddr en0
   ```

2. Modifie les fichiers `ApiClient.swift` :
   - `smart-room-ios/SmartRoomClient/SmartRoomClient/ApiClient.swift`
   - `smart-room-ios/ClientApp/ApiClient.swift`
   
   Change :
   ```swift
   private let grmsURL = URL(string: "http://localhost:4000")!
   private let roomCoreURL = URL(string: "http://localhost:5001")!
   ```
   
   En :
   ```swift
   private let grmsURL = URL(string: "http://TON_IP:4000")!  // ex: http://10.5.174.21:4000
   private let roomCoreURL = URL(string: "http://TON_IP:5001")!  // ex: http://10.5.174.21:5001
   ```

## Services à démarrer

Pour que l'app iOS fonctionne, tu dois démarrer :

### 1. Backend GRMS (port 4000)
```bash
cd "/Users/ethanbns/Documents/ESILV_A5/Ecole/R&D/grms-api"
node index.js
```

### 2. Room Core (port 5001) - Optionnel pour BLE
```bash
cd "/Users/ethanbns/Documents/ESILV_A5/Ecole/R&D/room-core"
node index.js
```

### 3. Frontend Web (port 5174) - Optionnel
```bash
cd "/Users/ethanbns/Documents/ESILV_A5/Ecole/R&D/grms-web"
npm run dev -- --host 0.0.0.0 --port 5174
```

## Vérification

1. **Backend GRMS** : Ouvre http://localhost:4000/rooms dans ton navigateur
   - Tu devrais voir un JSON avec 4 chambres

2. **Room Core** : Ouvre http://localhost:5001 dans ton navigateur
   - Tu devrais voir un message de statut

3. **App iOS** : 
   - Ouvre l'app dans Xcode
   - Connecte-toi avec un compte (ex: ethan@test.com / test123)
   - L'app devrait pouvoir récupérer les tokens et communiquer avec le backend

## Note importante

- Le **simulateur iOS** peut utiliser `localhost` car il partage le réseau avec le Mac
- Un **iPhone physique** doit utiliser l'IP réseau du Mac car il est sur un réseau séparé
- Assure-toi que le Mac et l'iPhone sont sur le **même réseau Wi-Fi**

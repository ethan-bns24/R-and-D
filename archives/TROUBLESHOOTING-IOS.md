# 🔧 Dépannage iOS - Erreur de connexion

## Erreur : NSURLErrorDomain error -1011

Cette erreur signifie que l'app iOS ne peut pas se connecter au backend GRMS.

## Solutions

### 1. Vérifier que le backend GRMS est démarré

Le backend doit être démarré **avant** de lancer l'app iOS.

```bash
cd "/Users/ethanbns/Documents/ESILV_A5/Ecole/R&D/grms-api"
node index.js
```

Tu devrais voir :
```
GRMS API listening on port 4000 (accessible sur http://localhost:4000 et http://10.5.174.245:4000)
```

**Laisse ce terminal ouvert.**

### 2. Vérifier que le backend répond

Dans un autre terminal, teste :

```bash
curl http://localhost:4000/auth/login -X POST -H "Content-Type: application/json" -d '{"email":"ethan@test.com","password":"test123"}'
```

Tu devrais voir une réponse JSON avec un token.

### 3. Configuration selon le type d'appareil

#### Simulateur iOS (sur le même Mac)
- Utilise `http://localhost:4000` ✅ (déjà configuré)
- Le simulateur partage le réseau avec le Mac

#### iPhone physique (sur le réseau local)
- Utilise l'IP réseau de ton Mac (ex: `http://10.5.174.21:4000`)
- Modifie `smart-room-ios/SmartRoomClient/SmartRoomClient/ApiClient.swift` :
  ```swift
  private let grmsURL = URL(string: "http://TON_IP:4000")!
  ```
- Assure-toi que le Mac et l'iPhone sont sur le **même réseau Wi-Fi**

### 4. Vérifier les logs dans Xcode

Dans Xcode, ouvre la console (View → Debug Area → Activate Console) et cherche les messages :
- `🔍 [ApiClient] Tentative de connexion à: ...`
- `❌ [ApiClient] Erreur URL: ...`

Ces logs t'indiqueront exactement quelle URL est utilisée et quelle erreur se produit.

### 5. Vérifier les permissions réseau iOS

Dans Xcode :
1. Sélectionne le projet dans le navigateur
2. Va dans l'onglet "Signing & Capabilities"
3. Assure-toi qu'il n'y a pas de restrictions réseau

### 6. Redémarrer le backend

Si le backend était déjà démarré, arrête-le (Ctrl+C) et redémarre-le :

```bash
cd "/Users/ethanbns/Documents/ESILV_A5/Ecole/R&D/grms-api"
node index.js
```

### 7. Vérifier le port 4000

Vérifie qu'aucun autre processus n'utilise le port 4000 :

```bash
lsof -i :4000
```

Si un autre processus utilise le port, arrête-le ou change le port dans `grms-api/index.js`.

## Test rapide

1. **Backend démarré** ✅
2. **Test curl fonctionne** ✅
3. **App iOS recompilée dans Xcode** ✅
4. **Connexion avec ethan@test.com / test123** ✅

Si tout ça fonctionne, l'app devrait se connecter correctement.

## Message d'erreur amélioré

L'app affiche maintenant un message plus clair :
- "Impossible de se connecter au serveur. Vérifiez que le backend GRMS est démarré sur localhost:4000"

Cela t'indique exactement quel est le problème.

# 🚪 Démarrer le Room Core (Simulation de la porte)

## Problème

L'app iOS peut se connecter au GRMS mais ne peut pas ouvrir la porte car le **room-core** n'est pas démarré.

## Solution : Démarrer le Room Core

Le room-core simule la porte de la chambre et communique avec le GRMS pour vérifier les tokens.

### Étape 1 : Installer les dépendances (si nécessaire)

```bash
cd "/Users/ethanbns/Documents/ESILV_A5/Ecole/R&D/room-core"
npm install
```

### Étape 2 : Démarrer le Room Core

```bash
cd "/Users/ethanbns/Documents/ESILV_A5/Ecole/R&D/room-core"
node index.js
```

Tu devrais voir :
```
Room core for room 101 listening on port 5001 (accessible sur http://localhost:5001 et http://10.5.174.21:5001)
⚠️  Note: Si le port 5000 ne fonctionne pas sur macOS, utilisez le port 5001 (AirPlay utilise 5000)
```

**Laisse ce terminal ouvert.**

### Étape 3 : Vérifier que le Room Core répond

Dans un autre terminal :

```bash
curl http://localhost:5001
```

Tu devrais voir une réponse JSON avec le statut de la porte.

### Étape 4 : Tester l'ouverture depuis l'app iOS

1. Assure-toi que :
   - ✅ Le backend GRMS est démarré (port 4000)
   - ✅ Le room-core est démarré (port 5001)
   - ✅ Tu es connecté dans l'app iOS avec un compte qui a un token actif

2. Dans l'app iOS :
   - Clique sur "Tester l'ouverture maintenant"
   - La porte devrait s'ouvrir (simulation)

## Services à démarrer (ordre)

Pour que tout fonctionne, démarre dans cet ordre :

### Terminal 1 : Backend GRMS
```bash
cd "/Users/ethanbns/Documents/ESILV_A5/Ecole/R&D/grms-api"
node index.js
```

### Terminal 2 : Room Core
```bash
cd "/Users/ethanbns/Documents/ESILV_A5/Ecole/R&D/room-core"
node index.js
```

### Terminal 3 : Frontend Web (optionnel)
```bash
cd "/Users/ethanbns/Documents/ESILV_A5/Ecole/R&D/grms-web"
npm run dev -- --host 0.0.0.0 --port 5174
```

## Configuration Room Core

Le room-core est configuré pour :
- **Chambre** : 101 (par défaut, modifiable via `ROOM_ID`)
- **Port** : 5001 (modifiable via `PORT`)
- **GRMS URL** : `http://localhost:4000` (modifiable via `GRMS_URL`)

Pour changer la chambre :
```bash
ROOM_ID=102 node index.js
```

## Vérification complète

1. **Backend GRMS** : http://localhost:4000/rooms ✅
2. **Room Core** : http://localhost:5001 ✅
3. **App iOS** : Connexion réussie ✅
4. **Ouverture de porte** : Devrait fonctionner maintenant ✅

## Note importante

- Le room-core doit être démarré **en même temps** que le backend GRMS
- Si tu testes sur un iPhone physique, assure-toi que le room-core écoute sur `0.0.0.0` (déjà configuré)
- L'app iOS utilise `http://localhost:5001` pour le simulateur, ou l'IP réseau pour un iPhone physique

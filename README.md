# Pullman Concept Room – Prototype GRMS

Ce dépôt contient une maquette fonctionnelle pour le projet R&D **Pullman Concept Room** :

- Backend **GRMS API** (Node/Express)
- Dashboard web **GRMS – Smart Room Dashboard** (React / Vite)
- Squelette d'app iOS (**smart-room-ios**) pour une future intégration BLE

L'objectif principal est de **simuler le GRMS** : gestion des clients, réservations, clés d'accès (tokens), état des chambres et logs.

---

## 1. Prérequis

- macOS (testé sur ta machine)
- **Node.js** récent (>= 18 recommandé)
- **npm** installé
- (optionnel) **TeX Live** pour recompiler le rapport LaTeX

Dans tous les exemples ci‑dessous, on se place dans le dossier racine du projet :

```bash
cd "/Users/ethanbns/Documents/ESILV_A5/Ecole/R&D"
```

---

## 2. Lancer le backend GRMS

Chemin : `grms-api`

Installation des dépendances (à faire une seule fois) :

```bash
cd grms-api
npm install
```

Lancement de l'API :

```bash
cd grms-api
node index.js   # ou npm start si tu ajoutes le script équivalent
```

L'API écoute sur **http://localhost:4000**.

Endpoints principaux :

- `GET /rooms` – liste des chambres et de leur état
- `POST /checkin` – génération de token + occupation de chambre
- `POST /checkout` – libération de chambre + invalidation des clés
- `GET /logs` – logs récents
- `GET /clients`, `POST /clients` – fichier client
- `GET /reservations`, `POST /reservations`, `POST /reservations/:id/checkin` – gestion des réservations et check‑in anticipé
- `POST /tokens/verify` – vérification d'un token (utilisé par le dashboard pour simuler un accès client)

---

## 3. Lancer le dashboard web (vue accueil + vue client)

Chemin : `grms-web`

Installation (une fois) :

```bash
cd grms-web
npm install
```

Lancement en mode développement :

```bash
cd grms-web
npm run dev -- --host 0.0.0.0 --port 5174
```

Le dashboard (vue **accueil / GRMS**) est alors accessible sur :

```text
http://localhost:5174
```

La vue **client (smartphone)** est accessible sur :

```text
http://10.5.174.245:5174/client
```

> **Important :**
> - assure‑toi que le backend GRMS (port 4000) est lancé avant d'ouvrir le dashboard ou la vue client, sinon tu verras des erreurs de connexion ;
> - pour accéder au site depuis ton iPhone, utilise l'adresse IP locale de ton Mac (`10.5.174.245` dans ton cas) avec les mêmes ports : `http://10.5.174.245:5174` (accueil) et `http://10.5.174.245:5174/client` (client).

---

## 4. Scénario de test rapide

1. Ouvrir le backend (`grms-api`) avec `node index.js`.
2. Ouvrir le dashboard (`grms-web`) avec `npm run dev` et aller sur `http://localhost:5174`.
3. Dans **Check‑in client** :
   - `Guest ID` = `guest-1`
   - `Room ID` = `101`
   - Durée de validité = `60` min
   - Cliquer sur **Générer le token sécurisé**.
4. Dans **Chambres** :
   - La chambre 101 passe en **Occupée**.
   - Cliquer sur **Simuler un accès client** pour tester la vérification du token.
5. Dans **Clients & réservations** :
   - Créer un client (Nom + email optionnel) puis une réservation.
   - Utiliser **Check‑in depuis la dernière réservation** pour générer une clé à partir de cette réservation.
6. Terminer par **Libérer la chambre** pour repasser la chambre en **Disponible**.

---

## 5. Rapport LaTeX

Un rapport LaTeX du projet se trouve à la racine : `rapport_pullman.tex`.

Pour le recompiler (optionnel) :

```bash
cd "/Users/ethanbns/Documents/ESILV_A5/Ecole/R&D"
pdflatex -interaction=nonstopmode rapport_pullman.tex
```

Le PDF généré est `rapport_pullman.pdf`.

---

## 6. Dossier iOS

Le dossier `smart-room-ios` contient un `README.md` décrivant la structure recommandée de l'app iOS (SwiftUI + CoreBluetooth). La création et le lancement se font via Xcode directement sur ta machine.

# smart-room-grms
# smart-room-grms

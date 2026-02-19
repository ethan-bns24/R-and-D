# 🚀 Guide de démarrage des services

## Problème identifié

Le frontend essaie de se connecter à `http://10.5.174.21:4000` mais le backend n'est pas accessible sur cette IP.

## Solution : Démarrer le backend et utiliser localhost

### Étape 1 : Démarrer le backend GRMS

Ouvre un terminal et exécute :

```bash
cd "/Users/ethanbns/Documents/ESILV_A5/Ecole/R&D/grms-api"
node index.js
```

Tu devrais voir :
```
GRMS API listening on port 4000 (accessible sur http://localhost:4000 et http://10.5.174.245:4000)
```

**Laisse ce terminal ouvert.**

### Étape 2 : Configurer le frontend pour utiliser localhost

Le frontend utilise `http://10.5.174.21:4000` (probablement défini dans un fichier `.env`).

**Option A : Utiliser localhost (recommandé pour développement local)**

Crée ou modifie le fichier `.env` dans `grms-web/` :

```bash
cd "/Users/ethanbns/Documents/ESILV_A5/Ecole/R&D/grms-web"
echo "VITE_API_URL=http://localhost:4000" > .env
```

**Option B : Utiliser l'IP réseau**

Si tu veux utiliser l'IP réseau, vérifie d'abord que c'est la bonne IP :

```bash
ipconfig getifaddr en0
```

Puis crée le fichier `.env` avec la bonne IP :

```bash
cd "/Users/ethanbns/Documents/ESILV_A5/Ecole/R&D/grms-web"
echo "VITE_API_URL=http://TON_IP:4000" > .env
```

### Étape 3 : Redémarrer le frontend

Arrête le frontend (Ctrl+C) et redémarre-le :

```bash
cd "/Users/ethanbns/Documents/ESILV_A5/Ecole/R&D/grms-web"
npm run dev -- --host 0.0.0.0 --port 5174
```

### Étape 4 : Vérifier

1. Ouvre http://localhost:5174 dans ton navigateur
2. Ouvre la console (F12)
3. Tu devrais voir `API_URL configurée: http://localhost:4000`
4. Les erreurs de connexion devraient disparaître
5. Le dashboard devrait afficher les chambres et clients

## Résumé des URLs

- **Backend API** : http://localhost:4000
- **Frontend Dashboard** : http://localhost:5174
- **Vue Client** : http://localhost:5174/client

## Si ça ne fonctionne toujours pas

1. Vérifie que le backend répond :
   ```bash
   curl http://localhost:4000/rooms
   ```
   Tu devrais voir un JSON avec 4 chambres.

2. Vérifie que le port 4000 n'est pas déjà utilisé :
   ```bash
   lsof -i :4000
   ```

3. Vérifie les logs du backend dans le terminal où il tourne.

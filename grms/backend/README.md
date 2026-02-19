# GRMS Backend (Go/PostgreSQL)

Backend pour le système de gestion des accès chambres d'hôtel (Guest Room Management System).

## Architecture

```
grms-api/
├── cmd/
│   └── server/
│       └── main.go              # Point d'entrée
├── internal/
│   ├── config/                  # Configuration
│   ├── api/
│   │   ├── router.go            # Routes HTTP (Chi)
│   │   ├── middleware/          # JWT, logging
│   │   └── handlers/            # Endpoints HTTP
│   ├── doorlink/                # WebSocket DoorLink (portes)
│   ├── domain/                  # Entités métier
│   ├── repository/              # Accès données (PostgreSQL)
│   ├── service/                 # Logique métier
│   └── pkg/
│       ├── crypto/              # HKDF, AES-GCM, HMAC
│       ├── jwt/                 # Tokens JWT
│       └── db/                  # Pool PostgreSQL
├── migrations/                  # Schéma SQL
├── api/
│   └── openapi.yaml             # Spécification API
├── docker-compose.yml
├── Dockerfile
└── Makefile
```

## Démarrage rapide

### Prérequis
- Go 1.22+
- Docker & Docker Compose
- PostgreSQL 16 (ou via Docker)

### Avec Docker (recommandé)

```bash
# Démarrer PostgreSQL + API
docker-compose up -d

# Voir les logs
docker-compose logs -f grms-api
```

### Sans Docker

```bash
# 1. Démarrer PostgreSQL localement
# 2. Appliquer les migrations
psql -h localhost -U grms -d grms -f migrations/001_initial_schema.up.sql

# 3. Installer les dépendances
go mod download

# 4. Lancer le serveur
go run cmd/server/main.go
```

## Endpoints principaux

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| `POST` | `/v1/auth/signup` | - | Création compte |
| `POST` | `/v1/auth/login` | - | Login utilisateur |
| `GET` | `/v1/auth/me` | User | Info utilisateur |
| `GET` | `/v1/mobile/grants` | User | Grants actifs + secret |
| `POST` | `/v1/backoffice/auth/login` | - | Login staff |
| `POST` | `/v1/backoffice/assign` | Staff | Attribuer chambre |
| `POST` | `/v1/backoffice/revoke` | Staff | Révoquer accès |
| `GET` | `/v1/backoffice/events` | Staff | Historique accès |
| `GET` | `/v1/backoffice/doors` | Staff | État des portes |

## Configuration (env)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4000 | Port API REST |
| `DOORLINK_PORT` | 4001 | Port WebSocket DoorLink |
| `DATABASE_URL` | postgres://grms:grms@localhost:5432/grms | URL PostgreSQL |
| `JWT_SECRET` | grms-secret-... | Secret JWT users |
| `JWT_STAFF_SECRET` | grms-staff-... | Secret JWT staff |
| `MASTER_KEY` | 0123... | Clé AES-256 (hex, 32 bytes) |

## Utilisateurs de test

| Email | Password | Rôle |
|-------|----------|------|
| ethan@test.com | password | Guest |
| lucas@test.com | password | Guest |
| admin@hotel.com | admin | Admin |
| accueil@hotel.com | staff | Staff |

## WebSocket DoorLink (port 4001)

Protocole de synchronisation porte ↔ backend.

### Messages Door → Server
- `hello`: Handshake initial
- `ack`: Confirmation réception grants
- `access_event`: Événement d'accès

### Messages Server → Door
- `welcome`: Réponse au hello
- `grant_replace`: Snapshot complet
- `grant_delta`: Modifications incrémentielles

## Sécurité

- **Secrets**: Chiffrés au repos (AES-256-GCM)
- **Dérivation**: HKDF-SHA256 pour `secret_door`
- **HMAC**: Authentification BLE avec nonce anti-rejeu
- **JWT**: Tokens signés avec expiration
- **Audit**: Journalisation des actions staff

## Développement

```bash
# Tests
go test ./...

# Build
go build -o grms-server ./cmd/server

# Lint (nécessite golangci-lint)
golangci-lint run
```

## Licence

Projet interne - Confidentiel

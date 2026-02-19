const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'grms-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'; // 7 jours

app.use(cors());
app.use(express.json());

// In-memory data for first prototype
// status: 'free' | 'occupied' | 'locked'
let rooms = [
  { id: 101, status: 'free', lockedUntil: null, clientId: null },
  { id: 102, status: 'free', lockedUntil: null, clientId: null },
  { id: 201, status: 'free', lockedUntil: null, clientId: null },
  { id: 202, status: 'free', lockedUntil: null, clientId: null },
];
// token: { value, guestId, roomId, valid, validFrom, validTo }
let tokens = [];
let logs = [];

// very simple in-memory "client file" & reservations
// client: { id, name, email, phone, status, password }
let clients = [];
// reservation: { id, clientId, roomId, startDate, endDate, status }
let reservations = [];

// Seed démo (évite de "tout refaire" après un restart puisque le stockage est en mémoire)
function seedDemoData() {
  if (clients.length) return;
  clients = [
    { id: 1, name: 'Ethan', email: 'ethan@test.com', phone: null, status: null, password: 'test123' },
    { id: 2, name: 'Lucas', email: 'l@test.com', phone: null, status: null, password: 'test' },
  ];
}
seedDemoData();

// Keep a small sliding window of failed attempts per room to detect intrusion
// Structure: { [roomId]: [timestampMs, ...] }
const failedAttemptsByRoom = {};

function registerFailedAttempt(roomId) {
  const now = Date.now();
  if (!failedAttemptsByRoom[roomId]) failedAttemptsByRoom[roomId] = [];
  failedAttemptsByRoom[roomId].push(now);
  // keep only last 5 minutes
  failedAttemptsByRoom[roomId] = failedAttemptsByRoom[roomId].filter(
    (ts) => now - ts <= 5 * 60 * 1000,
  );
}

function tooManyRecentFailures(roomId) {
  const list = failedAttemptsByRoom[roomId] || [];
  // simple rule: 3 échecs dans les 2 dernières minutes
  const now = Date.now();
  const recent = list.filter((ts) => now - ts <= 2 * 60 * 1000);
  return recent.length >= 3;
}

// --- Middleware JWT ---
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token JWT manquant' });
  }
  const token = authHeader.substring(7); // Enlève "Bearer "
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // Ajoute les infos utilisateur à la requête
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token JWT invalide ou expiré' });
  }
}

app.get('/', (req, res) => {
  res.json({ message: 'GRMS API running' });
});

// List rooms
app.get('/rooms', (req, res) => {
  res.json(rooms);
});

// --- Authentification JWT ---
app.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }
  // Trouve le client par email
  const client = clients.find((c) => c.email && c.email.toLowerCase() === email.toLowerCase());
  if (!client) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }
  // Vérifie le mot de passe (en production, utiliser bcrypt.compare)
  if (client.password !== password) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }
  // Génère le JWT
  const token = jwt.sign(
    {
      id: client.id,
      email: client.email,
      name: client.name,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
  // Ne renvoie pas le mot de passe
  const { password: _, ...clientResponse } = client;
  res.json({
    token,
    user: clientResponse,
  });
});

// Endpoint pour vérifier le token JWT (optionnel, pour debug)
app.get('/auth/me', verifyJWT, (req, res) => {
  const clientId = req.user.id;
  const now = Date.now();

  // Chambre associée via token actif (prioritaire)
  const activeToken = tokens
    .filter(
      (t) =>
        t.clientId === clientId &&
        t.valid &&
        now >= t.validFrom &&
        now <= t.validTo,
    )
    .sort((a, b) => b.validTo - a.validTo)[0];

  // Chambre associée via état de chambre occupée (fallback démo)
  const occupiedRoom = rooms.find((r) => r.status === 'occupied' && r.clientId === clientId);

  res.json({
    user: req.user,
    roomId: activeToken?.roomId ?? occupiedRoom?.id ?? null,
  });
});

// Endpoint pour récupérer le token actif d'un client connecté
app.get('/auth/my-token', verifyJWT, (req, res) => {
  const clientId = req.user.id;
  const now = Date.now();
  
  // Trouve le token actif le plus récent pour ce client
  const activeToken = tokens
    .filter(t => 
      t.clientId === clientId &&
      t.valid &&
      now >= t.validFrom &&
      now <= t.validTo
    )
    .sort((a, b) => b.validTo - a.validTo)[0]; // Le plus récent
  
  if (!activeToken) {
    return res.status(404).json({ error: 'Aucun token actif trouvé pour ce client' });
  }
  
  console.log(`[GRMS] /auth/my-token: Client ${clientId} demande son token`);
  console.log(`[GRMS] Tokens disponibles: ${tokens.length}`);
  console.log(`[GRMS] Tokens pour client ${clientId}:`, tokens.filter(t => t.clientId === clientId).map(t => ({ value: t.value.substring(0, 20) + '...', roomId: t.roomId, valid: t.valid, validTo: new Date(t.validTo).toISOString() })));
  
  res.json({ 
    token: activeToken.value,
    roomId: activeToken.roomId,
    validFrom: new Date(activeToken.validFrom).toISOString(),
    validTo: new Date(activeToken.validTo).toISOString()
  });
});

// --- Clients (fichier client) ---
app.get('/clients', (req, res) => {
  res.json(clients);
});

app.post('/clients', (req, res) => {
  const { name, email, phone, status, password } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }
  const client = {
    id: clients.length ? clients[clients.length - 1].id + 1 : 1,
    name,
    email: email || null,
    phone: phone || null,
    status: status || null,
    password: password || null, // En production, hash le mot de passe avec bcrypt
  };
  clients.push(client);
  // Ne renvoie pas le mot de passe dans la réponse
  const { password: _, ...clientResponse } = client;
  res.json(clientResponse);
});

// Mise à jour d'un client
app.put('/clients/:id', (req, res) => {
  const id = Number(req.params.id);
  const client = clients.find((c) => c.id === id);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }
  const { name, email, phone, status } = req.body || {};
  if (name !== undefined) client.name = name;
  if (email !== undefined) client.email = email;
  if (phone !== undefined) client.phone = phone;
  if (status !== undefined) client.status = status;
  res.json(client);
});

// Détail client : fiche + réservations + logs associés
app.get('/clients/:id', (req, res) => {
  const id = Number(req.params.id);
  const client = clients.find((c) => c.id === id);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }
  const clientReservations = reservations.filter((r) => r.clientId === id);
  const clientLogs = logs.filter((l) => l.clientId === id);
  res.json({
    client,
    reservations: clientReservations,
    logs: clientLogs,
  });
});

// --- Réservations ---
app.get('/reservations', (req, res) => {
  const detailed = reservations.map((r) => ({
    ...r,
    client: clients.find((c) => c.id === r.clientId) || null,
  }));
  res.json(detailed);
});

app.post('/reservations', (req, res) => {
  const { clientId, roomId, startDate, endDate } = req.body || {};
  if (!clientId || !roomId || !startDate || !endDate) {
    return res
      .status(400)
      .json({ error: 'clientId, roomId, startDate and endDate are required' });
  }
  const client = clients.find((c) => c.id === clientId);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }
  const room = rooms.find((r) => r.id === roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const reservation = {
    id: reservations.length ? reservations[reservations.length - 1].id + 1 : 1,
    clientId,
    roomId,
    startDate,
    endDate,
    status: 'scheduled', // 'scheduled' | 'in_progress' | 'completed'
  };
  reservations.push(reservation);

  logs.push({
    type: 'RESERVATION_CREATED',
    roomId,
    clientId,
    time: new Date().toISOString(),
  });

  res.json(reservation);
});

// Simple check-in: assign room and generate token
app.post('/checkin', (req, res) => {
  const { clientId, roomId, validFrom, validTo } = req.body || {};
  if (!clientId || !roomId) {
    return res.status(400).json({ error: 'clientId and roomId are required' });
  }
  const client = clients.find(c => c.id === clientId);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }
  const room = rooms.find(r => r.id === roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  room.status = 'occupied';
  room.clientId = clientId;

  const now = Date.now();
  const from = validFrom ? new Date(validFrom).getTime() : now;
  // par défaut, clé valable 1 heure à partir de maintenant
  const to = validTo ? new Date(validTo).getTime() : now + 60 * 60 * 1000;

  const token = {
    value: `${roomId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    clientId, // Associe le token au client
    guestId: client.name, // Garde guestId pour compatibilité avec les logs
    roomId,
    valid: true,
    validFrom: from,
    validTo: to,
  };
  tokens.push(token);

  logs.push({
    type: 'CHECKIN',
    clientId,
    guestId: client.name,
    roomId,
    time: new Date().toISOString(),
  });

  res.json({ token: token.value, client: { id: client.id, name: client.name, email: client.email } });
});

// Check-in basé sur une réservation existante
app.post('/reservations/:id/checkin', (req, res) => {
  const reservationId = Number(req.params.id);
  const reservation = reservations.find((r) => r.id === reservationId);
  if (!reservation) {
    return res.status(404).json({ error: 'Reservation not found' });
  }
  const room = rooms.find((r) => r.id === reservation.roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  room.status = 'occupied';
  room.clientId = reservation.clientId;

  const now = Date.now();
  let from = new Date(reservation.startDate).getTime();
  let to = new Date(reservation.endDate).getTime();

  // Mode démo : on garantit une fenêtre "active maintenant" pour que l'app iOS récupère bien la chambre/le token.
  // - Si la réservation commence dans le futur, on démarre la clé maintenant.
  // - Si la réservation est déjà terminée, on donne 1h à partir de maintenant.
  if (Number.isFinite(from) && now < from) from = now;
  if (!Number.isFinite(from)) from = now;
  if (!Number.isFinite(to) || to <= now) to = now + 60 * 60 * 1000;

  const token = {
    value: `${reservation.roomId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    clientId: reservation.clientId, // Associe le token au client pour /auth/my-token
    guestId: `client-${reservation.clientId}`, // compat / traces
    roomId: reservation.roomId,
    valid: true,
    validFrom: from,
    validTo: to,
  };
  tokens.push(token);

  reservation.status = 'in_progress';

  logs.push({
    type: 'CHECKIN_FROM_RESERVATION',
    roomId: reservation.roomId,
    clientId: reservation.clientId,
    time: new Date().toISOString(),
  });

  res.json({ token: token.value });
});

// Endpoint used by room-core to verify a token
app.post('/tokens/verify', (req, res) => {
  const { tokenValue, roomId } = req.body;
  const now = Date.now();
  const room = rooms.find((r) => r.id === roomId);

  if (!room) {
    return res.status(404).json({ ok: false, reason: 'room_not_found' });
  }

  if (room.lockedUntil && now < room.lockedUntil) {
    // Chambre en mode verrouillage sécurité
    const logLocked = {
      type: 'AUTH_ATTEMPT_LOCKED_ROOM',
      tokenValue,
      roomId,
      time: new Date().toISOString(),
      success: false,
    };
    logs.push(logLocked);
    return res
      .status(423)
      .json({ ok: false, reason: 'room_locked', lockedUntil: room.lockedUntil });
  }

  const token = tokens.find(
    (t) =>
      t.value === tokenValue &&
      t.roomId === roomId &&
      t.valid &&
      now >= t.validFrom &&
      now <= t.validTo,
  );

  const log = {
    type: 'AUTH_ATTEMPT',
    tokenValue,
    roomId,
    time: new Date().toISOString(),
    success: !!token,
  };
  logs.push(log);

  if (!token) {
    registerFailedAttempt(roomId);

    if (tooManyRecentFailures(roomId)) {
      room.status = 'locked';
      room.lockedUntil = Date.now() + 5 * 60 * 1000; // 5 minutes
      logs.push({
        type: 'INTRUSION_LOCK',
        roomId,
        time: new Date().toISOString(),
      });
      return res
        .status(423)
        .json({ ok: false, reason: 'too_many_failures', lockedUntil: room.lockedUntil });
    }

    return res.status(401).json({ ok: false, reason: 'invalid_or_expired_token' });
  }
  res.json({ ok: true });
});

// List logs (for debug/demo)
app.get('/logs', (req, res) => {
  res.json(logs);
});

// Checkout: libérer la chambre et invalider les tokens associés
app.post('/checkout', (req, res) => {
  const { roomId } = req.body || {};
  if (!roomId) {
    return res.status(400).json({ error: 'roomId is required' });
  }
  const room = rooms.find((r) => r.id === roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  room.status = 'free';
  room.lockedUntil = null;
  room.clientId = null;
  failedAttemptsByRoom[roomId] = [];

  // invalider tous les tokens actifs pour cette chambre
  tokens = tokens.map((t) =>
    t.roomId === roomId
      ? {
          ...t,
          valid: false,
          validTo: Date.now(),
        }
      : t,
  );

  logs.push({
    type: 'CHECKOUT',
    roomId,
    time: new Date().toISOString(),
  });

  res.json({ ok: true });
});

// Déverrouillage manuel d'une chambre (après alerte intrusion)
app.post('/rooms/unlock', (req, res) => {
  const { roomId } = req.body || {};
  if (!roomId) {
    return res.status(400).json({ error: 'roomId is required' });
  }
  const room = rooms.find((r) => r.id === roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  room.lockedUntil = null;
  if (room.status === 'locked') {
    // on revient à "free" par défaut ; dans un cas réel on pourrait revenir à "occupied"
    room.status = 'free';
  }
  failedAttemptsByRoom[roomId] = [];

  logs.push({
    type: 'ROOM_UNLOCKED',
    roomId,
    time: new Date().toISOString(),
  });

  res.json({ ok: true });
});

// Endpoint pour que room-core pousse des événements supplémentaires (ouverture porte, etc.)
app.post('/room-events', (req, res) => {
  const { roomId, type, payload } = req.body || {};
  if (!roomId || !type) {
    return res.status(400).json({ error: 'roomId and type are required' });
  }
  logs.push({
    type,
    roomId,
    payload: payload || null,
    time: new Date().toISOString(),
  });
  res.json({ ok: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`GRMS API listening on port ${PORT} (accessible sur http://localhost:${PORT} et http://10.5.174.245:${PORT})`);
});

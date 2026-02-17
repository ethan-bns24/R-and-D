const axios = require('axios');
const express = require('express');
const cors = require('cors');

const GRMS_URL = process.env.GRMS_URL || 'http://localhost:4000';
const ROOM_ID = Number(process.env.ROOM_ID || 101);
const PORT = process.env.PORT || 5001;

// État local de la chambre (simulation TV + gâche)
let doorState = 'closed'; // 'closed' | 'opening' | 'open' | 'locked';
let lastAuth = null;
let localFailedAttempts = 0;
let localLockedUntil = null;

function isLocallyLocked() {
  return localLockedUntil && Date.now() < localLockedUntil;
}

async function talkToGrms(tokenValue, roomIdOverride = null) {
  try {
    // Utilise le roomId fourni ou celui configuré par défaut
    const roomIdToUse = roomIdOverride || ROOM_ID;
    const res = await axios.post(`${GRMS_URL}/tokens/verify`, {
      tokenValue,
      roomId: roomIdToUse,
    });
    return res.data;
  } catch (err) {
    if (err.response) {
      return {
        ok: false,
        reason: err.response.data?.reason || 'grms_error',
        lockedUntil: err.response.data?.lockedUntil,
      };
    }
    return { ok: false, reason: 'network_error' };
  }
}

async function simulateDoorCycle() {
  console.log(`[ROOM ${ROOM_ID}] → commande d'ouverture reçue`);
  doorState = 'opening';
  await new Promise((r) => setTimeout(r, 400));
  doorState = 'open';
  console.log(`[ROOM ${ROOM_ID}] Porte ouverte (simulation)`);

  await new Promise((r) => setTimeout(r, 4000));
  doorState = 'closed';
  console.log(`[ROOM ${ROOM_ID}] Porte refermée (simulation)`);
}

async function handleAuthAttempt(tokenValue, roomIdOverride = null) {
  const now = Date.now();
  const roomIdToUse = roomIdOverride || ROOM_ID;

  if (isLocallyLocked()) {
    console.log(
      `[ROOM ${roomIdToUse}] Tentative refusée (verrouillage local actif jusqu'à ${new Date(
        localLockedUntil,
      ).toISOString()})`,
    );
    lastAuth = {
      at: now,
      success: false,
      reason: 'local_lock',
    };
    return { ok: false, reason: 'local_lock', lockedUntil: localLockedUntil ? new Date(localLockedUntil).toISOString() : null };
  }

  const result = await talkToGrms(tokenValue, roomIdOverride);

  if (!result.ok) {
    localFailedAttempts += 1;
    console.log(
      `[ROOM ${roomIdToUse}] Auth KO (${result.reason || 'inconnu'}), échecs consécutifs: ${localFailedAttempts}`,
    );

    if (localFailedAttempts >= 3) {
      localLockedUntil = Date.now() + 2 * 60 * 1000; // 2 minutes de verrouillage local
      doorState = 'locked';
      console.log(
        `[ROOM ${roomIdToUse}] Passage en mode VERROUILLAGE LOCAL jusqu'à ${new Date(
          localLockedUntil,
        ).toISOString()}`,
      );

      // notifier le GRMS pour log d'événement
      try {
        await axios.post(`${GRMS_URL}/room-events`, {
          roomId: roomIdToUse,
          type: 'LOCAL_LOCK',
          payload: { until: localLockedUntil },
        });
      } catch (e) {
        // best-effort
      }
    }

    lastAuth = {
      at: now,
      success: false,
      reason: result.reason || 'invalid',
    };

    return { ok: false, reason: result.reason || 'invalid', lockedUntil: result.lockedUntil ? new Date(result.lockedUntil).toISOString() : null };
  }

  // Succès
  localFailedAttempts = 0;
  localLockedUntil = null;
  doorState = 'closed';
  lastAuth = {
    at: now,
    success: true,
    reason: 'ok',
  };

  simulateDoorCycle();

  try {
    await axios.post(`${GRMS_URL}/room-events`, {
      roomId: roomIdToUse,
      type: 'DOOR_OPEN',
      payload: { at: new Date().toISOString() },
    });
  } catch (e) {
    // best-effort
  }

  return { ok: true, reason: null, lockedUntil: null };
}

// --- Mode serveur HTTP : cœur de chambre simulé ---
const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Room core running', roomId: ROOM_ID });
});

app.get('/state', (req, res) => {
  res.json({
    roomId: ROOM_ID,
    doorState,
    localFailedAttempts,
    localLockedUntil,
    lastAuth,
  });
});

app.post('/auth', async (req, res) => {
  const { tokenValue, roomId } = req.body || {};
  if (!tokenValue) {
    return res.status(400).json({ error: 'tokenValue is required' });
  }
  // roomId est optionnel : si fourni, on l'utilise, sinon on utilise ROOM_ID configuré
  const roomIdToUse = roomId ? Number(roomId) : null;
  const result = await handleAuthAttempt(tokenValue, roomIdToUse);
  res.json(result);
});

app.post('/unlock', (req, res) => {
  localLockedUntil = null;
  localFailedAttempts = 0;
  if (doorState === 'locked') doorState = 'closed';
  res.json({ ok: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Room core for room ${ROOM_ID} listening on port ${PORT} (accessible sur http://localhost:${PORT} et http://10.5.174.21:${PORT})`);
  console.log(`⚠️  Note: Si le port 5000 ne fonctionne pas sur macOS, utilisez le port 5001 (AirPlay utilise 5000)`);
});

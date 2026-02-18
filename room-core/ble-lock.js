// Script BLE pour Raspberry Pi : joue le rôle de serrure/lecteur de porte.
// Protocole GATT DoorAccess avec encodage TLV
// Nécessite l'installation de `bleno` (ou @abandonware/bleno`) et d'axios :
//   npm install bleno axios

const bleno = require('bleno');
const axios = require('axios');
const crypto = require('crypto');
const { encodeTLVFields, decodeTLV, findTLVField, encodeUUID, decodeUUID, encodeInt64, decodeInt64, encodeUInt16, decodeUInt16 } = require('./tlv');

const GRMS_URL = process.env.GRMS_URL || 'http://localhost:4000';
const ROOM_ID = Number(process.env.ROOM_ID || 101);

// UUIDs du protocole DoorAccess
const SERVICE_UUID = 'C0DE0001-3F2A-4E9B-9B1E-0A8C2D3A4B5C';
const CHAR_INFO_UUID = 'C0DE0004-3F2A-4E9B-9B1E-0A8C2D3A4B5C';      // READ
const CHAR_CONTROL_POINT_UUID = 'C0DE0002-3F2A-4E9B-9B1E-0A8C2D3A4B5C'; // WRITE/WITH_RESPONSE
const CHAR_STATUS_UUID = 'C0DE0003-3F2A-4E9B-9B1E-0A8C2D3A4B5C';      // NOTIFY

// UUID de la porte (généré à partir du ROOM_ID pour la démo)
function getDoorUUID(roomId) {
  // Génère un UUID déterministe à partir du roomId
  const hex = roomId.toString(16).padStart(32, '0');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

function generateUUIDFromString(str) {
  // Génère un UUID déterministe (16 bytes) à partir d'une chaîne
  // Utilise SHA-256 pour créer un hash puis prend les 16 premiers bytes
  const hash = crypto.createHash('sha256').update(str, 'utf8').digest();
  const hex = hash.slice(0, 16).toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

const DOOR_UUID = getDoorUUID(ROOM_ID);
const PROTO_VERSION = 0x01;
const CAPABILITIES = 0x0001; // bit0=BLE

// Secret de base partagé avec l'app iOS et, idéalement, le GRMS.
const SECRET_BASE = process.env.SECRET_BASE || 'smartroom-demo-secret-base-change-me';

// Gestion des challenges et nonces pour anti-rejeu (fenêtre 30s)
const NONCE_TTL_MS = 30 * 1000;
const challenges = new Map(); // keyId -> { nonce: Buffer, timestamp: number }

console.log(`[BLE-LOCK] Démarrage pour chambre ${ROOM_ID}, GRMS: ${GRMS_URL}`);
console.log(`[BLE-LOCK] Door UUID: ${DOOR_UUID}`);

function deriveDoorKey(doorId) {
  return crypto.hkdfSync(
    'sha256',
    Buffer.from(SECRET_BASE, 'utf8'),
    Buffer.from(String(doorId), 'utf8'), // salt = door_id
    Buffer.from('door-access-v1', 'utf8'),
    32
  );
}

function registerNonce(nonceBuf, keyId) {
  const now = Date.now();
  const key = `${keyId}-${nonceBuf.toString('hex')}`;
  
  // Purge des vieux challenges
  for (const [k, v] of challenges.entries()) {
    if (now - v.timestamp > NONCE_TTL_MS) {
      challenges.delete(k);
    }
  }
  
  if (challenges.has(key)) {
    return false; // rejeu dans la fenêtre
  }
  
  challenges.set(key, { nonce: nonceBuf, timestamp: now });
  return true;
}

async function verifyWithGrms(tokenValue, roomIdOverride = null) {
  const roomIdToUse = roomIdOverride || ROOM_ID;
  try {
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

// Caractéristique Info (READ)
class InfoCharacteristic extends bleno.Characteristic {
  constructor() {
    super({
      uuid: CHAR_INFO_UUID,
      properties: ['read'],
      descriptors: [
        new bleno.Descriptor({
          uuid: '2901',
          value: 'DoorAccess Info (TLV)',
        }),
      ],
    });
  }

  onReadRequest(offset, callback) {
    console.log('[BLE-LOCK] Info characteristic lue');
    
    const doorTime = Math.floor(Date.now() / 1000);
    
    const payload = encodeTLVFields([
      { tag: 0x01, value: encodeUUID(DOOR_UUID) },           // door_id
      { tag: 0x02, value: Buffer.from([PROTO_VERSION]) },     // proto_version
      { tag: 0x03, value: encodeUInt16(CAPABILITIES) },       // capabilities
      { tag: 0x04, value: encodeInt64(doorTime) },           // door_time
    ]);
    
    callback(this.RESULT_SUCCESS, payload.slice(offset));
  }
}

// Caractéristique ControlPoint (WRITE/WITH_RESPONSE)
class ControlPointCharacteristic extends bleno.Characteristic {
  constructor(statusChar) {
    super({
      uuid: CHAR_CONTROL_POINT_UUID,
      properties: ['write', 'writeWithoutResponse'],
      descriptors: [
        new bleno.Descriptor({
          uuid: '2901',
          value: 'DoorAccess ControlPoint (TLV opcodes)',
        }),
      ],
    });
    this.statusChar = statusChar;
  }

  async onWriteRequest(data, offset, withoutResponse, callback) {
    if (offset > 0) {
      return callback(this.RESULT_INVALID_OFFSET);
    }
    
    try {
      if (data.length === 0) {
        return callback(this.RESULT_UNLIKELY_ERROR);
      }
      
      const opcode = data[0];
      const payload = data.slice(1); // Le reste après l'opcode
      const fields = decodeTLV(payload);
      
      console.log(`[BLE-LOCK] ControlPoint: opcode 0x${opcode.toString(16).padStart(2, '0')}, ${fields.length} champs`);
      
      if (opcode === 0x01) {
        // GET_CHALLENGE
        await this.handleGetChallenge(fields);
      } else if (opcode === 0x02) {
        // AUTHENTICATE
        await this.handleAuthenticate(fields);
      } else {
        console.warn(`[BLE-LOCK] Opcode inconnu: 0x${opcode.toString(16)}`);
        return callback(this.RESULT_UNLIKELY_ERROR);
      }
      
      callback(this.RESULT_SUCCESS);
    } catch (e) {
      console.error('[BLE-LOCK] Erreur traitement ControlPoint:', e);
      callback(this.RESULT_UNLIKELY_ERROR);
    }
  }
  
  async handleGetChallenge(fields) {
    let keyId = null;
    let clientTime = null;
    
    for (const field of fields) {
      if (field.tag === 0x10) {
        // key_id est un UUID 16 bytes, on le décode
        keyId = decodeUUID(field.value);
      } else if (field.tag === 0x11) {
        clientTime = decodeInt64(field.value);
      }
    }
    
    // Génère un nonce aléatoire 32 bytes
    const nonce = crypto.randomBytes(32);
    const doorTime = Math.floor(Date.now() / 1000);
    
    // Stocke le challenge avec le nonce comme clé (pour vérification dans AUTHENTICATE)
    // Si keyId est fourni, on l'utilise aussi pour la clé
    const challengeKey = keyId ? `${keyId}-${nonce.toString('hex')}` : nonce.toString('hex');
    challenges.set(challengeKey, { nonce, timestamp: Date.now(), keyId });
    console.log(`[BLE-LOCK] Challenge généré (nonce: ${nonce.toString('hex').substring(0, 16)}...)`);
    
    // Envoie notification CHALLENGE (0x81)
    const challengePayload = encodeTLVFields([
      { tag: 0x12, value: nonce },                    // nonce
      { tag: 0x04, value: encodeInt64(doorTime) },    // door_time
    ]);
    
    const notification = Buffer.concat([
      Buffer.from([0x81]), // Type CHALLENGE
      challengePayload,
    ]);
    
    if (this.statusChar && this.statusChar.updateValueCallback) {
      this.statusChar.updateValueCallback(notification);
      console.log('[BLE-LOCK] Notification CHALLENGE envoyée');
    }
  }
  
  async handleAuthenticate(fields) {
    let keyId = null;
    let nonce = null;
    let mac = null;
    let grantId = null;
    
    for (const field of fields) {
      if (field.tag === 0x10) {
        keyId = decodeUUID(field.value);
      } else if (field.tag === 0x12) {
        nonce = field.value;
      } else if (field.tag === 0x13) {
        mac = field.value;
      } else if (field.tag === 0x14) {
        grantId = decodeUUID(field.value);
      }
    }
    
    if (!keyId || !nonce || !mac) {
      console.warn('[BLE-LOCK] Champs manquants dans AUTHENTICATE');
      this.sendResult(false, 0x0001); // Erreur: champs manquants
      return;
    }
    
    // Vérifie le nonce (anti-rejeu)
    // Cherche le challenge avec ce nonce (peut être stocké avec ou sans keyId)
    const nonceHex = nonce.toString('hex');
    let challenge = challenges.get(`${keyId}-${nonceHex}`) || challenges.get(nonceHex);
    
    if (!challenge || Date.now() - challenge.timestamp > NONCE_TTL_MS) {
      console.warn(`[BLE-LOCK] Nonce invalide ou expiré (nonce: ${nonceHex.substring(0, 16)}...)`);
      this.sendResult(false, 0x0002); // Erreur: nonce invalide
      return;
    }
    
    // Vérifie que le nonce correspond bien
    if (!crypto.timingSafeEqual(challenge.nonce, nonce)) {
      console.warn('[BLE-LOCK] Nonce ne correspond pas au challenge');
      this.sendResult(false, 0x0002); // Erreur: nonce invalide
      return;
    }
    
    // Vérifie le MAC
    // msg = nonce || door_id || key_id
    const doorIdBuf = encodeUUID(DOOR_UUID);
    const keyIdBuf = encodeUUID(keyId);
    const msg = Buffer.concat([nonce, doorIdBuf, keyIdBuf]);
    
    const secretDoor = deriveDoorKey(ROOM_ID);
    const macExpected = crypto.createHmac('sha256', secretDoor).update(msg).digest();
    
    if (!crypto.timingSafeEqual(macExpected, mac)) {
      console.warn('[BLE-LOCK] MAC invalide');
      this.sendResult(false, 0x0003); // Erreur: MAC invalide
      return;
    }
    
    // Récupère le token depuis le GRMS
    // Pour la démo, on utilise keyIdUUID comme identifiant
    // En production, on récupérerait le token depuis le GRMS via grant_id ou key_id
    // Le token réel devrait être récupéré depuis le GRMS, mais pour la démo on utilise keyIdUUID
    const tokenValue = keyId; // En production, récupérer depuis GRMS via grant_id/key_id
    
    const result = await verifyWithGrms(tokenValue, ROOM_ID);
    
    if (result.ok) {
      console.log(`[BLE-LOCK] ✅ Accès autorisé – ouverture de la porte`);
      const openMs = 2000; // Durée d'ouverture simulée
      this.sendResult(true, null, openMs, grantId);
    } else {
      console.log(`[BLE-LOCK] ❌ Accès refusé : ${result.reason || 'invalid'}`);
      this.sendResult(false, 0x0004); // Erreur: accès refusé
    }
    
    // Nettoie le challenge utilisé
    challenges.delete(challengeKey);
  }
  
  sendResult(isSuccess, errorCode = null, openMs = null, eventId = null) {
    const fields = [];
    
    if (isSuccess) {
      fields.push({ tag: 0x20, value: Buffer.from([0x01]) }); // is_success = 1
      if (openMs !== null) {
        fields.push({ tag: 0x22, value: encodeUInt16(openMs) }); // open_ms
      }
      if (eventId) {
        fields.push({ tag: 0x23, value: encodeUUID(eventId) }); // event_id
      }
    } else {
      fields.push({ tag: 0x20, value: Buffer.from([0x00]) }); // is_success = 0
      if (errorCode !== null) {
        fields.push({ tag: 0x21, value: encodeUInt16(errorCode) }); // error_code
      }
    }
    
    const resultPayload = encodeTLVFields(fields);
    const notification = Buffer.concat([
      Buffer.from([0x82]), // Type RESULT
      resultPayload,
    ]);
    
    if (this.statusChar && this.statusChar.updateValueCallback) {
      this.statusChar.updateValueCallback(notification);
      console.log(`[BLE-LOCK] Notification RESULT envoyée: success=${isSuccess}`);
    }
  }
}

// Caractéristique Status (NOTIFY)
class StatusCharacteristic extends bleno.Characteristic {
  constructor() {
    super({
      uuid: CHAR_STATUS_UUID,
      properties: ['notify'],
      descriptors: [
        new bleno.Descriptor({
          uuid: '2901',
          value: 'DoorAccess Status (TLV notifications)',
        }),
      ],
    });
    this.updateValueCallback = null;
  }
  
  onSubscribe(maxValueSize, updateValueCallback) {
    console.log('[BLE-LOCK] Status characteristic souscrite');
    this.updateValueCallback = updateValueCallback;
  }
  
  onUnsubscribe() {
    console.log('[BLE-LOCK] Status characteristic désouscrite');
    this.updateValueCallback = null;
  }
}

const statusChar = new StatusCharacteristic();
const controlPointChar = new ControlPointCharacteristic(statusChar);
const infoChar = new InfoCharacteristic();

const primaryService = new bleno.PrimaryService({
  uuid: SERVICE_UUID,
  characteristics: [infoChar, controlPointChar, statusChar],
});

bleno.on('stateChange', (state) => {
  console.log(`[BLE-LOCK] État Bluetooth: ${state}`);
  if (state === 'poweredOn') {
    // Nom du périphérique vu par l'iPhone : SmartRoom-<ROOM_ID>
    bleno.startAdvertising(`SmartRoom-${ROOM_ID}`, [SERVICE_UUID], (err) => {
      if (err) {
        console.error('[BLE-LOCK] Erreur startAdvertising:', err);
      } else {
        console.log(`[BLE-LOCK] Publicité BLE démarrée en tant que SmartRoom-${ROOM_ID}`);
      }
    });
  } else {
    bleno.stopAdvertising();
  }
});

bleno.on('advertisingStart', (err) => {
  if (err) {
    console.error('[BLE-LOCK] advertisingStart error:', err);
    return;
  }
  console.log('[BLE-LOCK] advertisingStart OK, configuration du service…');
  bleno.setServices([primaryService], (serviceErr) => {
    if (serviceErr) {
      console.error('[BLE-LOCK] setServices error:', serviceErr);
    } else {
      console.log('[BLE-LOCK] Service BLE DoorAccess prêt');
    }
  });
});

bleno.on('accept', (clientAddress) => {
  console.log(`[BLE-LOCK] Connexion depuis ${clientAddress}`);
});

bleno.on('disconnect', (clientAddress) => {
  console.log(`[BLE-LOCK] Déconnexion de ${clientAddress}`);
});

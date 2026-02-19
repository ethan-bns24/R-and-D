// Utilitaires TLV (Tag-Length-Value) pour le protocole GATT DoorAccess

/**
 * Encode un champ TLV
 * @param {number} tag - Tag du champ (ex: 0x01)
 * @param {Buffer} value - Valeur à encoder
 * @returns {Buffer} Buffer encodé TLV
 */
function encodeTLV(tag, value) {
  const tagBuf = Buffer.from([tag]);
  const lengthBuf = Buffer.from([value.length]);
  return Buffer.concat([tagBuf, lengthBuf, value]);
}

/**
 * Encode plusieurs champs TLV et les concatène
 * @param {Array<{tag: number, value: Buffer}>} fields
 * @returns {Buffer}
 */
function encodeTLVFields(fields) {
  const buffers = fields.map(f => encodeTLV(f.tag, f.value));
  return Buffer.concat(buffers);
}

/**
 * Décode un buffer TLV en champs
 * @param {Buffer} buffer
 * @returns {Array<{tag: number, length: number, value: Buffer}>}
 */
function decodeTLV(buffer) {
  const fields = [];
  let offset = 0;
  
  while (offset < buffer.length) {
    if (offset + 2 > buffer.length) break; // Tag + Length minimum
    
    const tag = buffer[offset];
    const length = buffer[offset + 1];
    offset += 2;
    
    if (offset + length > buffer.length) break; // Pas assez de données
    
    const value = buffer.slice(offset, offset + length);
    fields.push({ tag, length, value });
    offset += length;
  }
  
  return fields;
}

/**
 * Trouve un champ par tag
 * @param {Buffer} buffer
 * @param {number} tag
 * @returns {Buffer|null}
 */
function findTLVField(buffer, tag) {
  const fields = decodeTLV(buffer);
  const field = fields.find(f => f.tag === tag);
  return field ? field.value : null;
}

/**
 * Encode un UUID 16 bytes (128-bit)
 * @param {string} uuid - UUID au format "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
 * @returns {Buffer} 16 bytes
 */
function encodeUUID(uuid) {
  // Enlève les tirets et convertit en hex
  const hex = uuid.replace(/-/g, '');
  return Buffer.from(hex, 'hex');
}

/**
 * Décode un UUID depuis 16 bytes
 * @param {Buffer} buffer - 16 bytes
 * @returns {string} UUID formaté
 */
function decodeUUID(buffer) {
  if (buffer.length !== 16) return null;
  const hex = buffer.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

/**
 * Encode un int64 (8 bytes, big-endian)
 * @param {number} value - Timestamp Unix en secondes
 * @returns {Buffer} 8 bytes
 */
function encodeInt64(value) {
  const buf = Buffer.allocUnsafe(8);
  // JavaScript Number est limité à 53 bits, mais pour les timestamps ça suffit
  const high = Math.floor(value / 0x100000000);
  const low = value & 0xFFFFFFFF;
  buf.writeUInt32BE(high, 0);
  buf.writeUInt32BE(low, 4);
  return buf;
}

/**
 * Décode un int64 (8 bytes, big-endian)
 * @param {Buffer} buffer - 8 bytes
 * @returns {number}
 */
function decodeInt64(buffer) {
  if (buffer.length !== 8) return null;
  const high = buffer.readUInt32BE(0);
  const low = buffer.readUInt32BE(4);
  return high * 0x100000000 + low;
}

/**
 * Encode un uint16 (2 bytes, big-endian)
 * @param {number} value
 * @returns {Buffer} 2 bytes
 */
function encodeUInt16(value) {
  const buf = Buffer.allocUnsafe(2);
  buf.writeUInt16BE(value, 0);
  return buf;
}

/**
 * Décode un uint16 (2 bytes, big-endian)
 * @param {Buffer} buffer - 2 bytes
 * @returns {number}
 */
function decodeUInt16(buffer) {
  if (buffer.length !== 2) return null;
  return buffer.readUInt16BE(0);
}

module.exports = {
  encodeTLV,
  encodeTLVFields,
  decodeTLV,
  findTLVField,
  encodeUUID,
  decodeUUID,
  encodeInt64,
  decodeInt64,
  encodeUInt16,
  decodeUInt16,
};

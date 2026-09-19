const crypto = require('crypto');

const SHARED_KEY = 'ine-mock-store-shared-k3y';

/**
 * Decrypts the XOR-encrypted price payload from the INE mock store
 * @param {string} encryptedBase64 - Base64 encoded ciphertext from /api/products/:id/price
 * @param {string} token - Bearer token received from /api/session
 * @returns {object} Decrypted JSON quote object
 */
function decryptPayload(encryptedBase64, token) {
  if (!encryptedBase64 || !token) {
    throw new Error('Both encrypted payload and session token are required for decryption');
  }

  const key = crypto.createHash('sha256').update(`${SHARED_KEY}|enc|${token}`).digest();
  const cipherBytes = Buffer.from(encryptedBase64, 'base64');
  const out = Buffer.alloc(cipherBytes.length);

  for (let i = 0; i < cipherBytes.length; i++) {
    out[i] = cipherBytes[i] ^ key[i % key.length];
  }

  const jsonStr = out.toString('utf8');
  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`Failed to parse decrypted payload as JSON: ${err.message}`);
  }
}

module.exports = {
  decryptPayload,
  SHARED_KEY
};

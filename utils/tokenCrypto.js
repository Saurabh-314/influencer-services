const crypto = require('crypto');

const PREFIX = 'enc:v1:';

function getKey() {
    const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET || 'dev-instagram-token-key';
    return crypto.createHash('sha256').update(String(secret)).digest();
}

function encryptToken(plain) {
    if (plain == null || plain === '') return plain;
    const value = String(plain);
    if (value.startsWith(PREFIX)) return value;

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptToken(value) {
    if (value == null || value === '') return value;
    const encoded = String(value);
    if (!encoded.startsWith(PREFIX)) return encoded;

    const buf = Buffer.from(encoded.slice(PREFIX.length), 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

module.exports = {
    encryptToken,
    decryptToken,
};

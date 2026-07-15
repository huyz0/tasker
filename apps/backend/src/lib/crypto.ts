import crypto from "node:crypto";
import { config } from "../config";

const ALGORITHM = "aes-256-gcm";
const ENCRYPTION_KEY = config.appEncryptionSecret;

export function encryptToken(token: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptToken(encryptedString: string): string {
    const parts = encryptedString.split(':');
    if (parts.length !== 3) throw new Error("Invalid encrypted token format");
    const ivHex = parts[0];
    const authTagHex = parts[1];
    const encryptedHex = parts[2];

    if (!ivHex || !authTagHex || !encryptedHex) throw new Error("Missing encrypted components");

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

import crypto from "crypto";

/**
 * Password hashing using Node.js built-in crypto (PBKDF2)
 * For production, consider using bcryptjs or argon2
 */

export function hashPassword(password: string): string {
  // Use PBKDF2 with SHA-256 for password hashing
  // 100,000 iterations is a good balance between security and performance
  const salt = crypto.randomBytes(32).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 100000, 64, "sha256")
    .toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, hash: string): boolean {
  const [salt, storedHash] = hash.split(":");
  if (!salt || !storedHash) return false;
  const computedHash = crypto
    .pbkdf2Sync(password, salt, 100000, 64, "sha256")
    .toString("hex");
  return computedHash === storedHash;
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function generatePasswordResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function isTokenExpired(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return true;
  return new Date() > expiresAt;
}

export function getTokenExpirationTime(hours: number = 24): Date {
  const now = new Date();
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

export function getPasswordResetExpirationTime(hours: number = 1): Date {
  return getTokenExpirationTime(hours);
}

export function getEmailVerificationExpirationTime(hours: number = 24): Date {
  return getTokenExpirationTime(hours);
}

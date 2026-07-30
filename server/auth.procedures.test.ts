import { describe, it, expect, beforeEach, vi } from "vitest";
import { hashPassword, verifyPassword, generateVerificationToken, generatePasswordResetToken, isTokenExpired, getEmailVerificationExpirationTime, getPasswordResetExpirationTime } from "./_core/auth";

describe("Authentication Procedures", () => {
  describe("Password Hashing", () => {
    it("should hash passwords consistently", () => {
      const password = "TestPassword123!";
      const hash1 = hashPassword(password);
      const hash2 = hashPassword(password);
      
      // Hashes should be different (different salts)
      expect(hash1).not.toBe(hash2);
      
      // But both should verify correctly
      expect(verifyPassword(password, hash1)).toBe(true);
      expect(verifyPassword(password, hash2)).toBe(true);
    });

    it("should reject incorrect passwords", () => {
      const password = "TestPassword123!";
      const hash = hashPassword(password);
      
      expect(verifyPassword("WrongPassword", hash)).toBe(false);
      expect(verifyPassword("testpassword123!", hash)).toBe(false);
    });

    it("should handle special characters in passwords", () => {
      const password = "P@ssw0rd!#$%^&*()";
      const hash = hashPassword(password);
      
      expect(verifyPassword(password, hash)).toBe(true);
      expect(verifyPassword("P@ssw0rd!#$%^&*()", hash)).toBe(true);
    });

    it("should handle empty passwords", () => {
      const password = "";
      const hash = hashPassword(password);
      
      expect(verifyPassword("", hash)).toBe(true);
      expect(verifyPassword("anything", hash)).toBe(false);
    });

    it("should handle very long passwords", () => {
      const password = "a".repeat(1000);
      const hash = hashPassword(password);
      
      expect(verifyPassword(password, hash)).toBe(true);
      expect(verifyPassword("a".repeat(999), hash)).toBe(false);
    });
  });

  describe("Token Generation", () => {
    it("should generate unique verification tokens", () => {
      const token1 = generateVerificationToken();
      const token2 = generateVerificationToken();
      
      expect(token1).not.toBe(token2);
      expect(token1).toHaveLength(64);
      expect(token2).toHaveLength(64);
    });

    it("should generate unique password reset tokens", () => {
      const token1 = generatePasswordResetToken();
      const token2 = generatePasswordResetToken();
      
      expect(token1).not.toBe(token2);
      expect(token1).toHaveLength(64);
      expect(token2).toHaveLength(64);
    });

    it("should generate hex-encoded tokens", () => {
      const token = generateVerificationToken();
      expect(/^[0-9a-f]{64}$/.test(token)).toBe(true);
    });
  });

  describe("Token Expiration", () => {
    it("should identify expired tokens", () => {
      const pastDate = new Date(Date.now() - 1000); // 1 second ago
      expect(isTokenExpired(pastDate)).toBe(true);
    });

    it("should identify valid tokens", () => {
      const futureDate = new Date(Date.now() + 1000 * 60 * 60); // 1 hour from now
      expect(isTokenExpired(futureDate)).toBe(false);
    });

    it("should handle null/undefined expiration", () => {
      expect(isTokenExpired(null)).toBe(true);
      expect(isTokenExpired(undefined)).toBe(true);
    });

    it("should generate email verification expiration in 24 hours", () => {
      const expiration = getEmailVerificationExpirationTime();
      const now = Date.now();
      const expirationTime = expiration.getTime();
      
      // Should be approximately 24 hours from now (within 1 minute tolerance)
      const expectedTime = now + 24 * 60 * 60 * 1000;
      expect(Math.abs(expirationTime - expectedTime)).toBeLessThan(60 * 1000);
    });

    it("should generate password reset expiration in 1 hour", () => {
      const expiration = getPasswordResetExpirationTime();
      const now = Date.now();
      const expirationTime = expiration.getTime();
      
      // Should be approximately 1 hour from now (within 1 minute tolerance)
      const expectedTime = now + 60 * 60 * 1000;
      expect(Math.abs(expirationTime - expectedTime)).toBeLessThan(60 * 1000);
    });

    it("should allow custom expiration hours", () => {
      const expiration = getPasswordResetExpirationTime(2);
      const now = Date.now();
      const expirationTime = expiration.getTime();
      
      // Should be approximately 2 hours from now
      const expectedTime = now + 2 * 60 * 60 * 1000;
      expect(Math.abs(expirationTime - expectedTime)).toBeLessThan(60 * 1000);
    });
  });

  describe("Edge Cases", () => {
    it("should handle password with hash format characters", () => {
      const password = "Pass:word:123";
      const hash = hashPassword(password);
      
      expect(verifyPassword(password, hash)).toBe(true);
      expect(verifyPassword("Pass", hash)).toBe(false);
    });

    it("should handle unicode characters in passwords", () => {
      const password = "Pässwörd123!";
      const hash = hashPassword(password);
      
      expect(verifyPassword(password, hash)).toBe(true);
      expect(verifyPassword("Passwörd123!", hash)).toBe(false);
    });

    it("should handle whitespace in passwords", () => {
      const password = "Pass word 123";
      const hash = hashPassword(password);
      
      expect(verifyPassword(password, hash)).toBe(true);
      expect(verifyPassword("Password123", hash)).toBe(false);
    });
  });
});

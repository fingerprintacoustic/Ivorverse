import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  checkRateLimit,
  resetRateLimit,
  getRateLimitKey,
  AUTH_RATE_LIMITS,
  getStats,
  clearExpiredEntries,
} from "./_core/rateLimiter";

describe("Rate Limiter", () => {
  beforeEach(() => {
    // Clear rate limit store before each test
    const keys = Object.keys(AUTH_RATE_LIMITS);
    for (let i = 0; i < 100; i++) {
      keys.forEach((key) => {
        resetRateLimit(`${key}:test${i}`);
      });
    }
  });

  afterEach(() => {
    clearExpiredEntries();
  });

  describe("Rate Limit Key Generation", () => {
    it("should generate consistent rate limit keys", () => {
      const key1 = getRateLimitKey("signup", "user@example.com");
      const key2 = getRateLimitKey("signup", "user@example.com");

      expect(key1).toBe(key2);
      expect(key1).toBe("signup:user@example.com");
    });

    it("should generate different keys for different types", () => {
      const signupKey = getRateLimitKey("signup", "user@example.com");
      const loginKey = getRateLimitKey("login", "user@example.com");

      expect(signupKey).not.toBe(loginKey);
    });

    it("should generate different keys for different identifiers", () => {
      const key1 = getRateLimitKey("signup", "user1@example.com");
      const key2 = getRateLimitKey("signup", "user2@example.com");

      expect(key1).not.toBe(key2);
    });
  });

  describe("Signup Rate Limiting", () => {
    it("should allow first signup attempt", () => {
      const key = getRateLimitKey("signup", "user@example.com");
      const result = checkRateLimit(key, AUTH_RATE_LIMITS.signup);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });

    it("should block signup after exceeding limit", () => {
      const key = getRateLimitKey("signup", "user@example.com");
      const config = AUTH_RATE_LIMITS.signup;

      // Use up all attempts
      for (let i = 0; i < config.maxRequests; i++) {
        checkRateLimit(key, config);
      }

      // Next attempt should be blocked
      const result = checkRateLimit(key, config);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  describe("Login Rate Limiting", () => {
    it("should allow login attempts within limit", () => {
      const key = getRateLimitKey("login", "192.168.1.1");
      const config = AUTH_RATE_LIMITS.login;

      for (let i = 0; i < config.maxRequests - 1; i++) {
        const result = checkRateLimit(key, config);
        expect(result.allowed).toBe(true);
      }
    });

    it("should block login after exceeding limit", () => {
      const key = getRateLimitKey("login", "192.168.1.1");
      const config = AUTH_RATE_LIMITS.login;

      // Use up all attempts
      for (let i = 0; i < config.maxRequests; i++) {
        checkRateLimit(key, config);
      }

      // Next attempt should be blocked
      const result = checkRateLimit(key, config);
      expect(result.allowed).toBe(false);
    });
  });

  describe("Password Reset Rate Limiting", () => {
    it("should allow password reset requests within limit", () => {
      const key = getRateLimitKey("passwordReset", "user@example.com");
      const config = AUTH_RATE_LIMITS.passwordReset;

      for (let i = 0; i < config.maxRequests - 1; i++) {
        const result = checkRateLimit(key, config);
        expect(result.allowed).toBe(true);
      }
    });

    it("should block password reset after exceeding limit", () => {
      const key = getRateLimitKey("passwordReset", "user@example.com");
      const config = AUTH_RATE_LIMITS.passwordReset;

      // Use up all attempts
      for (let i = 0; i < config.maxRequests; i++) {
        checkRateLimit(key, config);
      }

      // Next attempt should be blocked
      const result = checkRateLimit(key, config);
      expect(result.allowed).toBe(false);
    });
  });

  describe("Rate Limit Reset", () => {
    it("should reset rate limit for a key", () => {
      const key = getRateLimitKey("signup", "user@example.com");
      const config = AUTH_RATE_LIMITS.signup;

      // Use up all attempts
      for (let i = 0; i < config.maxRequests; i++) {
        checkRateLimit(key, config);
      }

      // Should be blocked
      let result = checkRateLimit(key, config);
      expect(result.allowed).toBe(false);

      // Reset
      resetRateLimit(key);

      // Should be allowed again
      result = checkRateLimit(key, config);
      expect(result.allowed).toBe(true);
    });
  });

  describe("Rate Limit Window", () => {
    it("should return reset time in the future", () => {
      const key = getRateLimitKey("signup", "user@example.com");
      const config = AUTH_RATE_LIMITS.signup;
      const now = Date.now();

      const result = checkRateLimit(key, config);

      // Reset time should be in the future
      expect(result.resetTime).toBeGreaterThan(now);
      // Reset time should be approximately config.windowMs from now
      expect(result.resetTime - now).toBeLessThan(config.windowMs + 100);
    });
  });

  describe("Multiple Identifiers", () => {
    it("should track separate limits for different identifiers", () => {
      const key1 = getRateLimitKey("signup", "user1@example.com");
      const key2 = getRateLimitKey("signup", "user2@example.com");
      const config = AUTH_RATE_LIMITS.signup;

      // Use up limit for user1
      for (let i = 0; i < config.maxRequests; i++) {
        checkRateLimit(key1, config);
      }

      // User1 should be blocked
      let result1 = checkRateLimit(key1, config);
      expect(result1.allowed).toBe(false);

      // User2 should still be allowed
      let result2 = checkRateLimit(key2, config);
      expect(result2.allowed).toBe(true);
    });
  });

  describe("Statistics", () => {
    it("should track active entries", () => {
      const key1 = getRateLimitKey("signup", "user1@example.com");
      const key2 = getRateLimitKey("signup", "user2@example.com");

      checkRateLimit(key1, AUTH_RATE_LIMITS.signup);
      checkRateLimit(key2, AUTH_RATE_LIMITS.signup);

      const stats = getStats();

      expect(stats.totalKeys).toBeGreaterThanOrEqual(2);
      expect(stats.activeKeys).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Edge Cases", () => {
    it("should handle very large max requests", () => {
      const key = getRateLimitKey("test", "user@example.com");
      const config = { windowMs: 60000, maxRequests: 1000000 };

      for (let i = 0; i < 100; i++) {
        const result = checkRateLimit(key, config);
        expect(result.allowed).toBe(true);
      }
    });

    it("should handle same identifier with different rate limit types", () => {
      const signupKey = getRateLimitKey("signup", "user@example.com");
      const loginKey = getRateLimitKey("login", "user@example.com");

      // Use up signup limit
      for (let i = 0; i < AUTH_RATE_LIMITS.signup.maxRequests; i++) {
        checkRateLimit(signupKey, AUTH_RATE_LIMITS.signup);
      }

      // Signup should be blocked
      let signupResult = checkRateLimit(signupKey, AUTH_RATE_LIMITS.signup);
      expect(signupResult.allowed).toBe(false);

      // Login should still be allowed (different key)
      let loginResult = checkRateLimit(loginKey, AUTH_RATE_LIMITS.login);
      expect(loginResult.allowed).toBe(true);
    });
  });
});

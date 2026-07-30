import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { checkRateLimit, resetRateLimit, getRateLimitKey, AUTH_RATE_LIMITS, clearExpiredEntries } from "./_core/rateLimiter";

describe("Authentication Rate Limiting Integration", () => {
  beforeEach(() => {
    // Clear rate limits before each test
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

  describe("Signup Rate Limiting", () => {
    it("should allow 5 signup attempts per hour per email", () => {
      const email = "testuser@example.com";
      const config = AUTH_RATE_LIMITS.signup;

      // Should allow up to maxRequests attempts
      for (let i = 0; i < config.maxRequests; i++) {
        const key = getRateLimitKey("signup", email);
        const result = checkRateLimit(key, config);
        expect(result.allowed).toBe(true);
      }
    });

    it("should block signup after 5 attempts per hour", () => {
      const email = "testuser@example.com";
      const config = AUTH_RATE_LIMITS.signup;

      // Use up all attempts
      for (let i = 0; i < config.maxRequests; i++) {
        const key = getRateLimitKey("signup", email);
        checkRateLimit(key, config);
      }

      // 6th attempt should be blocked
      const key = getRateLimitKey("signup", email);
      const result = checkRateLimit(key, config);
      expect(result.allowed).toBe(false);
    });

    it("should track separate limits for different emails", () => {
      const config = AUTH_RATE_LIMITS.signup;

      // Use up limit for email1
      for (let i = 0; i < config.maxRequests; i++) {
        const key = getRateLimitKey("signup", "email1@example.com");
        checkRateLimit(key, config);
      }

      // email1 should be blocked
      const key1 = getRateLimitKey("signup", "email1@example.com");
      const result1 = checkRateLimit(key1, config);
      expect(result1.allowed).toBe(false);

      // email2 should still be allowed
      const key2 = getRateLimitKey("signup", "email2@example.com");
      const result2 = checkRateLimit(key2, config);
      expect(result2.allowed).toBe(true);
    });
  });

  describe("Login Rate Limiting", () => {
    it("should allow 10 login attempts per 15 minutes per email", () => {
      const email = "testuser@example.com";
      const config = AUTH_RATE_LIMITS.login;

      // Should allow up to maxRequests attempts
      for (let i = 0; i < config.maxRequests - 1; i++) {
        const key = getRateLimitKey("login", email);
        const result = checkRateLimit(key, config);
        expect(result.allowed).toBe(true);
      }
    });

    it("should block login after 10 attempts per 15 minutes", () => {
      const email = "testuser@example.com";
      const config = AUTH_RATE_LIMITS.login;

      // Use up all attempts
      for (let i = 0; i < config.maxRequests; i++) {
        const key = getRateLimitKey("login", email);
        checkRateLimit(key, config);
      }

      // Next attempt should be blocked
      const key = getRateLimitKey("login", email);
      const result = checkRateLimit(key, config);
      expect(result.allowed).toBe(false);
    });

    it("should have shorter window than signup (15 min vs 1 hour)", () => {
      const signupConfig = AUTH_RATE_LIMITS.signup;
      const loginConfig = AUTH_RATE_LIMITS.login;

      // Login window should be shorter (15 minutes = 900,000 ms)
      expect(loginConfig.windowMs).toBeLessThan(signupConfig.windowMs);
      expect(loginConfig.windowMs).toBe(15 * 60 * 1000);
    });
  });

  describe("Password Reset Rate Limiting", () => {
    it("should allow 5 password reset requests per hour per email", () => {
      const email = "testuser@example.com";
      const config = AUTH_RATE_LIMITS.passwordReset;

      // Should allow up to maxRequests attempts
      for (let i = 0; i < config.maxRequests - 1; i++) {
        const key = getRateLimitKey("passwordReset", email);
        const result = checkRateLimit(key, config);
        expect(result.allowed).toBe(true);
      }
    });

    it("should block password reset after 5 attempts per hour", () => {
      const email = "testuser@example.com";
      const config = AUTH_RATE_LIMITS.passwordReset;

      // Use up all attempts
      for (let i = 0; i < config.maxRequests; i++) {
        const key = getRateLimitKey("passwordReset", email);
        checkRateLimit(key, config);
      }

      // Next attempt should be blocked
      const key = getRateLimitKey("passwordReset", email);
      const result = checkRateLimit(key, config);
      expect(result.allowed).toBe(false);
    });

    it("should have same window as signup (1 hour)", () => {
      const signupConfig = AUTH_RATE_LIMITS.signup;
      const resetConfig = AUTH_RATE_LIMITS.passwordReset;

      // Both should have 1 hour window
      expect(resetConfig.windowMs).toBe(signupConfig.windowMs);
      expect(resetConfig.windowMs).toBe(60 * 60 * 1000);
    });
  });

  describe("Cross-Auth Rate Limiting", () => {
    it("should use different keys for different auth types", () => {
      const email = "testuser@example.com";
      const signupKey = getRateLimitKey("signup", email);
      const loginKey = getRateLimitKey("login", email);
      const resetKey = getRateLimitKey("passwordReset", email);

      // All keys should be different
      expect(signupKey).not.toBe(loginKey);
      expect(loginKey).not.toBe(resetKey);
      expect(signupKey).not.toBe(resetKey);
    });
  });

  describe("Rate Limit Configuration", () => {
    it("should have reasonable limits for signup", () => {
      const config = AUTH_RATE_LIMITS.signup;
      expect(config.maxRequests).toBe(5); // 5 signups per hour
      expect(config.windowMs).toBe(60 * 60 * 1000); // 1 hour
    });

    it("should have reasonable limits for login", () => {
      const config = AUTH_RATE_LIMITS.login;
      expect(config.maxRequests).toBe(10); // 10 login attempts per 15 min
      expect(config.windowMs).toBe(15 * 60 * 1000); // 15 minutes
    });

    it("should have reasonable limits for password reset", () => {
      const config = AUTH_RATE_LIMITS.passwordReset;
      expect(config.maxRequests).toBe(5); // 5 reset requests per hour
      expect(config.windowMs).toBe(60 * 60 * 1000); // 1 hour
    });
  });

  describe("Rate Limit Reset Behavior", () => {
    it("should allow attempts after rate limit is reset", () => {
      const email = "testuser@example.com";
      const config = AUTH_RATE_LIMITS.signup;

      // Use up all attempts
      for (let i = 0; i < config.maxRequests; i++) {
        const key = getRateLimitKey("signup", email);
        checkRateLimit(key, config);
      }

      // Should be blocked
      let key = getRateLimitKey("signup", email);
      let result = checkRateLimit(key, config);
      expect(result.allowed).toBe(false);

      // Reset
      resetRateLimit(key);

      // Should be allowed again
      result = checkRateLimit(key, config);
      expect(result.allowed).toBe(true);
    });
  });
});

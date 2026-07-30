/**
 * Rate Limiting for Authentication Endpoints
 * Prevents brute force attacks on signup, login, and password reset
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory store for rate limiting (replace with Redis for production)
const rateLimitStore = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

export const AUTH_RATE_LIMITS = {
  signup: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 5, // 5 signups per hour per IP/email
  },
  login: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10, // 10 login attempts per 15 minutes
  },
  passwordReset: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 5, // 5 password reset requests per hour
  },
};

export function getRateLimitKey(type: string, identifier: string): string {
  return `${type}:${identifier}`;
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // Clean up old entries
  if (entry && entry.resetTime < now) {
    rateLimitStore.delete(key);
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime: now + config.windowMs,
    };
  }

  // New entry
  if (!entry) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime: now + config.windowMs,
    };
  }

  // Existing entry - check if allowed before incrementing
  const remaining = config.maxRequests - entry.count;
  const allowed = remaining > 0;

  if (allowed) {
    entry.count++;
  }

  return {
    allowed,
    remaining: Math.max(0, remaining - 1),
    resetTime: entry.resetTime,
  };
}

export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

export function clearExpiredEntries(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];
  rateLimitStore.forEach((entry, key) => {
    if (entry.resetTime < now) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach(key => rateLimitStore.delete(key));
}

// Clean up expired entries every 5 minutes
setInterval(clearExpiredEntries, 5 * 60 * 1000);

export function getStats(): {
  totalKeys: number;
  activeKeys: number;
  expiredKeys: number;
} {
  const now = Date.now();
  let activeKeys = 0;
  let expiredKeys = 0;

  rateLimitStore.forEach((entry) => {
    if (entry.resetTime < now) {
      expiredKeys++;
    } else {
      activeKeys++;
    }
  });

  return {
    totalKeys: rateLimitStore.size,
    activeKeys,
    expiredKeys,
  };
}

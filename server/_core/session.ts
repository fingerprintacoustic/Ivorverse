/**
 * Session management. Replaces server/_core/sdk.ts (Manus OAuth SDK).
 *
 * IMPORTANT BUG FIX: the original authProcedures.ts login procedure set the
 * session cookie to the raw user id (`user.id.toString()`), but every
 * authenticated request was verified via sdk.ts's `authenticateRequest`,
 * which required a *signed JWT* containing an `openId` field (Manus's SSO
 * identifier) and called out to Manus's OAuth server to resolve it. Those
 * two things never actually matched — an email/password login would set a
 * cookie that `jwtVerify` would immediately reject as an invalid token, so
 * every subsequent authenticated request would fail with "Invalid session
 * cookie" regardless of how correct the login itself was. The auth test
 * suite covers hashing/rate-limiting/procedures in isolation, so it never
 * caught this since it doesn't exercise the full login -> authenticated
 * request round trip.
 *
 * This module is now the single session mechanism for the whole app: it
 * issues and verifies a JWT keyed by the numeric user id (works for
 * email/password users) instead of a Manus openId, and has no dependency on
 * any Manus service.
 */
import { COOKIE_NAME } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../db";
import * as db from "../db";

const isPositiveInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

function getSessionSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return new TextEncoder().encode(secret);
}

function parseCookies(cookieHeader: string | undefined): Map<string, string> {
  if (!cookieHeader) return new Map();
  return new Map(Object.entries(parseCookieHeader(cookieHeader)));
}

/** Issue a signed session token for a user id. */
export async function createSessionToken(
  userId: number,
  options: { expiresInMs?: number } = {}
): Promise<string> {
  const issuedAt = Date.now();
  const expiresInMs = options.expiresInMs ?? 365 * 24 * 60 * 60 * 1000; // 1 year default
  const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);

  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(getSessionSecret());
}

/** Verify a session cookie value and return the user id it encodes, or null. */
export async function verifySessionToken(
  cookieValue: string | undefined | null
): Promise<number | null> {
  if (!cookieValue) return null;

  try {
    const { payload } = await jwtVerify(cookieValue, getSessionSecret(), {
      algorithms: ["HS256"],
    });
    const { userId } = payload as Record<string, unknown>;
    return isPositiveInt(userId) ? userId : null;
  } catch (error) {
    console.warn("[Auth] Session verification failed:", String(error));
    return null;
  }
}

/** Resolve the authenticated user for a request, or throw. Used by tRPC context. */
export async function authenticateRequest(req: Request): Promise<User> {
  const cookies = parseCookies(req.headers.cookie);
  const sessionCookie = cookies.get(COOKIE_NAME);
  const userId = await verifySessionToken(sessionCookie);

  if (!userId) {
    throw ForbiddenError("Invalid session cookie");
  }

  const user = await db.getUserById(userId);
  if (!user) {
    throw ForbiddenError("User not found");
  }

  return user;
}

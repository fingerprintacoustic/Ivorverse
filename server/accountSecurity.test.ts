import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

process.env.JWT_SECRET = "test-secret-at-least-32-characters-long!!";

const users = new Map<number, any>();
vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  getUserById: vi.fn(async (id: number) => users.get(id)),
  getUserByEmail: vi.fn(async (email: string) => [...users.values()].find((u) => u.email === email)),
  revokeUserSessions: vi.fn(async (id: number) => {
    const u = users.get(id);
    u.sessionVersion = (u.sessionVersion ?? 0) + 1;
  }),
  setUserDisabled: vi.fn(async (id: number, disabled: boolean) => {
    users.get(id).disabled = disabled;
  }),
  getUserByPasswordResetToken: vi.fn(async (token: string) => (token === "good-token" ? users.get(1) : undefined)),
  resetUserPassword: vi.fn(),
  logAuditAction: vi.fn(),
}));
const deleteAccount = vi.fn(async () => {});
vi.mock("./_core/accountDeletion", () => ({ deleteAccount }));

const { createSessionToken, authenticateRequest } = await import("./_core/session");
const { hashPassword } = await import("./_core/auth");
const { appRouter } = await import("./routers");
const { COOKIE_NAME } = await import("@shared/const");
const db = await import("./db");

const reqWithCookie = (token: string) => ({ headers: { cookie: `${COOKIE_NAME}=${token}` } }) as any;

function caller(user: any) {
  const res = { clearCookie: vi.fn(), cookie: vi.fn() };
  return {
    res,
    api: appRouter.createCaller({ user, req: { protocol: "https", headers: {} }, res } as unknown as TrpcContext),
  };
}

beforeEach(() => {
  users.clear();
  vi.clearAllMocks();
  users.set(1, {
    id: 1,
    email: "me@test.com",
    role: "user",
    subscriptionTier: "free",
    emailVerified: true,
    passwordHash: hashPassword("correct horse"),
    sessionVersion: 0,
  });
  users.set(2, { id: 2, email: "admin@test.com", role: "admin", subscriptionTier: "free", sessionVersion: 0 });
});

describe("session revocation", () => {
  it("accepts a token matching the user's session version", async () => {
    const token = await createSessionToken(1, { sessionVersion: 0 });
    await expect(authenticateRequest(reqWithCookie(token))).resolves.toMatchObject({ id: 1 });
  });

  it("rejects tokens issued before sessions were revoked", async () => {
    const token = await createSessionToken(1, { sessionVersion: 0 });
    await db.revokeUserSessions(1);
    await expect(authenticateRequest(reqWithCookie(token))).rejects.toThrow("Session revoked");
  });

  it("rejects every session of a disabled user", async () => {
    const token = await createSessionToken(1, { sessionVersion: 0 });
    users.get(1).disabled = true;
    await expect(authenticateRequest(reqWithCookie(token))).rejects.toThrow("Account disabled");
  });

  it("still accepts tokens issued before versioning existed", async () => {
    const { SignJWT } = await import("jose");
    const legacy = await new SignJWT({ userId: 1 })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));
    await expect(authenticateRequest(reqWithCookie(legacy))).resolves.toMatchObject({ id: 1 });
  });
});

describe("account procedures", () => {
  it("signOutEverywhere revokes sessions and clears this cookie", async () => {
    const { api, res } = caller(users.get(1));
    await api.auth.signOutEverywhere();
    expect(users.get(1).sessionVersion).toBe(1);
    expect(res.clearCookie).toHaveBeenCalledWith(COOKIE_NAME, expect.anything());
  });

  it("deleteAccount requires the correct password", async () => {
    const { api } = caller(users.get(1));
    await expect(api.auth.deleteAccount({ password: "wrong" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("deleteAccount deletes and signs out with the right password", async () => {
    const { api, res } = caller(users.get(1));
    await api.auth.deleteAccount({ password: "correct horse" });
    expect(deleteAccount).toHaveBeenCalledWith(1);
    expect(res.clearCookie).toHaveBeenCalled();
  });

  it("login refuses disabled accounts and issues versioned tokens otherwise", async () => {
    users.get(1).disabled = true;
    await expect(
      caller(null).api.auth.login({ email: "me@test.com", password: "correct horse" })
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "This account has been disabled." });

    users.get(1).disabled = false;
    users.get(1).sessionVersion = 3;
    const { api, res } = caller(null);
    await api.auth.login({ email: "me@test.com", password: "correct horse" });
    const token = res.cookie.mock.calls[0][1];
    await expect(authenticateRequest(reqWithCookie(token))).resolves.toMatchObject({ id: 1 });
  });

  it("a password reset signs out existing sessions", async () => {
    users.get(1).passwordResetExpires = new Date(Date.now() + 60_000);
    await caller(null).api.auth.resetPassword({ token: "good-token", newPassword: "a new password" });
    expect(db.revokeUserSessions).toHaveBeenCalledWith(1);
  });

  it("admins can disable and re-enable others, but not themselves", async () => {
    const { api } = caller(users.get(2));
    await api.admin.disableUser({ userId: 1 });
    expect(users.get(1).disabled).toBe(true);
    await api.admin.enableUser({ userId: 1 });
    expect(users.get(1).disabled).toBe(false);
    await expect(api.admin.disableUser({ userId: 2 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

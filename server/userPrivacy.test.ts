import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const fullUser = (id: number) => ({
  id,
  email: `u${id}@test.com`,
  name: `User ${id}`,
  role: id === 1 ? "admin" : "user",
  subscriptionTier: "free",
  passwordHash: "salt$hash",
  emailVerificationToken: "verify-token",
  emailVerificationExpires: new Date(),
  passwordResetToken: "reset-token",
  passwordResetExpires: new Date(),
  createdAt: new Date(),
});

vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  getAllUsers: vi.fn(async () => [fullUser(1), fullUser(2)]),
  getUserById: vi.fn(async (id: number) => fullUser(id)),
  updateUserProfile: vi.fn(async (id: number) => fullUser(id)),
  // getUserDetails also loads plan/usage/project info
  getDb: vi.fn(async () => null),
  getSubscriptionByUserId: vi.fn(async () => undefined),
  getUserProjects: vi.fn(async () => []),
  getUserCharacters: vi.fn(async () => []),
}));

const { appRouter } = await import("./routers");

const caller = (user: any) =>
  appRouter.createCaller({
    user,
    req: { protocol: "https", headers: {} },
    res: { clearCookie: vi.fn(), cookie: vi.fn() },
  } as unknown as TrpcContext);

const SECRETS = ["salt$hash", "verify-token", "reset-token"];
const expectNoSecrets = (value: unknown) => {
  const json = JSON.stringify(value);
  for (const secret of SECRETS) expect(json).not.toContain(secret);
};

describe("user records sent to clients", () => {
  it("auth.me omits the password hash and tokens", async () => {
    const me = await caller(fullUser(2)).auth.me();
    expect(me).toMatchObject({ id: 2, email: "u2@test.com" });
    expectNoSecrets(me);
  });

  it("auth.updateProfile omits them", async () => {
    expectNoSecrets(await caller(fullUser(2)).auth.updateProfile({ name: "New" }));
  });

  it("admin user listings omit other users' hashes and reset tokens", async () => {
    const admin = caller(fullUser(1));
    const users = await admin.admin.listUsers();
    expect(users).toHaveLength(2);
    expectNoSecrets(users);
    expectNoSecrets(await admin.admin.getUserDetails({ userId: 2 }));
  });
});

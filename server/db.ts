/**
 * Firestore-backed data access layer.
 *
 * This replaces the original Drizzle/Postgres implementation (preserved at
 * server/db.drizzle.ts.bak for reference) with Firestore, while keeping the
 * exact same exported function names and signatures. routers.ts,
 * seedTestUsers.ts and stripe.ts consume this module
 * through `import * as db from "./db"` and require no changes.
 *
 * Numeric IDs: the original schema used auto-incrementing integer primary
 * keys, and callers/tests throughout the codebase pass/expect `number` ids.
 * To avoid a wider refactor, this layer keeps numeric ids by maintaining an
 * atomic counter per collection (in a `_counters` collection) and using
 * `String(numericId)` as the Firestore document ID.
 */
import { getApps, initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore, Firestore, Timestamp, FieldValue } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// Entity types — mirrors the shapes the original Drizzle schema produced via
// typeof table.$inferSelect, so return types stay strongly typed for
// routers.ts and the client's tRPC-inferred types instead
// of collapsing to `{}`/`unknown`.
// ---------------------------------------------------------------------------

export interface User {
  id: number;
  openId: string | null;
  email: string | null;
  name: string | null;
  loginMethod: string | null;
  role: "user" | "admin";
  subscriptionTier: "free" | "pro" | "business";
  profileImageUrl: string | null;
  passwordHash: string | null;
  emailVerified: boolean;
  emailVerificationToken: string | null;
  emailVerificationExpires: Date | null;
  passwordResetToken: string | null;
  passwordResetExpires: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
}

export interface Project {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  type: "chat" | "research" | "app" | "music" | "image" | "voice" | "video";
  content: any;
  isPublic: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: number;
  projectId: number;
  userId: number;
  role: "user" | "assistant";
  content: string;
  fileUrls: string[] | null;
  /** Background jobs this (assistant) message started — see jobs.ts */
  jobIds?: number[] | null;
  createdAt: Date;
}

export interface Character {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  faceImageUrl: string | null;
  faceImageKey: string | null;
  voiceUrl: string | null;
  voiceKey: string | null;
  personality: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FileRecord {
  id: number;
  userId: number;
  projectId: number | null;
  filename: string;
  fileKey: string;
  url: string;
  mimeType: string | null;
  size: number | null;
  fileType?: "document" | "image" | "audio" | "video" | "code" | "other";
  createdAt: Date;
}

export interface Subscription {
  id: number;
  userId: number;
  tier: "free" | "pro" | "business";
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: "active" | "canceled" | "expired" | "past_due";
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  canceledAt: Date | null;
  cancelAtPeriodEnd?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Usage {
  id: number;
  userId: number;
  feature: string;
  count: number;
  month: number;
  year: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResearchReport {
  id: number;
  projectId: number;
  userId: number;
  title: string;
  content: string;
  sources: any[] | null;
  citations: any[] | null;
  createdAt: Date;
}

export interface MusicProject {
  id: number;
  projectId: number;
  userId: number;
  lyrics: string | null;
  structure: any;
  productionPrompt: string | null;
  audioUrl: string | null;
  audioKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoProject {
  id: number;
  projectId: number;
  userId: number;
  musicProjectId: number | null;
  scenes: any;
  imageUrls: any;
  videoUrl: string | null;
  videoKey: string | null;
  subtitles: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppProject {
  id: number;
  projectId: number;
  userId: number;
  appType: "website" | "mobile" | "saas";
  requirements: string | null;
  design: string | null;
  databaseSchema: string | null;
  apiStructure: string | null;
  sourceCode: string | null;
  sourceCodeUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Job {
  id: number;
  userId: number;
  type: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number; // 0–100
  stage: string; // human-readable current step
  input: Record<string, any>;
  result?: Record<string, any> | null;
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLog {
  id: number;
  userId: number | null;
  adminId: number | null;
  action: string;
  targetUserId: number | null;
  details: Record<string, any> | null;
  createdAt: Date;
}

// Ported from the "AI OS & Autonomous Business Platform" project.

export interface Agent {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  capabilities: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentTask {
  id: number;
  userId: number;
  agentId: number | null;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "completed" | "failed";
  progress: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Workflow {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  definition: string; // JSON-encoded workflow definition
  createdAt: Date;
  updatedAt: Date;
}

export interface Product {
  id: number;
  userId: number;
  name: string;
  type: "digital" | "subscription" | "course" | "ebook" | "saas";
  description: string | null;
  price: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectMemory {
  id: number;
  projectId: number;
  key: string;
  value: string;
  importance: number;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// App / Firestore initialization
// ---------------------------------------------------------------------------

let _db: Firestore | null = null;

export async function getDb(): Promise<Firestore | null> {
  if (_db) return _db;

  try {
    if (getApps().length === 0) {
      // In Cloud Functions / Cloud Run, applicationDefault() picks up the
      // runtime service account automatically. For local dev, set
      // GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path, or
      // FIREBASE_SERVICE_ACCOUNT_JSON to inline the JSON contents.
      if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        initializeApp({
          credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
        });
      } else {
        initializeApp({ credential: applicationDefault() });
      }
    }
    _db = getFirestore();
  } catch (error) {
    console.warn("[Firestore] Failed to initialize:", error);
    _db = null;
  }

  return _db;
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

const COUNTERS_COLLECTION = "_counters";

async function nextId(db: Firestore, collectionName: string): Promise<number> {
  const ref = db.collection(COUNTERS_COLLECTION).doc(collectionName);
  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? (snap.data()!.value as number) : 0;
    const next = current + 1;
    tx.set(ref, { value: next }, { merge: true });
    return next;
  });
}

/** Strip undefined values (Firestore rejects them). */
function clean<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

/** Convert Firestore Timestamps back to JS Date on read. */
function fromFirestore<T extends Record<string, any>>(id: number, data: Record<string, any>): T {
  const out: Record<string, any> = { id };
  for (const [k, v] of Object.entries(data)) {
    out[k] = v instanceof Timestamp ? v.toDate() : v;
  }
  return out as T;
}

async function getById<T extends Record<string, any>>(
  db: Firestore,
  collectionName: string,
  id: number
): Promise<T | undefined> {
  const snap = await db.collection(collectionName).doc(String(id)).get();
  if (!snap.exists) return undefined;
  return fromFirestore<T>(id, snap.data()!);
}

async function queryOne<T extends Record<string, any>>(
  db: Firestore,
  collectionName: string,
  field: string,
  value: any
): Promise<T | undefined> {
  const snap = await db.collection(collectionName).where(field, "==", value).limit(1).get();
  if (snap.empty) return undefined;
  const doc = snap.docs[0];
  return fromFirestore<T>(Number(doc.id), doc.data());
}

async function queryMany<T extends Record<string, any>>(
  db: Firestore,
  collectionName: string,
  filters: Array<[string, any]>,
  orderByField?: string
): Promise<T[]> {
  let q: FirebaseFirestore.Query = db.collection(collectionName);
  for (const [field, value] of filters) {
    q = q.where(field, "==", value);
  }
  if (orderByField) q = q.orderBy(orderByField);
  const snap = await q.get();
  return snap.docs.map((doc) => fromFirestore<T>(Number(doc.id), doc.data()));
}

async function createDoc<T extends Record<string, any>>(
  db: Firestore,
  collectionName: string,
  data: Record<string, any>,
  timestamps: { createdAt?: boolean; updatedAt?: boolean } = { createdAt: true }
): Promise<T> {
  const id = await nextId(db, collectionName);
  const now = new Date();
  const payload = clean({
    ...data,
    ...(timestamps.createdAt ? { createdAt: now } : {}),
    ...(timestamps.updatedAt ? { updatedAt: now } : {}),
  });
  await db.collection(collectionName).doc(String(id)).set(payload);
  return fromFirestore<T>(id, payload);
}

async function updateDoc(
  db: Firestore,
  collectionName: string,
  id: number,
  updates: Record<string, any>,
  bumpUpdatedAt = true
): Promise<void> {
  const payload = clean({ ...updates, ...(bumpUpdatedAt ? { updatedAt: new Date() } : {}) });
  if (Object.keys(payload).length === 0) return;
  await db.collection(collectionName).doc(String(id)).set(payload, { merge: true });
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface InsertUserLike {
  openId?: string | null;
  email?: string | null;
  name?: string | null;
  loginMethod?: string | null;
  role?: "user" | "admin";
  lastSignedIn?: Date;
  [key: string]: any;
}

const OWNER_OPEN_ID = process.env.OWNER_OPEN_ID;

export async function upsertUser(user: InsertUserLike): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Firestore] Cannot upsert user: database not available");
    return;
  }

  try {
    const existing = await queryOne<User>(db, "users", "openId", user.openId);

    const updateSet: Record<string, any> = {};
    (["name", "email", "loginMethod"] as const).forEach((field) => {
      const value = (user as any)[field];
      if (value !== undefined) updateSet[field] = value ?? null;
    });

    updateSet.lastSignedIn = user.lastSignedIn ?? new Date();

    if (user.role !== undefined) {
      updateSet.role = user.role;
    } else if (user.openId === OWNER_OPEN_ID && !existing) {
      updateSet.role = "admin";
    }

    if (existing) {
      await updateDoc(db, "users", existing.id, updateSet, false);
    } else {
      await createDoc(db, "users", {
        openId: user.openId,
        role: "user",
        subscriptionTier: "free",
        emailVerified: false,
        ...updateSet,
      });
    }
  } catch (error) {
    console.error("[Firestore] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Firestore] Cannot get user: database not available");
    return undefined;
  }
  return await queryOne<User>(db, "users", "openId", openId);
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  return await getById<User>(db, "users", id);
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function createProject(
  userId: number,
  name: string,
  type: string,
  description?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await createDoc<Project>(db, "projects", {
    userId,
    name,
    type,
    description: description ?? null,
    isPublic: false,
  });
}

export async function getUserProjects(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await queryMany<Project>(db, "projects", [["userId", userId]], "createdAt");
}

export async function getProjectById(projectId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const project = await getById<Project>(db, "projects", projectId);
  if (!project || project.userId !== userId) return undefined;
  return project;
}

export async function updateProject(
  projectId: number,
  userId: number,
  updates: Record<string, any>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getProjectById(projectId, userId);
  if (!existing) return;
  return await updateDoc(db, "projects", projectId, updates);
}

export async function deleteProject(projectId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getProjectById(projectId, userId);
  if (!existing) return;
  await db.collection("projects").doc(String(projectId)).delete();
}

// ---------------------------------------------------------------------------
// Chat Messages
// ---------------------------------------------------------------------------

export async function addChatMessage(
  projectId: number,
  userId: number,
  role: "user" | "assistant",
  content: string,
  fileUrls?: string[],
  jobIds?: number[]
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await createDoc<ChatMessage>(
    db,
    "chatMessages",
    { projectId, userId, role, content, fileUrls: fileUrls ?? null, jobIds: jobIds?.length ? jobIds : null },
    { createdAt: true }
  );
}

export async function getChatMessages(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return await queryMany<ChatMessage>(db, "chatMessages", [["projectId", projectId]], "createdAt");
}

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

export async function createCharacter(
  userId: number,
  name: string,
  description?: string,
  personality?: Record<string, any>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await createDoc<Character>(db, "characters", {
    userId,
    name,
    description: description ?? null,
    personality: personality ?? null,
  });
}

export async function getUserCharacters(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await queryMany<Character>(db, "characters", [["userId", userId]], "createdAt");
}

export async function getCharacterById(characterId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const character = await getById<Character>(db, "characters", characterId);
  if (!character || character.userId !== userId) return undefined;
  return character;
}

export async function updateCharacter(
  characterId: number,
  userId: number,
  updates: Record<string, any>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getCharacterById(characterId, userId);
  if (!existing) return;
  return await updateDoc(db, "characters", characterId, updates);
}

export async function deleteCharacter(characterId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getCharacterById(characterId, userId);
  if (!existing) return;
  await db.collection("characters").doc(String(characterId)).delete();
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export async function createFile(
  userId: number,
  filename: string,
  fileKey: string,
  url: string,
  mimeType?: string,
  size?: number,
  projectId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await createDoc<FileRecord>(
    db,
    "files",
    {
      userId,
      projectId: projectId ?? null,
      filename,
      fileKey,
      url,
      mimeType: mimeType ?? null,
      size: size ?? null,
    },
    { createdAt: true }
  );
}

export async function getUserFiles(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await queryMany<FileRecord>(db, "files", [["userId", userId]], "createdAt");
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export async function getOrCreateSubscription(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await queryOne<Subscription>(db, "subscriptions", "userId", userId);
  if (existing) return existing;

  return await createDoc<Subscription>(db, "subscriptions", { userId, tier: "free", status: "active" });
}

export async function updateSubscription(userId: number, updates: Record<string, any>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await queryOne<Subscription>(db, "subscriptions", "userId", userId);
  if (!existing) return;
  return await updateDoc(db, "subscriptions", existing.id, updates);
}

/** Used by stripe.ts in place of the raw inline drizzle queries it used to run. */
export async function getSubscriptionByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  return await queryOne<Subscription>(db, "subscriptions", "userId", userId);
}

export async function getSubscriptionByStripeSubscriptionId(stripeSubscriptionId: string) {
  const db = await getDb();
  if (!db) return undefined;
  return await queryOne<Subscription>(
    db,
    "subscriptions",
    "stripeSubscriptionId",
    stripeSubscriptionId
  );
}

// ---------------------------------------------------------------------------
// Usage Tracking
// ---------------------------------------------------------------------------

export async function trackUsage(userId: number, feature: string, count: number = 1) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const existing = await queryMany<Usage>(db, "usage", [
    ["userId", userId],
    ["feature", feature],
    ["month", month],
    ["year", year],
  ]);

  if (existing.length > 0) {
    return await updateDoc(
      db,
      "usage",
      existing[0].id,
      { count: existing[0].count + count },
      false
    );
  }

  return await createDoc<Usage>(db, "usage", { userId, feature, count, month, year });
}

export async function getMonthlyUsage(userId: number, feature?: string) {
  const db = await getDb();
  if (!db) return [];

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const filters: Array<[string, any]> = [
    ["userId", userId],
    ["month", month],
    ["year", year],
  ];
  if (feature) filters.push(["feature", feature]);

  return await queryMany<Usage>(db, "usage", filters);
}

// ---------------------------------------------------------------------------
// Research Reports
// ---------------------------------------------------------------------------

export async function createResearchReport(
  projectId: number,
  userId: number,
  title: string,
  content: string,
  sources?: any[],
  citations?: any[]
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await createDoc<ResearchReport>(db, "researchReports", {
    projectId,
    userId,
    title,
    content,
    sources: sources ?? null,
    citations: citations ?? null,
  });
}

// ---------------------------------------------------------------------------
// Music Projects
// ---------------------------------------------------------------------------

export async function createMusicProject(
  projectId: number,
  userId: number,
  lyrics?: string,
  structure?: any,
  productionPrompt?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await createDoc<MusicProject>(db, "musicProjects", {
    projectId,
    userId,
    lyrics: lyrics ?? null,
    structure: structure ?? null,
    productionPrompt: productionPrompt ?? null,
  });
}

export async function getMusicProject(projectId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const results = await queryMany<MusicProject>(db, "musicProjects", [
    ["projectId", projectId],
    ["userId", userId],
  ]);
  return results[0];
}

// ---------------------------------------------------------------------------
// Video Projects
// ---------------------------------------------------------------------------

export async function createVideoProject(
  projectId: number,
  userId: number,
  musicProjectId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await createDoc<VideoProject>(db, "videoProjects", {
    projectId,
    userId,
    musicProjectId: musicProjectId ?? null,
    status: "pending",
    progress: 0,
  });
}

export async function getVideoProject(projectId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const results = await queryMany<VideoProject>(db, "videoProjects", [
    ["projectId", projectId],
    ["userId", userId],
  ]);
  return results[0];
}

export async function updateVideoProject(
  projectId: number,
  userId: number,
  updates: Record<string, any>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getVideoProject(projectId, userId);
  if (!existing) return;
  return await updateDoc(db, "videoProjects", (existing as any).id, updates);
}

// ---------------------------------------------------------------------------
// App Projects
// ---------------------------------------------------------------------------

export async function createAppProject(
  projectId: number,
  userId: number,
  appType: "website" | "mobile" | "saas"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await createDoc<AppProject>(db, "appProjects", { projectId, userId, appType });
}

export async function getAppProject(projectId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const results = await queryMany<AppProject>(db, "appProjects", [
    ["projectId", projectId],
    ["userId", userId],
  ]);
  return results[0];
}

export async function updateAppProject(
  projectId: number,
  userId: number,
  updates: Record<string, any>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getAppProject(projectId, userId);
  if (!existing) return;
  return await updateDoc(db, "appProjects", (existing as any).id, updates);
}

// ---------------------------------------------------------------------------
// Background Jobs (see server/_core/jobs.ts)
// ---------------------------------------------------------------------------

export async function createJob(userId: number, type: string, input: Record<string, any>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await createDoc<Job>(
    db,
    "jobs",
    { userId, type, input, status: "queued", progress: 0, stage: "Queued" },
    { createdAt: true, updatedAt: true }
  );
}

export async function getJob(jobId: number) {
  const db = await getDb();
  if (!db) return undefined;
  return await getById<Job>(db, "jobs", jobId);
}

export async function updateJob(jobId: number, updates: Partial<Omit<Job, "id">>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await updateDoc(db, "jobs", jobId, updates);
}

/**
 * Atomically move a job from queued → running. Returns false if it was
 * already claimed — Firestore triggers deliver at-least-once, so a job
 * can be handed to the worker more than once.
 */
export async function claimJob(jobId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const ref = db.collection("jobs").doc(String(jobId));
  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()!.status !== "queued") return false;
    tx.update(ref, { status: "running", stage: "Starting", updatedAt: new Date() });
    return true;
  });
}

// ---------------------------------------------------------------------------
// Admin Functions
// ---------------------------------------------------------------------------

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return await queryMany<User>(db, "users", [], "createdAt");
}

/**
 * Real aggregate stats for the admin dashboard (it previously rendered hardcoded
 * zeros). Scans users/subscriptions in full — fine at current scale; move to
 * counter docs or Firestore count() aggregations if these collections grow large.
 */
export async function getPlatformStats() {
  const empty = {
    totalUsers: 0,
    newUsersThisMonth: 0,
    monthlyRevenue: 0,
    activeSubscriptions: 0,
    canceledThisMonth: 0,
    churnRate: 0,
    totalApiCalls: 0,
    usageByFeature: [] as Array<{ feature: string; count: number }>,
    subscriptions: [] as Array<Subscription & { userEmail: string | null; userName: string | null }>,
  };
  const db = await getDb();
  if (!db) return empty;

  const { SUBSCRIPTION_TIERS } = await import("./products");
  const priceByTier: Record<string, number> = Object.fromEntries(
    Object.values(SUBSCRIPTION_TIERS).map((t) => [t.id, t.price])
  );

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [users, subscriptions, usage] = await Promise.all([
    queryMany<User>(db, "users", []),
    queryMany<Subscription>(db, "subscriptions", []),
    queryMany<Usage>(db, "usage", [
      ["month", now.getMonth() + 1],
      ["year", now.getFullYear()],
    ]),
  ]);

  const paidActive = subscriptions.filter((s) => s.status === "active" && s.tier !== "free");
  const canceledThisMonth = subscriptions.filter(
    (s) => s.tier !== "free" && s.canceledAt && new Date(s.canceledAt) >= monthStart
  ).length;
  const churnBase = paidActive.length + canceledThisMonth;

  const featureTotals = new Map<string, number>();
  for (const u of usage) featureTotals.set(u.feature, (featureTotals.get(u.feature) ?? 0) + u.count);

  const usersById = new Map(users.map((u) => [u.id, u]));

  return {
    totalUsers: users.length,
    newUsersThisMonth: users.filter((u) => u.createdAt && new Date(u.createdAt) >= monthStart).length,
    monthlyRevenue: paidActive.reduce((sum, s) => sum + (priceByTier[s.tier] ?? 0), 0),
    activeSubscriptions: paidActive.length,
    canceledThisMonth,
    churnRate: churnBase === 0 ? 0 : Math.round((canceledThisMonth / churnBase) * 1000) / 10,
    totalApiCalls: usage.reduce((sum, u) => sum + u.count, 0),
    usageByFeature: Array.from(featureTotals, ([feature, count]) => ({ feature, count })).sort(
      (a, b) => b.count - a.count
    ),
    subscriptions: subscriptions
      .filter((s) => s.tier !== "free")
      .map((s) => ({
        ...s,
        userEmail: usersById.get(s.userId)?.email ?? null,
        userName: usersById.get(s.userId)?.name ?? null,
      })),
  };
}

export async function updateUserProfile(userId: number, updates: { name?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await updateDoc(db, "users", userId, updates);
  return await getById<User>(db, "users", userId);
}

export async function disableUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await queryOne<Subscription>(db, "subscriptions", "userId", userId);
  if (!existing) return;
  return await updateDoc(db, "subscriptions", existing.id, { status: "canceled" });
}

export async function logAuditAction(
  action: string,
  userId?: number,
  adminId?: number,
  targetUserId?: number,
  details?: Record<string, any>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await createDoc<AuditLog>(db, "auditLogs", {
    action,
    userId: userId ?? null,
    adminId: adminId ?? null,
    targetUserId: targetUserId ?? null,
    details: details ?? null,
  });
}

// ---------------------------------------------------------------------------
// Email/Password Authentication
// ---------------------------------------------------------------------------

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  return await queryOne<User>(db, "users", "email", email);
}

export async function createEmailUser(data: {
  email: string;
  name: string;
  passwordHash: string;
  emailVerificationToken: string;
  emailVerificationExpires: Date;
  loginMethod: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await createDoc<User>(db, "users", {
    email: data.email,
    name: data.name,
    passwordHash: data.passwordHash,
    emailVerificationToken: data.emailVerificationToken,
    emailVerificationExpires: data.emailVerificationExpires,
    loginMethod: data.loginMethod,
    emailVerified: false,
    role: "user",
    subscriptionTier: "free",
  });
}

export async function getUserByVerificationToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  return await queryOne<User>(db, "users", "emailVerificationToken", token);
}

export async function verifyUserEmail(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await updateDoc(db, "users", userId, {
    emailVerified: true,
    emailVerificationToken: FieldValue.delete(),
    emailVerificationExpires: FieldValue.delete(),
  });
}

export async function setPasswordResetToken(userId: number, token: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await updateDoc(db, "users", userId, {
    passwordResetToken: token,
    passwordResetExpires: expiresAt,
  });
}

export async function getUserByPasswordResetToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  return await queryOne<User>(db, "users", "passwordResetToken", token);
}

export async function resetUserPassword(userId: number, newPasswordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await updateDoc(db, "users", userId, {
    passwordHash: newPasswordHash,
    passwordResetToken: FieldValue.delete(),
    passwordResetExpires: FieldValue.delete(),
  });
}

// ---------------------------------------------------------------------------
// Agents & Tasks (ported from "AI OS & Autonomous Business Platform")
// ---------------------------------------------------------------------------

export async function createAgent(
  userId: number,
  name: string,
  description?: string,
  capabilities?: any
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await createDoc<Agent>(db, "agents", {
    userId,
    name,
    description: description ?? null,
    capabilities: capabilities ?? null,
  });
}

export async function getAgents(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await queryMany<Agent>(db, "agents", [["userId", userId]], "createdAt");
}

export async function createTask(
  userId: number,
  title: string,
  description?: string,
  agentId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await createDoc<AgentTask>(db, "agentTasks", {
    userId,
    agentId: agentId ?? null,
    title,
    description: description ?? null,
    status: "pending",
    progress: 0,
  });
}

export async function getTasks(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await queryMany<AgentTask>(db, "agentTasks", [["userId", userId]], "createdAt");
}

export async function updateTaskStatus(
  taskId: number,
  status: AgentTask["status"],
  progress: number = 0
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await updateDoc(db, "agentTasks", taskId, { status, progress });
}

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------

export async function createWorkflow(
  userId: number,
  name: string,
  definition: string,
  description?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await createDoc<Workflow>(db, "workflows", {
    userId,
    name,
    definition,
    description: description ?? null,
  });
}

export async function getWorkflows(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await queryMany<Workflow>(db, "workflows", [["userId", userId]], "createdAt");
}

// ---------------------------------------------------------------------------
// Products (monetization)
// ---------------------------------------------------------------------------

export async function createProduct(
  userId: number,
  name: string,
  type: Product["type"],
  price?: number,
  description?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await createDoc<Product>(db, "products", {
    userId,
    name,
    type,
    price: price ?? null,
    description: description ?? null,
  });
}

export async function getProducts(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await queryMany<Product>(db, "products", [["userId", userId]], "createdAt");
}

// ---------------------------------------------------------------------------
// Project memory (long-term key/value memory, ported from conversationMemory
// — adapted to IvorVerse's project-based chat model instead of a separate
// conversation entity)
// ---------------------------------------------------------------------------

export async function setMemory(
  projectId: number,
  key: string,
  value: string,
  importance: number = 1
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await queryMany<ProjectMemory>(db, "projectMemory", [
    ["projectId", projectId],
    ["key", key],
  ]);

  if (existing.length > 0) {
    await updateDoc(db, "projectMemory", existing[0].id, { value, importance });
    return;
  }

  return await createDoc<ProjectMemory>(db, "projectMemory", {
    projectId,
    key,
    value,
    importance,
  });
}

export async function getMemory(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return await queryMany<ProjectMemory>(db, "projectMemory", [["projectId", projectId]]);
}

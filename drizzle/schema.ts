import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  bigint,
  decimal,
  boolean,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extended with subscription and profile fields.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).unique(), // Optional for email/password users
  email: varchar("email", { length: 320 }).unique(),
  name: text("name"),
  loginMethod: varchar("loginMethod", { length: 64 }), // 'oauth' or 'email'
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  subscriptionTier: mysqlEnum("subscriptionTier", ["free", "pro", "business"])
    .default("free")
    .notNull(),
  profileImageUrl: varchar("profileImageUrl", { length: 512 }),
  // Email/Password authentication fields
  passwordHash: varchar("passwordHash", { length: 255 }), // bcrypt hash
  emailVerified: boolean("emailVerified").default(false).notNull(),
  emailVerificationToken: varchar("emailVerificationToken", { length: 255 }),
  emailVerificationExpires: timestamp("emailVerificationExpires"),
  passwordResetToken: varchar("passwordResetToken", { length: 255 }),
  passwordResetExpires: timestamp("passwordResetExpires"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Projects table for storing all user-created projects across features.
 * Type field indicates which feature created the project (chat, research, app, etc.)
 */
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: mysqlEnum("type", [
    "chat",
    "research",
    "app",
    "music",
    "image",
    "voice",
    "video",
  ])
    .notNull(),
  content: json("content"), // Stores feature-specific data
  isPublic: boolean("isPublic").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

/**
 * Chat messages table for storing conversation history.
 */
export const chatMessages = mysqlTable("chatMessages", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  fileUrls: json("fileUrls"), // Array of file URLs attached to message
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

/**
 * Characters table for storing reusable character profiles.
 * Characters can be used across image, video, and music video generation.
 */
export const characters = mysqlTable("characters", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  faceImageUrl: varchar("faceImageUrl", { length: 512 }),
  faceImageKey: varchar("faceImageKey", { length: 255 }), // S3 key for face image
  voiceUrl: varchar("voiceUrl", { length: 512 }),
  voiceKey: varchar("voiceKey", { length: 255 }), // S3 key for voice sample
  personality: json("personality"), // Stores personality traits and description
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Character = typeof characters.$inferSelect;
export type InsertCharacter = typeof characters.$inferInsert;

/**
 * Files table for storing uploaded files and generated media.
 * Tracks all file assets created or uploaded by users.
 */
export const files = mysqlTable("files", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectId: int("projectId"),
  filename: varchar("filename", { length: 255 }).notNull(),
  fileKey: varchar("fileKey", { length: 255 }).notNull(), // S3 reference
  url: varchar("url", { length: 512 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }),
  size: int("size"), // File size in bytes
  fileType: mysqlEnum("fileType", [
    "document",
    "image",
    "audio",
    "video",
    "code",
    "other",
  ]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type File = typeof files.$inferSelect;
export type InsertFile = typeof files.$inferInsert;

/**
 * Subscriptions table for tracking user subscription status.
 */
export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  tier: mysqlEnum("tier", ["free", "pro", "business"]).default("free").notNull(),
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  status: mysqlEnum("status", ["active", "canceled", "expired", "past_due"])
    .default("active")
    .notNull(),
  currentPeriodStart: timestamp("currentPeriodStart"),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  canceledAt: timestamp("canceledAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

/**
 * Usage tracking table for monitoring feature usage per user per month.
 * Used for enforcing subscription tier limits.
 */
export const usage = mysqlTable("usage", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  feature: mysqlEnum("feature", [
    "chat",
    "research",
    "app",
    "music",
    "image",
    "voice",
    "video",
  ]).notNull(),
  count: int("count").default(0).notNull(),
  month: int("month").notNull(), // 1-12
  year: int("year").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Usage = typeof usage.$inferSelect;
export type InsertUsage = typeof usage.$inferInsert;

/**
 * Research reports table for storing generated research reports.
 */
export const researchReports = mysqlTable("researchReports", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  sources: json("sources"), // Array of source objects with URL, title, summary
  citations: json("citations"), // Array of citations
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ResearchReport = typeof researchReports.$inferSelect;
export type InsertResearchReport = typeof researchReports.$inferInsert;

/**
 * Music projects table for storing music generation data.
 */
export const musicProjects = mysqlTable("musicProjects", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  lyrics: text("lyrics"),
  structure: json("structure"), // Song structure (verse, chorus, bridge, etc.)
  productionPrompt: text("productionPrompt"),
  audioUrl: varchar("audioUrl", { length: 512 }),
  audioKey: varchar("audioKey", { length: 255 }), // S3 key
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MusicProject = typeof musicProjects.$inferSelect;
export type InsertMusicProject = typeof musicProjects.$inferInsert;

/**
 * Video projects table for storing music video generation data.
 */
export const videoProjects = mysqlTable("videoProjects", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  musicProjectId: int("musicProjectId"),
  scenes: json("scenes"), // Array of scene descriptions
  imageUrls: json("imageUrls"), // Array of generated image URLs
  videoUrl: varchar("videoUrl", { length: 512 }),
  videoKey: varchar("videoKey", { length: 255 }), // S3 key
  subtitles: text("subtitles"), // VTT format subtitles
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"])
    .default("pending"),
  progress: int("progress").default(0), // 0-100
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VideoProject = typeof videoProjects.$inferSelect;
export type InsertVideoProject = typeof videoProjects.$inferInsert;

/**
 * App builder projects table for storing generated app specifications.
 */
export const appProjects = mysqlTable("appProjects", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  appType: mysqlEnum("appType", ["website", "mobile", "saas"]).notNull(),
  requirements: text("requirements"),
  design: text("design"), // UI design description or JSON
  databaseSchema: text("databaseSchema"), // SQL or JSON schema
  apiStructure: text("apiStructure"), // API endpoints specification
  sourceCode: text("sourceCode"), // Generated code
  sourceCodeUrl: varchar("sourceCodeUrl", { length: 512 }), // Link to generated code
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AppProject = typeof appProjects.$inferSelect;
export type InsertAppProject = typeof appProjects.$inferInsert;

/**
 * Team members table for Business tier collaboration.
 */
export const teamMembers = mysqlTable("teamMembers", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // Team owner
  memberId: int("memberId").notNull(), // Team member
  role: mysqlEnum("role", ["owner", "editor", "viewer"]).default("editor"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = typeof teamMembers.$inferInsert;

/**
 * Audit log table for tracking admin actions and user activities.
 */
export const auditLogs = mysqlTable("auditLogs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  adminId: int("adminId"),
  action: varchar("action", { length: 255 }).notNull(),
  targetUserId: int("targetUserId"),
  details: json("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

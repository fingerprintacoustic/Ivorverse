/**
 * Seed test user accounts for QA testing
 * Run with: npx tsx server/seedTestUsers.ts
 */

import * as db from "./db";
import { hashPassword } from "./_core/auth";

const testUsers = [
  {
    email: "test1@example.com",
    password: "TestPassword123!",
    name: "Test User 1",
    emailVerified: true,
  },
  {
    email: "test2@example.com",
    password: "SecurePass456!",
    name: "Test User 2",
    emailVerified: true,
  },
  {
    email: "test3@example.com",
    password: "MyPassword789!",
    name: "Test User 3",
    emailVerified: false,
  },
  {
    email: "admin@example.com",
    password: "AdminPass123!",
    name: "Admin User",
    emailVerified: true,
  },
];

async function seedTestUsers() {
  console.log("[Seed] Starting test user creation...");

  for (const testUser of testUsers) {
    try {
      // Check if user already exists
      const existingUser = await db.getUserByEmail(testUser.email);
      if (existingUser) {
        console.log(`[Seed] User ${testUser.email} already exists, skipping`);
        continue;
      }

      // Create user
      const passwordHash = hashPassword(testUser.password);
      const user = await db.createEmailUser({
        email: testUser.email,
        name: testUser.name,
        passwordHash,
        emailVerificationToken: "",
        emailVerificationExpires: new Date(),
        loginMethod: "email",
      });

      // Verify email if needed
      if (testUser.emailVerified) {
        await db.verifyUserEmail(user.id);
      }

      console.log(`[Seed] Created user: ${testUser.email} (ID: ${user.id})`);
      console.log(`[Seed]   Password: ${testUser.password}`);
      console.log(`[Seed]   Email Verified: ${testUser.emailVerified}`);
    } catch (error) {
      console.error(`[Seed] Failed to create user ${testUser.email}:`, error);
    }
  }

  console.log("[Seed] Test user creation complete");
}

// Run if executed directly
if (require.main === module) {
  seedTestUsers()
    .then(() => {
      console.log("[Seed] Done");
      process.exit(0);
    })
    .catch((error) => {
      console.error("[Seed] Error:", error);
      process.exit(1);
    });
}

export { seedTestUsers };

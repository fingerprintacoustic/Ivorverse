/**
 * Permanently delete a user's account and data (Settings → Delete Account).
 *
 * Order matters: billing is stopped first and deletion aborts if that fails,
 * so an account is never deleted while Stripe keeps charging it. Admin audit
 * logs are kept (they record admin actions, not user content).
 */
import * as db from "../db";
import { storageDelete, storageDeletePrefix } from "../storage";

/** Collections whose documents carry the owner's id in `userId`. */
const USER_OWNED_COLLECTIONS = [
  "projects",
  "chatMessages",
  "characters",
  "files",
  "researchReports",
  "musicProjects",
  "videoProjects",
  "appProjects",
  "agents",
  "agentTasks",
  "workflows",
  "workflowRuns",
  "products",
  "jobs",
  "usage",
  "quotaUsage",
  "subscriptions",
];

type Firestore = NonNullable<Awaited<ReturnType<typeof db.getDb>>>;

async function deleteWhere(firestore: Firestore, collection: string, field: string, value: unknown) {
  const snap = await firestore.collection(collection).where(field, "==", value).get();
  // Firestore batches are capped at 500 writes
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = firestore.batch();
    for (const doc of snap.docs.slice(i, i + 400)) batch.delete(doc.ref);
    await batch.commit();
  }
  return snap.docs;
}

export async function deleteAccount(userId: number) {
  const firestore = await db.getDb();
  if (!firestore) throw new Error("Database not available");

  // 1. Stop billing. If this fails, keep the account so we don't orphan a paying subscription.
  const subscription = await db.getSubscriptionByUserId(userId);
  if (subscription?.stripeSubscriptionId && subscription.status !== "canceled") {
    const { getStripe } = await import("../stripe");
    await getStripe().subscriptions.cancel(subscription.stripeSubscriptionId);
  }

  // 2. Stored files: everything under the user's folder, plus any recorded elsewhere
  const files = await firestore.collection("files").where("userId", "==", userId).get();
  const fileKeys = files.docs.map((d) => d.data().fileKey).filter((k): k is string => typeof k === "string");
  try {
    await storageDeletePrefix(`${userId}/`);
    await storageDelete(fileKeys);
  } catch (error) {
    // Don't block deletion on storage; the records pointing at files are removed below
    console.error(`[Account] Storage cleanup for user ${userId} failed:`, error);
  }

  // 3. Data. Project memory is keyed by project, so find the projects first.
  const projects = await firestore.collection("projects").where("userId", "==", userId).get();
  for (const project of projects.docs) {
    await deleteWhere(firestore, "projectMemory", "projectId", Number(project.id));
  }
  for (const collection of USER_OWNED_COLLECTIONS) {
    await deleteWhere(firestore, collection, "userId", userId);
  }
  // Sales of this user's products (they hold buyer emails)
  await deleteWhere(firestore, "sales", "sellerId", userId);

  // 4. The account itself, last
  await firestore.collection("users").doc(String(userId)).delete();
}

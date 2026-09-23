/**
 * Storage helpers backed by Firebase Cloud Storage.
 *
 * Replaces the original Manus Forge-proxied S3 storage (presigned PUT/GET
 * through BUILT_IN_FORGE_API_URL). Same exported function names/signatures,
 * so callers (imageGeneration.ts, routers.ts chat.uploadFile, etc.) don't
 * need to change.
 *
 * Requires a Firebase Storage bucket on the same project as Firestore. Set
 * FIREBASE_STORAGE_BUCKET (e.g. "your-project-id.appspot.com"), or it will
 * fall back to the default bucket for the initialized Firebase app.
 */
import { getApps, initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import crypto from "crypto";

function ensureFirebaseApp() {
  if (getApps().length === 0) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      initializeApp({
        credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      });
    } else {
      initializeApp({
        credential: applicationDefault(),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      });
    }
  }
}

function getBucket() {
  ensureFirebaseApp();
  return getStorage().bucket();
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const bucket = getBucket();
  const key = appendHashSuffix(normalizeKey(relKey));
  const file = bucket.file(key);

  const buffer = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);

  await file.save(buffer, {
    contentType,
    // Publicly readable via a long-lived signed URL rather than making the
    // whole bucket public; callers get back a usable URL either way.
  });

  const url = await storageGetSignedUrl(key);
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const url = await storageGetSignedUrl(key);
  return { key, url };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const bucket = getBucket();
  const key = normalizeKey(relKey);
  const [url] = await bucket.file(key).getSignedUrl({
    action: "read",
    // Long-lived (7 days is the max for V4 signed URLs on GCS). For
    // permanently public assets, consider making the bucket/file public
    // instead and returning the plain https://storage.googleapis.com URL.
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  return url;
}

/** Delete stored objects by key. Missing objects are ignored. */
export async function storageDelete(keys: string[]): Promise<void> {
  const bucket = getBucket();
  await Promise.all(
    keys.map((key) => bucket.file(normalizeKey(key)).delete({ ignoreNotFound: true }))
  );
}

/** Delete every stored object under a key prefix (e.g. a user's folder). */
export async function storageDeletePrefix(prefix: string): Promise<void> {
  await getBucket().deleteFiles({ prefix: normalizeKey(prefix), force: true });
}

/** Read a stored object as a stream (for serving downloads through our own origin). */
export function storageReadStream(key: string) {
  return getBucket().file(normalizeKey(key)).createReadStream();
}

import { afterEach, describe, expect, it } from "vitest";
import { storageBucketName } from "./storage";

const saved = { bucket: process.env.FIREBASE_STORAGE_BUCKET, config: process.env.FIREBASE_CONFIG };
afterEach(() => {
  if (saved.bucket === undefined) delete process.env.FIREBASE_STORAGE_BUCKET;
  else process.env.FIREBASE_STORAGE_BUCKET = saved.bucket;
  if (saved.config === undefined) delete process.env.FIREBASE_CONFIG;
  else process.env.FIREBASE_CONFIG = saved.config;
});

describe("storageBucketName", () => {
  it("uses FIREBASE_STORAGE_BUCKET when set (local dev)", () => {
    process.env.FIREBASE_STORAGE_BUCKET = "local-bucket";
    process.env.FIREBASE_CONFIG = JSON.stringify({ storageBucket: "runtime-bucket" });
    expect(storageBucketName()).toBe("local-bucket");
  });

  it("falls back to the FIREBASE_CONFIG Cloud Functions provides", () => {
    delete process.env.FIREBASE_STORAGE_BUCKET;
    process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: "ivorverse-ai", storageBucket: "ivorverse-ai.firebasestorage.app" });
    expect(storageBucketName()).toBe("ivorverse-ai.firebasestorage.app");
  });

  it("fails clearly when neither is available", () => {
    delete process.env.FIREBASE_STORAGE_BUCKET;
    delete process.env.FIREBASE_CONFIG;
    expect(() => storageBucketName()).toThrow("Storage bucket not configured");
  });
});

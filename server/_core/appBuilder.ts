/**
 * Real app-building sandbox — the missing piece that made Manus and Replit
 * feel like "AI that builds apps." Both of them run Claude as the reasoning
 * engine (confirmed: Manus's own team has said publicly "it needs E2B to
 * have a full virtual computer to work as a real human") plus a cloud
 * sandbox to actually execute code. This module is that sandbox, wired
 * directly into IvorVerse instead of calling out to Manus or Replit.
 *
 * Requires E2B_API_KEY (https://e2b.dev). Uses E2B's core Sandbox SDK
 * (file system + terminal + exposed ports), not the narrower Jupyter-style
 * Code Interpreter variant, since building/running a whole app needs a real
 * writable filesystem, package installs, and a live preview URL.
 */
import { Sandbox } from "e2b";

export type SandboxFile = {
  path: string;
  content: string;
};

export type BuildAppOptions = {
  files: SandboxFile[];
  installCommand?: string; // default: "npm install"
  startCommand: string; // e.g. "npm run dev -- --host 0.0.0.0 --port 3000"
  port: number;
  timeoutMs?: number; // how long the sandbox stays alive (default 10 min)
};

export type BuildAppResult = {
  previewUrl: string;
  sandboxId: string;
  installLog: string;
};

/** How long a build sandbox (and so its preview URL) stays alive. */
export const SANDBOX_TIMEOUT_MS = 10 * 60 * 1000;
const SERVER_BOOT_WAIT_MS = 3000;

export async function buildApp(options: BuildAppOptions): Promise<BuildAppResult> {
  if (!process.env.E2B_API_KEY) {
    throw new Error("E2B_API_KEY is not configured");
  }

  const sandbox = await Sandbox.create({
    timeoutMs: options.timeoutMs ?? SANDBOX_TIMEOUT_MS,
  });

  try {
    // Write all generated files into the sandbox's filesystem.
    await sandbox.files.write(
      options.files.map((f) => ({ path: f.path, data: f.content }))
    );

    // Install dependencies synchronously so real errors surface before we
    // try to start the server.
    const install = await sandbox.commands.run(
      options.installCommand ?? "npm install"
    );
    const installLog = `${install.stdout}\n${install.stderr}`.trim();

    if (install.exitCode !== 0) {
      throw new Error(`Dependency install failed:\n${installLog}`);
    }

    // Start the app in the background and give it a moment to boot.
    await sandbox.commands.run(options.startCommand, { background: true });
    await new Promise((resolve) => setTimeout(resolve, SERVER_BOOT_WAIT_MS));

    const host = sandbox.getHost(options.port);
    return {
      previewUrl: `https://${host}`,
      sandboxId: sandbox.sandboxId,
      installLog,
    };
  } catch (error) {
    // Only tear down on failure — on success we deliberately leave the
    // sandbox running so the preview URL keeps working until it times out.
    await sandbox.kill().catch(() => {});
    throw error;
  }
}

export async function stopSandbox(sandboxId: string): Promise<void> {
  const sandbox = await Sandbox.connect(sandboxId);
  await sandbox.kill();
}

import { COOKIE_NAME } from "@shared/const";
import { getAppUrl } from "./_core/appUrl";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router, adminProcedure } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import { generateImage } from "./_core/imageGeneration";
import { transcribeAudio } from "./_core/voiceTranscription";
import { generateSpeech, TTS_MAX_CHARS, TTS_VOICES } from "./_core/textToSpeech";
import { processVoiceTurn } from "./_core/voiceConversation";
import { enqueueJob } from "./_core/jobs";
import { consumeQuota, getQuotaUsage, refundQuota } from "./_core/quota";
import type { QuotaKey } from "@shared/plans";
import { AppTypeSchema } from "./_core/appGeneration";
import { AGENT_TOOLS, DEFAULT_AGENT_TOOLS } from "./_core/agentRunner";
import {
  createOnboardingLink,
  createProductCheckout,
  getPurchaseDelivery,
  isRecurring,
  platformFeePercent,
  refreshSellerStatus,
} from "./_core/marketplace";
import {
  parseWorkflowDefinition,
  startWorkflowRun,
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
} from "./_core/workflowRunner";
import { stripeRouter } from "./stripe";
import { TRPCError } from "@trpc/server";
import { checkRateLimit, getRateLimitKey, AUTH_RATE_LIMITS } from "./_core/rateLimiter";



/**
 * Throw NOT_FOUND unless the project exists and belongs to the caller. Every
 * procedure that takes a projectId must call this (or a user-scoped lookup)
 * before reading or writing project data: several didn't, so any logged-in
 * user could e.g. read another user's chat history via chat.getMessages.
 */
async function requireOwnedProject(projectId: number, userId: number) {
  const project = await db.getProjectById(projectId, userId);
  if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
  return project;
}

const ProductInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(["digital", "subscription", "course", "ebook", "saas"]),
  price: z.number().min(1).max(10000), // USD
  description: z.string().max(5000).optional(),
  // http(s) only: it goes into buyer emails and links
  deliveryUrl: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) link")
    .optional(),
  published: z.boolean().default(false),
});

async function requireOwnedProduct(productId: number, userId: number) {
  const product = await db.getProductById(productId);
  if (!product || product.userId !== userId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
  }
  return product;
}

/**
 * Generate an image for a project and record it. With a character, its face
 * image is the reference, so the same person appears in the result.
 */
async function generateProjectImage(
  userId: number,
  projectId: number,
  prompt: string,
  kind: string,
  characterId?: number
) {
  let fullPrompt = prompt;
  let originalImages: Array<{ url: string }> | undefined;
  if (characterId !== undefined) {
    const character = await db.getCharacterById(characterId, userId);
    if (!character) throw new TRPCError({ code: "NOT_FOUND", message: "Character not found" });
    if (!character.faceImageUrl) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Upload a face image for ${character.name} in Characters first.`,
      });
    }
    originalImages = [{ url: character.faceImageUrl }];
    fullPrompt =
      `${prompt}\n\nThe person in the reference image is ${character.name}` +
      (character.description ? ` (${character.description.slice(0, 1000)})` : "") +
      ". Feature them in the image and keep their face and identifying features the same.";
  }

  const { url, key } = await generateImage({ prompt: fullPrompt, userId, originalImages });
  if (!url || !key) throw new Error("Image generation returned no image");

  await db.createFile(userId, `${kind}-${Date.now()}.png`, key, url, "image/png", undefined, projectId);
  await db.trackUsage(userId, "image");
  return { url };
}

/** Every agent a workflow's steps reference must belong to the caller. */
async function requireOwnedAgents(definition: WorkflowDefinition, userId: number) {
  const ids = definition.steps.map((s) => s.agentId).filter((id): id is number => typeof id === "number");
  if (ids.length === 0) return;
  const owned = new Set((await db.getAgents(userId)).map((a) => a.id));
  if (ids.some((id) => !owned.has(id))) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
  }
}

/**
 * A protected procedure that charges one unit of a plan quota before running
 * and refunds it if the procedure fails (see quota.ts).
 */
const quotaProcedure = (quota: QuotaKey) =>
  protectedProcedure.use(async ({ ctx, next }) => {
    const period = await consumeQuota(ctx.user, quota);
    const result = await next();
    if (!result.ok) await refundQuota(ctx.user.id, quota, 1, period);
    return result;
  });

export const appRouter = router({
  system: systemRouter,
  stripe: stripeRouter,
  auth: router({
    // Never return the raw record: it holds the password hash and live
    // verification/reset tokens (an admin seeing another user's reset
    // token could take over that account).
    me: publicProcedure.query((opts) => (opts.ctx.user ? db.toPublicUser(opts.ctx.user) : null)),
    updateProfile: protectedProcedure
      .input(z.object({ name: z.string().trim().min(1).max(100) }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.updateUserProfile(ctx.user.id, { name: input.name });
        return user ? db.toPublicUser(user) : null;
      }),
    signOutEverywhere: protectedProcedure.mutation(async ({ ctx }) => {
      await db.revokeUserSessions(ctx.user.id);
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    deleteAccount: protectedProcedure
      .input(z.object({ password: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const rateLimit = checkRateLimit(getRateLimitKey("login", `delete:${ctx.user.id}`), AUTH_RATE_LIMITS.login);
        if (!rateLimit.allowed) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many attempts. Try again later." });
        }
        const { verifyPassword } = await import("./_core/auth");
        if (!ctx.user.passwordHash || !verifyPassword(input.password, ctx.user.passwordHash)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect password" });
        }
        const { deleteAccount } = await import("./_core/accountDeletion");
        await deleteAccount(ctx.user.id);
        await db.logAuditAction("delete_account", ctx.user.id);
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
        return { success: true } as const;
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
    // Email/Password signup
    signup: publicProcedure
      .input(
        z.object({
          email: z.string().email("Invalid email address"),
          password: z.string().min(8, "Password must be at least 8 characters"),
          name: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Rate limiting
        const clientIp = ctx.req.headers['x-forwarded-for']?.toString().split(',')[0] || ctx.req.socket.remoteAddress || 'unknown';
        const rateLimitKey = getRateLimitKey('signup', input.email);
        const rateLimitResult = checkRateLimit(rateLimitKey, AUTH_RATE_LIMITS.signup);
        
        if (!rateLimitResult.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Too many signup attempts. Please try again in ${Math.ceil((rateLimitResult.resetTime - Date.now()) / 60000)} minutes.`,
          });
        }
        
        const { hashPassword, generateVerificationToken, getEmailVerificationExpirationTime } = await import("./_core/auth");
        const { sendVerificationEmail } = await import("./_core/emailService");
        // Check if user already exists
        const existingUser = await db.getUserByEmail(input.email);
        if (existingUser) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Email already registered",
          });
        }
        // Hash password
        const passwordHash = hashPassword(input.password);
        const emailVerificationToken = generateVerificationToken();
        const emailVerificationExpires = getEmailVerificationExpirationTime();
        // Create user
        const user = await db.createEmailUser({
          email: input.email,
          name: input.name || input.email.split("@")[0],
          passwordHash,
          emailVerificationToken,
          emailVerificationExpires,
          loginMethod: "email",
        });
        // Send verification email
        const appUrl = getAppUrl(ctx.req);
        const emailSent = await sendVerificationEmail(input.email, emailVerificationToken, appUrl);
        if (!emailSent) {
          console.warn(`[Auth] Failed to send verification email to ${input.email}`);
        }
        return {
          success: true,
          userId: user.id,
          message: "Account created. Please verify your email.",
        };
      }),

    // Email/Password login
    login: publicProcedure
      .input(
        z.object({
          email: z.string().email(),
          password: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Rate limiting
        const rateLimitKey = getRateLimitKey('login', input.email);
        const rateLimitResult = checkRateLimit(rateLimitKey, AUTH_RATE_LIMITS.login);
        
        if (!rateLimitResult.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Too many login attempts. Please try again in ${Math.ceil((rateLimitResult.resetTime - Date.now()) / 60000)} minutes.`,
          });
        }
        
        const { verifyPassword } = await import("./_core/auth");
        const user = await db.getUserByEmail(input.email);
        if (!user || !user.passwordHash) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid email or password",
          });
        }
        const isPasswordValid = verifyPassword(input.password, user.passwordHash);
        if (!isPasswordValid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid email or password",
          });
        }
        if (!user.emailVerified) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Please verify your email before logging in",
          });
        }
        if (user.disabled) {
          throw new TRPCError({ code: "FORBIDDEN", message: "This account has been disabled." });
        }
        // Must be a signed session JWT: authenticateRequest (session.ts)
        // rejects anything else, so a raw user id here broke every request
        // after an email/password login.
        const { createSessionToken } = await import("./_core/session");
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(
          COOKIE_NAME,
          await createSessionToken(user.id, { sessionVersion: user.sessionVersion ?? 0 }),
          cookieOptions
        );
        return {
          success: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
        };
      }),

    // Verify email
    verifyEmail: publicProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input }) => {
        const { isTokenExpired } = await import("./_core/auth");
        const user = await db.getUserByVerificationToken(input.token);
        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Invalid or expired verification token",
          });
        }
        if (isTokenExpired(user.emailVerificationExpires)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Verification token has expired",
          });
        }
        await db.verifyUserEmail(user.id);
        return {
          success: true,
          message: "Email verified successfully. You can now log in.",
        };
      }),

    // Request password reset
    requestPasswordReset: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input, ctx }) => {
        // Rate limiting
        const rateLimitKey = getRateLimitKey('passwordReset', input.email);
        const rateLimitResult = checkRateLimit(rateLimitKey, AUTH_RATE_LIMITS.passwordReset);
        
        if (!rateLimitResult.allowed) {
          // Don't reveal rate limit info for security
          return {
            success: true,
            message: "If an account exists with this email, you will receive a password reset link.",
          };
        }
        
        const { generatePasswordResetToken, getPasswordResetExpirationTime } = await import("./_core/auth");
        const { sendPasswordResetEmail } = await import("./_core/emailService");
        const user = await db.getUserByEmail(input.email);
        if (!user) {
          return {
            success: true,
            message: "If an account exists with this email, you will receive a password reset link.",
          };
        }
        const passwordResetToken = generatePasswordResetToken();
        const passwordResetExpires = getPasswordResetExpirationTime();
        await db.setPasswordResetToken(user.id, passwordResetToken, passwordResetExpires);
        // Send password reset email
        const appUrl = getAppUrl(ctx.req);
        const emailSent = await sendPasswordResetEmail(input.email, passwordResetToken, appUrl);
        if (!emailSent) {
          console.warn(`[Auth] Failed to send password reset email to ${input.email}`);
        }
        // Same response whether or not the account exists, and never the
        // token itself — returning it let anyone who knew an email address
        // reset that account's password.
        return {
          success: true,
          message: "If an account exists with this email, you will receive a password reset link.",
        };
      }),

    // Reset password
    resetPassword: publicProcedure
      .input(
        z.object({
          token: z.string(),
          newPassword: z.string().min(8, "Password must be at least 8 characters"),
        })
      )
      .mutation(async ({ input }) => {
        const { hashPassword, isTokenExpired } = await import("./_core/auth");
        const user = await db.getUserByPasswordResetToken(input.token);
        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Invalid or expired reset token",
          });
        }
        if (isTokenExpired(user.passwordResetExpires)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Reset token has expired",
          });
        }
        const newPasswordHash = hashPassword(input.newPassword);
        await db.resetUserPassword(user.id, newPasswordHash);
        // Anyone holding an old session (e.g. whoever the reset is locking out) is signed out
        await db.revokeUserSessions(user.id);
        return {
          success: true,
          message: "Password reset successfully. You can now log in with your new password.",
        };
      })
  }),

  // Projects
  projects: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserProjects(ctx.user.id);
    }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string(),
          type: z.enum(["chat", "research", "app", "music", "image", "voice", "video"]),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return await db.createProject(
          ctx.user.id,
          input.name,
          input.type,
          input.description
        );
      }),

    get: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        return await db.getProjectById(input.projectId, ctx.user.id);
      }),

    update: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          updates: z.record(z.string(), z.any()),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return await db.updateProject(input.projectId, ctx.user.id, input.updates);
      }),

    delete: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return await db.deleteProject(input.projectId, ctx.user.id);
      }),
  }),

  // Chat
  chat: router({
    sendMessage: quotaProcedure("chatMessages")
      .input(
        z.object({
          projectId: z.number(),
          message: z.string(),
          fileUrls: z.array(z.string()).optional(),
          searchWeb: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireOwnedProject(input.projectId, ctx.user.id);
        // Save user message
        await db.addChatMessage(input.projectId, ctx.user.id, "user", input.message, input.fileUrls);

        // Track usage
        await db.trackUsage(ctx.user.id, "chat");

        const now = new Date();
        const dateTimeContext = `Current date and time: ${now.toISOString()} (${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} at ${now.toLocaleTimeString("en-US")})`;

        const systemPrompt = `You are Ivor, the AI assistant for IvorVerse AI.
${dateTimeContext}
You have a web_search tool available — use it whenever the user asks about current events, prices, recent news, or anything time-sensitive. Always cite your sources with URLs when you use it.`;

        // Long-term memory for this project (facts worth remembering across messages)
        const memoryEntries = await db.getMemory(input.projectId);
        const memoryContext =
          memoryEntries.length > 0
            ? `\n\nThings to remember about this project:\n${memoryEntries
                .map((m) => `- ${m.key}: ${m.value}`)
                .join("\n")}`
            : "";

        // Retrieve full conversation history for context
        const allMessages = await db.getChatMessages(input.projectId);
        
        // Build conversation history for LLM (last 20 messages for context window)
        const conversationHistory = allMessages.slice(-20).map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        }));

        // Get response from the Claude orchestrator (can call tools, e.g. image generation)
        const { runOrchestrator } = await import("./_core/orchestrator");
        const result = await runOrchestrator(
          systemPrompt + memoryContext + "\n\nIMPORTANT: Maintain context from the conversation history. Understand pronouns and references to previous messages.",
          conversationHistory,
          { projectId: input.projectId, userId: ctx.user.id, user: ctx.user }
        );

        const assistantMessage = result.message;

        // Save assistant message, with any background jobs (app builds,
        // songs) it started so the chat can show their progress and results
        await db.addChatMessage(
          input.projectId,
          ctx.user.id,
          "assistant",
          assistantMessage,
          undefined,
          result.jobIds
        );

        return {
          message: assistantMessage,
          usedWebSearch: result.toolsUsed.includes("web_search"),
          jobIds: result.jobIds,
        };
      }),

    getMessages: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireOwnedProject(input.projectId, ctx.user.id);
        return await db.getChatMessages(input.projectId);
      }),

    uploadFile: protectedProcedure
      .input(
        z.object({
          filename: z.string(),
          fileData: z.string(), // base64
          mimeType: z.string(),
          projectId: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (input.projectId !== undefined) await requireOwnedProject(input.projectId, ctx.user.id);
        const buffer = Buffer.from(input.fileData, "base64");
        const { key, url } = await storagePut(
          `${ctx.user.id}/files/${input.filename}`,
          buffer,
          input.mimeType
        );

        await db.createFile(
          ctx.user.id,
          input.filename,
          key,
          url,
          input.mimeType,
          buffer.length,
          input.projectId
        );

        return { url, key };
      }),

    generateReport: quotaProcedure("researchReports")
      .input(
        z.object({
          projectId: z.number(),
          topic: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireOwnedProject(input.projectId, ctx.user.id);
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "You are an expert report writer. Generate a comprehensive report.",
            },
            { role: "user", content: `Generate a detailed report on: ${input.topic}` },
          ],
        });

        const reportContent = response.choices[0].message.content;
        await db.trackUsage(ctx.user.id, "chat");

        return { report: reportContent };
      }),
  }),

  // Research
  research: router({
    search: quotaProcedure("researchReports")
      .input(z.object({ query: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { runOrchestrator } = await import("./_core/orchestrator");
        const result = await runOrchestrator(
          "You are a research assistant. Use the web_search tool to answer the user's query with current, accurate information. Always cite sources with URLs.",
          [{ role: "user", content: input.query }]
        );

        await db.trackUsage(ctx.user.id, "research");

        return { summary: result.message };
      }),

    generateReport: quotaProcedure("researchReports")
      .input(
        z.object({
          projectId: z.number(),
          topic: z.string(),
          sources: z.array(z.string()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireOwnedProject(input.projectId, ctx.user.id);
        const { runOrchestrator } = await import("./_core/orchestrator");
        const result = await runOrchestrator(
          "You are a research expert. Use the web_search tool to ground your report in " +
            "current, real sources. Generate a comprehensive research report with inline citations and URLs.",
          [{ role: "user", content: `Research and report on: ${input.topic}` }]
        );

        const reportContent = result.message;

        await db.createResearchReport(
          input.projectId,
          ctx.user.id,
          input.topic,
          reportContent,
          input.sources
        );

        await db.trackUsage(ctx.user.id, "research");

        return { report: reportContent };
      }),
  }),

  // Music Studio
  music: router({
    generateLyrics: protectedProcedure
      .input(z.object({ projectId: z.number(), prompt: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await requireOwnedProject(input.projectId, ctx.user.id);
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "You are a talented songwriter. Generate song lyrics." },
            { role: "user", content: `Write song lyrics about: ${input.prompt}` },
          ],
        });

        const lyrics = response.choices[0].message.content;
        await db.trackUsage(ctx.user.id, "music");

        return { lyrics };
      }),

    generateStructure: protectedProcedure
      .input(z.object({ projectId: z.number(), prompt: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await requireOwnedProject(input.projectId, ctx.user.id);
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "You are a music producer. Generate a song structure in JSON format.",
            },
            { role: "user", content: `Create song structure for: ${input.prompt}` },
          ],
        });

        const structure = response.choices[0].message.content;
        await db.trackUsage(ctx.user.id, "music");

        return { structure };
      }),

    generateProductionPrompt: protectedProcedure
      .input(z.object({ projectId: z.number(), description: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await requireOwnedProject(input.projectId, ctx.user.id);
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "You are a music production expert. Generate a detailed production prompt.",
            },
            { role: "user", content: `Generate production prompt for: ${input.description}` },
          ],
        });

        const productionPrompt = response.choices[0].message.content;
        await db.trackUsage(ctx.user.id, "music");

        return { productionPrompt };
      }),

    // Song generation can outlast a request, so it runs as a background
    // job; the client polls jobs.get with the returned jobId.
    generateAudio: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          prompt: z.string().trim().min(1),
          lyrics: z.string().optional(),
          instrumental: z.boolean().optional(),
          durationSeconds: z.number().min(5).max(240).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireOwnedProject(input.projectId, ctx.user.id);
        const period = await consumeQuota(ctx.user, "musicGenerations");
        const job = await enqueueJob("music_generate", ctx.user.id, input, { quota: "musicGenerations", period });
        return { jobId: job.id };
      }),
  }),

  // Music Video Generator
  video: router({
    generateScenes: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          concept: z.string(),
          numScenes: z.number().min(1).max(10).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const numScenes = input.numScenes ?? 4;

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                `You write music video scene descriptions. Respond with ONLY a JSON array of ` +
                `exactly ${numScenes} strings, each a vivid, concrete visual scene description ` +
                `suitable for an AI image generator. No prose, no markdown, just the JSON array.`,
            },
            { role: "user", content: `Video concept: ${input.concept}` },
          ],
        });

        const raw = response.choices[0].message.content;
        const text = typeof raw === "string" ? raw : JSON.stringify(raw);
        let scenes: string[];
        try {
          const parsed = JSON.parse(text.trim().replace(/^```json\n?|```$/g, ""));
          scenes = Array.isArray(parsed) ? parsed.map(String) : [text];
        } catch {
          // Fall back to splitting by lines if the model didn't return clean JSON.
          scenes = text.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, numScenes);
        }

        const existing = await db.getVideoProject(input.projectId, ctx.user.id);
        if (existing) {
          await db.updateVideoProject(input.projectId, ctx.user.id, { scenes });
        } else {
          await db.createVideoProject(input.projectId, ctx.user.id);
          await db.updateVideoProject(input.projectId, ctx.user.id, { scenes });
        }

        await db.trackUsage(ctx.user.id, "video");

        return { scenes };
      }),

    generateSceneImages: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const videoProject = await db.getVideoProject(input.projectId, ctx.user.id);
        const scenes: string[] = Array.isArray(videoProject?.scenes) ? videoProject.scenes : [];
        if (scenes.length === 0) {
          throw new Error("Generate scenes before generating images.");
        }

        // One image per scene. Generated in parallel: one at a time could run
        // past the 60s a request through Firebase Hosting is allowed.
        const period = await consumeQuota(ctx.user, "imageGenerations", scenes.length);
        const results = await Promise.allSettled(
          scenes.map((scene) => generateImage({ prompt: scene, userId: ctx.user.id }))
        );
        const imageUrls = results
          .map((r) => (r.status === "fulfilled" ? r.value.url : undefined))
          .filter((url): url is string => Boolean(url));
        await refundQuota(ctx.user.id, "imageGenerations", scenes.length - imageUrls.length, period);
        if (imageUrls.length === 0) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Image generation failed. Please try again." });
        }
        for (const url of imageUrls) {
          await db.createFile(
            ctx.user.id,
            `scene-${Date.now()}.png`,
            `video-scenes/${ctx.user.id}/${Date.now()}`,
            url,
            "image/png",
            undefined,
            input.projectId
          );
        }

        await db.updateVideoProject(input.projectId, ctx.user.id, { imageUrls });
        await db.trackUsage(ctx.user.id, "video");

        return { imageUrls };
      }),

    // Rendering takes minutes, so it runs as a background job; the client
    // polls jobs.get with the returned jobId.
    assemble: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          audioUrl: z.string().url(),
          lyrics: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const videoProject = await db.getVideoProject(input.projectId, ctx.user.id);
        const imageUrls: string[] = Array.isArray(videoProject?.imageUrls) ? videoProject.imageUrls : [];
        if (imageUrls.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Generate scene images before assembling the video." });
        }
        const period = await consumeQuota(ctx.user, "videoGenerations");
        const job = await enqueueJob("video_assemble", ctx.user.id, input, { quota: "videoGenerations", period });
        return { jobId: job.id };
      }),

    getProject: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        return await db.getVideoProject(input.projectId, ctx.user.id);
      }),
  }),

  // Image Studio
  image: router({
    generate: quotaProcedure("imageGenerations")
      .input(z.object({ projectId: z.number(), prompt: z.string().trim().min(1).max(4000), characterId: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        await requireOwnedProject(input.projectId, ctx.user.id);
        return await generateProjectImage(ctx.user.id, input.projectId, input.prompt, "image", input.characterId);
      }),

    generateLogo: quotaProcedure("imageGenerations")
      .input(z.object({ projectId: z.number(), companyName: z.string().trim().min(1).max(200) }))
      .mutation(async ({ ctx, input }) => {
        await requireOwnedProject(input.projectId, ctx.user.id);
        return await generateProjectImage(
          ctx.user.id,
          input.projectId,
          `Professional logo for ${input.companyName}`,
          "logo"
        );
      }),

    generateThumbnail: quotaProcedure("imageGenerations")
      .input(z.object({ projectId: z.number(), title: z.string().trim().min(1).max(500), characterId: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        await requireOwnedProject(input.projectId, ctx.user.id);
        return await generateProjectImage(
          ctx.user.id,
          input.projectId,
          `YouTube thumbnail for: ${input.title}`,
          "thumbnail",
          input.characterId
        );
      }),

    generateGraphic: quotaProcedure("imageGenerations")
      .input(z.object({ projectId: z.number(), description: z.string().trim().min(1).max(4000), characterId: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        await requireOwnedProject(input.projectId, ctx.user.id);
        return await generateProjectImage(
          ctx.user.id,
          input.projectId,
          `Social media graphic: ${input.description}`,
          "graphic",
          input.characterId
        );
      }),
  }),

  // Voice Studio
  voice: router({
    // Recorded (MediaRecorder) or picked audio arrives base64-encoded; it's
    // stored first because Whisper transcription works from a URL.
    uploadAudio: protectedProcedure
      .input(
        z.object({
          fileData: z.string().max(10_000_000), // base64 of ~7.5MB of audio
          mimeType: z.string().regex(/^(audio|video)\//),
          filename: z.string().max(200).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const buffer = Buffer.from(input.fileData, "base64");
        const { url, key } = await storagePut(
          `${ctx.user.id}/voice/${input.filename || "recording"}`,
          buffer,
          input.mimeType
        );
        return { url, key };
      }),

    transcribe: quotaProcedure("voiceRequests")
      .input(z.object({ audioUrl: z.string().url(), language: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const result = await transcribeAudio({
          audioUrl: input.audioUrl,
          language: input.language,
        });

        // Previously an error result was swallowed and returned as empty text
        if ("error" in result) {
          throw new TRPCError({
            code: result.code === "SERVICE_ERROR" ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST",
            message: result.details ? `${result.error}: ${result.details}` : result.error,
          });
        }

        await db.trackUsage(ctx.user.id, "voice");
        return { text: result.text, language: result.language, duration: result.duration };
      }),

    generateSpeech: quotaProcedure("voiceRequests")
      .input(
        z.object({
          projectId: z.number().optional(),
          text: z.string().trim().min(1).max(TTS_MAX_CHARS),
          voice: z.enum(TTS_VOICES).optional(),
          instructions: z.string().max(500).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (input.projectId !== undefined) await requireOwnedProject(input.projectId, ctx.user.id);
        const { url } = await generateSpeech({
          text: input.text,
          userId: ctx.user.id,
          voice: input.voice,
          instructions: input.instructions,
        });
        await db.trackUsage(ctx.user.id, "voice");
        return { audioUrl: url };
      }),

    // One turn of a spoken conversation: the client records, uploads via
    // uploadAudio, calls this, plays replyAudioUrl, and keeps the history.
    converse: quotaProcedure("voiceRequests")
      .input(
        z.object({
          audioUrl: z.string().url(),
          history: z
            .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
            .max(20)
            .default([]),
          voice: z.enum(TTS_VOICES).optional(),
          language: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const result = await processVoiceTurn({
            audioUrl: input.audioUrl,
            userId: ctx.user.id,
            history: input.history,
            voice: input.voice,
            language: input.language,
          });
          await db.trackUsage(ctx.user.id, "voice");
          return result;
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "Voice conversation failed",
          });
        }
      }),
  }),

  jobs: router({
    get: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const job = await db.getJob(input.jobId);
        if (!job || job.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        }
        const { input: _input, ...rest } = job;
        return rest;
      }),
  }),

  // App Builder: generation + sandbox build run as a background job
  appBuilder: router({
    generate: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          appType: AppTypeSchema,
          description: z.string().trim().min(10).max(8000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId, ctx.user.id);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
        const period = await consumeQuota(ctx.user, "appBuilds");
        const job = await enqueueJob("app_build", ctx.user.id, input, { quota: "appBuilds", period });
        return { jobId: job.id };
      }),

    // The last saved build for a project (so results survive a page reload)
    get: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        const app = await db.getAppProject(input.projectId, ctx.user.id);
        if (!app || !app.sourceCode) return null;
        let files: Array<{ path: string; content: string }> = [];
        try {
          files = JSON.parse(app.sourceCode);
        } catch {
          // Pre-job records stored free-form text here
          files = [{ path: "README.md", content: app.sourceCode }];
        }
        return {
          appType: app.appType,
          requirements: app.requirements,
          design: app.design,
          files,
          previewUrl: app.sourceCodeUrl,
          updatedAt: app.updatedAt,
        };
      }),
  }),

  // Characters
  characters: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserCharacters(ctx.user.id);
    }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          personality: z.record(z.string(), z.any()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await consumeQuota(ctx.user, "characters");
        const result = await db.createCharacter(
          ctx.user.id,
          input.name,
          input.description,
          input.personality
        );
        return result;
      }),

    get: protectedProcedure
      .input(z.object({ characterId: z.number() }))
      .query(async ({ ctx, input }) => {
        return await db.getCharacterById(input.characterId, ctx.user.id);
      }),

    update: protectedProcedure
      .input(
        z.object({
          characterId: z.number(),
          // Explicit fields only: this used to accept any record and write it
          // straight to Firestore, so a caller could overwrite userId (moving
          // the character into another account) or any other field.
          updates: z
            .object({
              name: z.string().trim().min(1).max(100),
              description: z.string().max(2000),
              personality: z.record(z.string(), z.any()),
            })
            .partial()
            .strict(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return await db.updateCharacter(input.characterId, ctx.user.id, input.updates);
      }),

    // Face image or voice sample, base64-encoded from the browser
    uploadMedia: protectedProcedure
      .input(
        z.object({
          characterId: z.number(),
          kind: z.enum(["face", "voice"]),
          fileData: z.string().max(10_000_000), // base64 of ~7.5MB
          mimeType: z.string(),
          filename: z.string().max(200).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const character = await db.getCharacterById(input.characterId, ctx.user.id);
        if (!character) throw new TRPCError({ code: "NOT_FOUND", message: "Character not found" });

        const expected = input.kind === "face" ? /^image\// : /^(audio|video)\//;
        if (!expected.test(input.mimeType)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: input.kind === "face" ? "Face must be an image file" : "Voice sample must be an audio file",
          });
        }

        const { url, key } = await storagePut(
          `${ctx.user.id}/characters/${input.characterId}/${input.filename || input.kind}`,
          Buffer.from(input.fileData, "base64"),
          input.mimeType
        );
        await db.updateCharacter(
          input.characterId,
          ctx.user.id,
          input.kind === "face" ? { faceImageUrl: url, faceImageKey: key } : { voiceUrl: url, voiceKey: key }
        );
        return { url };
      }),

    delete: protectedProcedure
      .input(z.object({ characterId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const result = await db.deleteCharacter(input.characterId, ctx.user.id);
        return result;
      }),
  }),

  // Subscriptions
  subscriptions: router({
    getCurrent: protectedProcedure.query(async ({ ctx }) => {
      return await db.getOrCreateSubscription(ctx.user.id);
    }),
    // This month's usage against the plan's limits
    usage: protectedProcedure.query(async ({ ctx }) => getQuotaUsage(ctx.user)),
    // There is deliberately no client-callable "upgrade": the tier changes
    // only when Stripe confirms payment (handleStripeWebhook). A previous
    // subscriptions.upgrade let any user set their own tier for free.
  }),

  // Admin
  admin: router({
    listUsers: adminProcedure.query(async () => {
      return (await db.getAllUsers()).map(db.toPublicUser);
    }),

    getUserDetails: adminProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        const user = await db.getUserById(input.userId);
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        const [subscription, usage, projects] = await Promise.all([
          db.getSubscriptionByUserId(user.id),
          getQuotaUsage(user),
          db.getUserProjects(user.id),
        ]);
        return {
          user: db.toPublicUser(user),
          subscription: subscription
            ? {
                tier: subscription.tier,
                status: subscription.status,
                currentPeriodEnd: subscription.currentPeriodEnd,
                cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
              }
            : null,
          usage,
          projectCount: projects.length,
        };
      }),

    // Blocks login and signs the user out everywhere. Billing is untouched:
    // cancel or refund in Stripe if that's also wanted.
    disableUser: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (input.userId === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "You can't disable your own account" });
        }
        await db.setUserDisabled(input.userId, true);
        await db.logAuditAction("disable_user", ctx.user.id, ctx.user.id, input.userId);
        return { success: true };
      }),

    enableUser: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.setUserDisabled(input.userId, false);
        await db.logAuditAction("enable_user", ctx.user.id, ctx.user.id, input.userId);
        return { success: true };
      }),

    getUsageStats: adminProcedure.query(async () => {
      return await db.getPlatformStats();
    }),
  }),

  // Ported from "AI OS & Autonomous Business Platform"
  agents: router({
    create: protectedProcedure
      .input(
        z.object({
          name: z.string().trim().min(1).max(100),
          // The agent's standing instructions
          description: z.string().max(4000).optional(),
          // Tools the agent may use when running tasks
          capabilities: z.array(z.enum(AGENT_TOOLS)).default(DEFAULT_AGENT_TOOLS),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await db.createAgent(
          ctx.user.id,
          input.name,
          input.description,
          input.capabilities
        );
        await db.logAuditAction("create_agent", ctx.user.id);
        return result;
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getAgents(ctx.user.id);
    }),

    createTask: protectedProcedure
      .input(
        z.object({
          title: z.string(),
          description: z.string().optional(),
          agentId: z.number().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (input.agentId !== undefined) {
          const agents = await db.getAgents(ctx.user.id);
          if (!agents.some((a) => a.id === input.agentId)) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
          }
        }
        const result = await db.createTask(
          ctx.user.id,
          input.title,
          input.description,
          input.agentId
        );
        await db.trackUsage(ctx.user.id, "task_created");
        return result;
      }),

    listTasks: protectedProcedure.query(async ({ ctx }) => {
      return await db.getTasks(ctx.user.id);
    }),

    // Have the task's agent actually do the work (background job — see
    // agentRunner.ts); progress and the final report land on the task.
    runTask: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const task = await db.getTaskById(input.taskId, ctx.user.id);
        if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
        if (task.status === "in_progress" && task.jobId) {
          // Allow a re-run if the previous job ended or its worker died
          // (e.g. killed at the 540s limit) without updating the task.
          const job = await db.getJob(task.jobId);
          const stale = !job || Date.now() - new Date(job.updatedAt).getTime() > 10 * 60 * 1000;
          if (job && (job.status === "queued" || job.status === "running") && !stale) {
            throw new TRPCError({ code: "CONFLICT", message: "This task is already running" });
          }
        }
        const period = await consumeQuota(ctx.user, "agentRuns");
        const job = await enqueueJob("agent_task", ctx.user.id, { taskId: task.id }, { quota: "agentRuns", period });
        await db.updateTask(task.id, { status: "in_progress", progress: 0, jobId: job.id, error: null });
        return { jobId: job.id };
      }),

    updateTaskStatus: protectedProcedure
      .input(
        z.object({
          taskId: z.number(),
          status: z.enum(["pending", "in_progress", "completed", "failed"]),
          progress: z.number().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const updated = await db.updateTaskStatus(input.taskId, ctx.user.id, input.status, input.progress ?? 0);
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
        return { success: true };
      }),
  }),

  workflows: router({
    create: protectedProcedure
      .input(
        z.object({
          name: z.string().trim().min(1).max(100),
          description: z.string().max(2000).optional(),
          definition: WorkflowDefinitionSchema,
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireOwnedAgents(input.definition, ctx.user.id);
        const result = await db.createWorkflow(
          ctx.user.id,
          input.name,
          JSON.stringify(input.definition),
          input.description
        );
        await db.logAuditAction("create_workflow", ctx.user.id);
        return result;
      }),

    update: protectedProcedure
      .input(
        z.object({
          workflowId: z.number(),
          name: z.string().trim().min(1).max(100),
          description: z.string().max(2000).optional(),
          definition: WorkflowDefinitionSchema,
        })
      )
      .mutation(async ({ input, ctx }) => {
        const workflow = await db.getWorkflowById(input.workflowId, ctx.user.id);
        if (!workflow) throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" });
        await requireOwnedAgents(input.definition, ctx.user.id);
        await db.updateWorkflow(workflow.id, {
          name: input.name,
          description: input.description ?? null,
          definition: JSON.stringify(input.definition),
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ workflowId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const workflow = await db.getWorkflowById(input.workflowId, ctx.user.id);
        if (!workflow) throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" });
        await db.deleteWorkflow(workflow.id);
        return { success: true };
      }),

    // steps is null for legacy free-form definitions, which can't run
    list: protectedProcedure.query(async ({ ctx }) => {
      const workflows = await db.getWorkflows(ctx.user.id);
      return workflows.map((w) => ({ ...w, steps: parseWorkflowDefinition(w.definition)?.steps ?? null }));
    }),

    run: protectedProcedure
      .input(z.object({ workflowId: z.number(), input: z.string().max(8000).optional() }))
      .mutation(async ({ input, ctx }) => {
        const workflow = await db.getWorkflowById(input.workflowId, ctx.user.id);
        if (!workflow) throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" });
        const definition = parseWorkflowDefinition(workflow.definition);
        if (!definition) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This workflow uses an old definition format. Edit it to add steps before running.",
          });
        }
        // Each step is an agent run; charge them all up front
        const period = await consumeQuota(ctx.user, "agentRuns", definition.steps.length);
        const run = await startWorkflowRun(workflow, definition, ctx.user.id, input.input?.trim() || null, period);
        return { runId: run.id };
      }),

    listRuns: protectedProcedure
      .input(z.object({ workflowId: z.number() }))
      .query(async ({ input, ctx }) => {
        const workflow = await db.getWorkflowById(input.workflowId, ctx.user.id);
        if (!workflow) throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" });
        const runs = await db.getWorkflowRuns(workflow.id, ctx.user.id);
        // Summaries only; full step outputs come from getRun
        return runs.slice(0, 20).map((r) => ({
          id: r.id,
          status: r.status,
          input: r.input,
          createdAt: r.createdAt,
          completedAt: r.completedAt,
          stepsDone: r.steps.filter((s) => s.status === "completed").length,
          stepCount: r.steps.length,
        }));
      }),

    getRun: protectedProcedure
      .input(z.object({ runId: z.number() }))
      .query(async ({ input, ctx }) => {
        const run = await db.getWorkflowRun(input.runId, ctx.user.id);
        if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
        return run;
      }),
  }),

  monetization: router({
    // --- Seller (Stripe Connect) ---
    sellerStatus: protectedProcedure.query(async ({ ctx }) => {
      const user = await db.getUserById(ctx.user.id);
      const status = await refreshSellerStatus({ id: ctx.user.id, stripeConnectAccountId: user?.stripeConnectAccountId });
      return { ...status, platformFeePercent: platformFeePercent() };
    }),

    startOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
      const user = await db.getUserById(ctx.user.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      return { url: await createOnboardingLink(user, getAppUrl(ctx.req)) };
    }),

    // Stripe Express dashboard (balance, payouts, refunds)
    sellerDashboardLink: protectedProcedure.mutation(async ({ ctx }) => {
      const user = await db.getUserById(ctx.user.id);
      if (!user?.stripeConnectAccountId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Connect Stripe first" });
      }
      const { getStripe } = await import("./stripe");
      const link = await getStripe().accounts.createLoginLink(user.stripeConnectAccountId);
      return { url: link.url };
    }),

    // --- Products (seller) ---
    createProduct: protectedProcedure
      .input(ProductInputSchema)
      .mutation(async ({ input, ctx }) => {
        const result = await db.createProduct(ctx.user.id, input.name, input.type, input.price, input.description);
        await db.updateProduct(result.id, { deliveryUrl: input.deliveryUrl ?? null, published: input.published });
        await db.logAuditAction("create_product", ctx.user.id);
        return result;
      }),

    updateProduct: protectedProcedure
      .input(ProductInputSchema.extend({ productId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await requireOwnedProduct(input.productId, ctx.user.id);
        await db.updateProduct(input.productId, {
          name: input.name,
          type: input.type,
          price: input.price,
          description: input.description ?? null,
          deliveryUrl: input.deliveryUrl ?? null,
          published: input.published,
        });
        return { success: true };
      }),

    deleteProduct: protectedProcedure
      .input(z.object({ productId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await requireOwnedProduct(input.productId, ctx.user.id);
        await db.deleteProduct(input.productId);
        return { success: true };
      }),

    listProducts: protectedProcedure.query(async ({ ctx }) => {
      const [products, sales] = await Promise.all([db.getProducts(ctx.user.id), db.getSalesBySeller(ctx.user.id)]);
      return products.map((p) => {
        const productSales = sales.filter((s) => s.productId === p.id);
        return {
          ...p,
          salesCount: productSales.length,
          revenue: productSales.reduce((sum, s) => sum + s.amount, 0),
        };
      });
    }),

    recentSales: protectedProcedure.query(async ({ ctx }) => {
      const [sales, products] = await Promise.all([db.getSalesBySeller(ctx.user.id), db.getProducts(ctx.user.id)]);
      const names = new Map(products.map((p) => [p.id, p.name]));
      return sales.slice(0, 20).map((s) => ({
        productName: names.get(s.productId) ?? "Deleted product",
        amount: s.amount,
        buyerEmail: s.buyerEmail,
        mode: s.mode,
        createdAt: s.createdAt,
      }));
    }),

    // --- Public (buyers; no account needed) ---
    getPublicProduct: publicProcedure
      .input(z.object({ productId: z.number() }))
      .query(async ({ input }) => {
        const product = await db.getProductById(input.productId);
        if (!product || !product.published) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
        const seller = await db.getUserById(product.userId);
        // Deliberately excludes deliveryUrl: that is only for paying buyers
        return {
          id: product.id,
          name: product.name,
          description: product.description,
          type: product.type,
          price: product.price,
          recurring: isRecurring(product),
          sellerName: seller?.name ?? "Seller",
          purchasable: Boolean(seller?.stripeChargesEnabled && product.price && product.price > 0),
        };
      }),

    checkout: publicProcedure
      .input(z.object({ productId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        try {
          return { url: await createProductCheckout(input.productId, getAppUrl(ctx.req)) };
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Checkout failed",
          });
        }
      }),

    getPurchase: publicProcedure
      .input(z.object({ productId: z.number(), sessionId: z.string().regex(/^cs_[A-Za-z0-9_]+$/) }))
      .query(async ({ input }) => {
        const delivery = await getPurchaseDelivery(input.productId, input.sessionId);
        if (!delivery) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase not found" });
        return delivery;
      }),
  }),
});

export type AppRouter = typeof appRouter;

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
import { AppTypeSchema } from "./_core/appGeneration";
import { stripeRouter } from "./stripe";
import { TRPCError } from "@trpc/server";
import { checkRateLimit, getRateLimitKey, AUTH_RATE_LIMITS } from "./_core/rateLimiter";



export const appRouter = router({
  system: systemRouter,
  stripe: stripeRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    updateProfile: protectedProcedure
      .input(z.object({ name: z.string().trim().min(1).max(100) }))
      .mutation(async ({ ctx, input }) => {
        return await db.updateUserProfile(ctx.user.id, { name: input.name });
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
        // Must be a signed session JWT: authenticateRequest (session.ts)
        // rejects anything else, so a raw user id here broke every request
        // after an email/password login.
        const { createSessionToken } = await import("./_core/session");
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, await createSessionToken(user.id), cookieOptions);
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
    sendMessage: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          message: z.string(),
          fileUrls: z.array(z.string()).optional(),
          searchWeb: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
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
          { projectId: input.projectId, userId: ctx.user.id }
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

    generateReport: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          topic: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
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
    search: protectedProcedure
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

    generateReport: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          topic: z.string(),
          sources: z.array(z.string()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
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
        const job = await enqueueJob("music_generate", ctx.user.id, input);
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

        const imageUrls: string[] = [];
        for (const scene of scenes) {
          const { url } = await generateImage({ prompt: scene });
          if (url) {
            imageUrls.push(url);
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
        const job = await enqueueJob("video_assemble", ctx.user.id, input);
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
    generate: protectedProcedure
      .input(z.object({ projectId: z.number(), prompt: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { url: imageUrl } = await generateImage({ prompt: input.prompt });

        await db.createFile(
          ctx.user.id,
          `image-${Date.now()}.png`,
          `images/${ctx.user.id}/${Date.now()}`,
          imageUrl || "",
          "image/png",
          undefined,
          input.projectId
        );

        await db.trackUsage(ctx.user.id, "image");

        return { url: imageUrl };
      }),

    generateLogo: protectedProcedure
      .input(z.object({ projectId: z.number(), companyName: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { url } = await generateImage({
          prompt: `Professional logo for ${input.companyName}`,
        });

        await db.trackUsage(ctx.user.id, "image");
        return { url };
      }),

    generateThumbnail: protectedProcedure
      .input(z.object({ projectId: z.number(), title: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { url } = await generateImage({
          prompt: `YouTube thumbnail for: ${input.title}`,
        });

        await db.trackUsage(ctx.user.id, "image");
        return { url };
      }),

    generateGraphic: protectedProcedure
      .input(z.object({ projectId: z.number(), description: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { url } = await generateImage({
          prompt: `Social media graphic: ${input.description}`,
        });

        await db.trackUsage(ctx.user.id, "image");
        return { url };
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

    transcribe: protectedProcedure
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

    generateSpeech: protectedProcedure
      .input(
        z.object({
          projectId: z.number().optional(),
          text: z.string().trim().min(1).max(TTS_MAX_CHARS),
          voice: z.enum(TTS_VOICES).optional(),
          instructions: z.string().max(500).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
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
    converse: protectedProcedure
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
        const job = await enqueueJob("app_build", ctx.user.id, input);
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
          updates: z.record(z.string(), z.any()),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return await db.updateCharacter(input.characterId, ctx.user.id, input.updates);
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

    upgrade: protectedProcedure
      .input(z.object({ tier: z.enum(["free", "pro", "business"]) }))
      .mutation(async ({ ctx, input }) => {
        return await db.updateSubscription(ctx.user.id, { tier: input.tier });
      }),
  }),

  // Admin
  admin: router({
    listUsers: adminProcedure.query(async () => {
      return await db.getAllUsers();
    }),

    getUserDetails: adminProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        return await db.getUserById(input.userId);
      }),

    disableUser: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.logAuditAction("disable_user", ctx.user.id, ctx.user.id, input.userId);
        return await db.disableUser(input.userId);
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
          name: z.string(),
          description: z.string().optional(),
          capabilities: z.any().optional(),
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

    updateTaskStatus: protectedProcedure
      .input(
        z.object({
          taskId: z.number(),
          status: z.enum(["pending", "in_progress", "completed", "failed"]),
          progress: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return await db.updateTaskStatus(input.taskId, input.status, input.progress ?? 0);
      }),
  }),

  workflows: router({
    create: protectedProcedure
      .input(
        z.object({
          name: z.string(),
          definition: z.string(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await db.createWorkflow(
          ctx.user.id,
          input.name,
          input.definition,
          input.description
        );
        await db.logAuditAction("create_workflow", ctx.user.id);
        return result;
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getWorkflows(ctx.user.id);
    }),
  }),

  monetization: router({
    createProduct: protectedProcedure
      .input(
        z.object({
          name: z.string(),
          type: z.enum(["digital", "subscription", "course", "ebook", "saas"]),
          price: z.number().optional(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await db.createProduct(
          ctx.user.id,
          input.name,
          input.type,
          input.price,
          input.description
        );
        await db.logAuditAction("create_product", ctx.user.id);
        return result;
      }),

    listProducts: protectedProcedure.query(async ({ ctx }) => {
      return await db.getProducts(ctx.user.id);
    }),
  }),
});

export type AppRouter = typeof appRouter;

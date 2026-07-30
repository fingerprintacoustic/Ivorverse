import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router, adminProcedure } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { webSearch, newsSearch, isCurrentInfoQuery, getCurrentContext, formatSearchResultsForLLM } from "./_core/webSearch";
import { storagePut } from "./storage";
import { generateImage } from "./_core/imageGeneration";
import { transcribeAudio } from "./_core/voiceTranscription";
import { stripeRouter } from "./stripe";
import { TRPCError } from "@trpc/server";
import { checkRateLimit, getRateLimitKey, AUTH_RATE_LIMITS } from "./_core/rateLimiter";



export const appRouter = router({
  system: systemRouter,
  stripe: stripeRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
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
        const appUrl = ctx.req.headers.origin || "https://ivorverse.ai";
        const emailSent = await sendVerificationEmail(input.email, emailVerificationToken, appUrl);
        if (!emailSent) {
          console.warn(`[Auth] Failed to send verification email to ${input.email}`);
        }
        return {
          success: true,
          userId: user.id,
          message: "Account created. Please verify your email.",
          verificationToken: emailVerificationToken,
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
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, user.id.toString(), cookieOptions);
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
        const appUrl = ctx.req.headers.origin || "https://ivorverse.ai";
        const emailSent = await sendPasswordResetEmail(input.email, passwordResetToken, appUrl);
        if (!emailSent) {
          console.warn(`[Auth] Failed to send password reset email to ${input.email}`);
        }
        return {
          success: true,
          message: "Password reset link sent to your email.",
          resetToken: passwordResetToken,
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
        const { webSearch: performWebSearch, formatSearchResultsForLLM, isCurrentInfoQuery, getCurrentContext } = await import("./_core/webSearch");
        
        // Save user message
        await db.addChatMessage(input.projectId, ctx.user.id, "user", input.message, input.fileUrls);

        // Track usage
        await db.trackUsage(ctx.user.id, "chat");

        // Detect if web search is needed for current information
        const needsWebSearch = input.searchWeb !== false && isCurrentInfoQuery(input.message);
        
        let searchContext = "";
        if (needsWebSearch) {
          try {
            const { results } = await performWebSearch(input.message, { maxResults: 5 });
            if (results.length > 0) {
              searchContext = formatSearchResultsForLLM(results);
            }
          } catch (error) {
            console.error("[Chat] Web search failed:", error);
          }
        }

        const systemPrompt = `You are Ivor, the AI assistant for IvorVerse AI.
${getCurrentContext()}
${searchContext ? `\nCurrent information available:\n${searchContext}\nUse this information to provide accurate, up-to-date answers. Always cite your sources with URLs.` : "You have access to current information. Provide accurate, helpful responses."}`;

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
          systemPrompt + "\n\nIMPORTANT: Maintain context from the conversation history. Understand pronouns and references to previous messages.",
          conversationHistory
        );

        const assistantMessage = result.message;
        
        // Add source citations if web search was used
        const finalMessage = needsWebSearch && searchContext 
          ? `${assistantMessage}\n\n---\n**Sources:**\n${searchContext}`
          : assistantMessage;

        // Save assistant message
        await db.addChatMessage(input.projectId, ctx.user.id, "assistant", finalMessage);

        return { message: finalMessage, usedWebSearch: needsWebSearch };
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
        // This would integrate with a web search API
        // For now, return a placeholder
        await db.trackUsage(ctx.user.id, "research");

        return {
          results: [
            {
              title: "Search Result 1",
              url: "https://example.com",
              snippet: "Sample search result",
            },
          ],
        };
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
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                "You are a research expert. Generate a comprehensive research report with citations.",
            },
            { role: "user", content: `Research and report on: ${input.topic}` },
          ],
        });

        const reportContent = typeof response.choices[0].message.content === 'string' 
          ? response.choices[0].message.content 
          : JSON.stringify(response.choices[0].message.content);

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
    transcribe: protectedProcedure
      .input(z.object({ audioUrl: z.string(), language: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const result = await transcribeAudio({
          audioUrl: input.audioUrl,
          language: input.language || "en",
        });

        await db.trackUsage(ctx.user.id, "voice");

        const text = (result && 'text' in result) ? result.text : "";
        return { text, language: "en" };
      }),

    generateSpeech: protectedProcedure
      .input(z.object({ projectId: z.number(), text: z.string() }))
      .mutation(async ({ ctx, input }) => {
        // This would integrate with a TTS API
        await db.trackUsage(ctx.user.id, "voice");

        return { audioUrl: "https://example.com/audio.mp3" };
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
      // This would aggregate usage data
      return { totalUsers: 0, totalUsage: 0 };
    }),
  }),
});

export type AppRouter = typeof appRouter;

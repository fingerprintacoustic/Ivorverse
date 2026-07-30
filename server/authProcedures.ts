import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { hashPassword, verifyPassword, generateVerificationToken, generatePasswordResetToken, getEmailVerificationExpirationTime, getPasswordResetExpirationTime, isTokenExpired } from "./_core/auth";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { createSessionToken } from "./_core/session";

export const emailAuthRouter = router({
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

      // Create user with email/password
      const user = await db.createEmailUser({
        email: input.email,
        name: input.name || input.email.split("@")[0],
        passwordHash,
        emailVerificationToken,
        emailVerificationExpires,
        loginMethod: "email",
      });

      // TODO: Send verification email with token
      // For now, return token for testing
      return {
        success: true,
        userId: user.id,
        message: "Account created. Please verify your email.",
        verificationToken: emailVerificationToken, // Remove in production
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
      // Find user by email
      const user = await db.getUserByEmail(input.email);
      if (!user || !user.passwordHash) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      }

      // Verify password
      const isPasswordValid = verifyPassword(input.password, user.passwordHash);
      if (!isPasswordValid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      }

      // Check if email is verified
      if (!user.emailVerified) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Please verify your email before logging in",
        });
      }

      // Set session cookie (a signed JWT, verified by session.ts on every request)
      const cookieOptions = getSessionCookieOptions(ctx.req);
      const sessionToken = await createSessionToken(user.id);
      ctx.res.cookie(COOKIE_NAME, sessionToken, cookieOptions);

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

  // Verify email with token
  verifyEmail: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      // Find user with verification token
      const user = await db.getUserByVerificationToken(input.token);
      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invalid or expired verification token",
        });
      }

      // Check if token is expired
      if (isTokenExpired(user.emailVerificationExpires)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Verification token has expired",
        });
      }

      // Mark email as verified
      await db.verifyUserEmail(user.id);

      return {
        success: true,
        message: "Email verified successfully. You can now log in.",
      };
    }),

  // Request password reset
  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      // Find user by email
      const user = await db.getUserByEmail(input.email);
      if (!user) {
        // Don't reveal if email exists for security
        return {
          success: true,
          message: "If an account exists with this email, you will receive a password reset link.",
        };
      }

      // Generate reset token
      const passwordResetToken = generatePasswordResetToken();
      const passwordResetExpires = getPasswordResetExpirationTime();

      // Save reset token
      await db.setPasswordResetToken(user.id, passwordResetToken, passwordResetExpires);

      // TODO: Send reset email with token
      // For now, return token for testing
      return {
        success: true,
        message: "Password reset link sent to your email.",
        resetToken: passwordResetToken, // Remove in production
      };
    }),

  // Reset password with token
  resetPassword: publicProcedure
    .input(
      z.object({
        token: z.string(),
        newPassword: z.string().min(8, "Password must be at least 8 characters"),
      })
    )
    .mutation(async ({ input }) => {
      // Find user with reset token
      const user = await db.getUserByPasswordResetToken(input.token);
      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invalid or expired reset token",
        });
      }

      // Check if token is expired
      if (isTokenExpired(user.passwordResetExpires)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Reset token has expired",
        });
      }

      // Hash new password
      const newPasswordHash = hashPassword(input.newPassword);

      // Update password and clear reset token
      await db.resetUserPassword(user.id, newPasswordHash);

      return {
        success: true,
        message: "Password reset successfully. You can now log in with your new password.",
      };
    }),
});

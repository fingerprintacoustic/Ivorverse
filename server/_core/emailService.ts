/**
 * Email Service for sending verification and password reset emails.
 *
 * REAL BUG FOUND AND FIXED: this was a stub that only logged to the
 * console and always returned success — no email was ever actually sent.
 * Since signup requires email verification before login (see
 * authProcedures.ts), this meant no one could actually complete signup
 * and log in in production, despite the auth test suite passing (those
 * tests check the token-generation logic in isolation, not whether an
 * email carrying that token ever reaches anyone).
 */
import { Resend } from "resend";

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

let _resend: Resend | null = null;
function getClient(): Resend {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const from = process.env.EMAIL_FROM || "IvorVerse AI <onboarding@resend.dev>";
    const { error } = await getClient().emails.send({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    if (error) {
      console.error("[Email] Resend error:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[Email] Failed to send email:", error);
    return false;
  }
}

export function generateVerificationEmailHtml(
  email: string,
  verificationToken: string,
  appUrl: string = "https://ivorverse.ai"
): string {
  const verificationLink = `${appUrl}/verify-email?token=${verificationToken}`;
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Verify Your Email</title>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; }
          .header { color: #333; margin-bottom: 20px; }
          .content { color: #666; line-height: 1.6; margin-bottom: 20px; }
          .button { display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
          .footer { color: #999; font-size: 12px; margin-top: 20px; border-top: 1px solid #eee; padding-top: 20px; }
          .token { background-color: #f5f5f5; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px; word-break: break-all; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="header">Welcome to IvorVerse AI!</h1>
          
          <div class="content">
            <p>Thank you for creating an account. Please verify your email address to get started.</p>
            
            <a href="${verificationLink}" class="button">Verify Email</a>
            
            <p>Or copy and paste this verification token:</p>
            <div class="token">${verificationToken}</div>
            
            <p>This link will expire in 24 hours.</p>
          </div>
          
          <div class="footer">
            <p>If you didn't create this account, please ignore this email.</p>
            <p>&copy; 2026 IvorVerse AI. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

export function generatePasswordResetEmailHtml(
  email: string,
  resetToken: string,
  appUrl: string = "https://ivorverse.ai"
): string {
  const resetLink = `${appUrl}/reset-password?token=${resetToken}`;
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Reset Your Password</title>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; }
          .header { color: #333; margin-bottom: 20px; }
          .content { color: #666; line-height: 1.6; margin-bottom: 20px; }
          .button { display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
          .footer { color: #999; font-size: 12px; margin-top: 20px; border-top: 1px solid #eee; padding-top: 20px; }
          .token { background-color: #f5f5f5; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px; word-break: break-all; }
          .warning { background-color: #fff3cd; padding: 12px; border-radius: 4px; margin: 20px 0; color: #856404; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="header">Password Reset Request</h1>
          
          <div class="content">
            <p>We received a request to reset the password for your IvorVerse AI account.</p>
            
            <a href="${resetLink}" class="button">Reset Password</a>
            
            <p>Or copy and paste this reset token:</p>
            <div class="token">${resetToken}</div>
            
            <div class="warning">
              <strong>⚠️ Security Notice:</strong> This link will expire in 1 hour. If you didn't request a password reset, please ignore this email and your password will remain unchanged.
            </div>
          </div>
          
          <div class="footer">
            <p>&copy; 2026 IvorVerse AI. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

export async function sendVerificationEmail(
  email: string,
  verificationToken: string,
  appUrl?: string
): Promise<boolean> {
  const html = generateVerificationEmailHtml(email, verificationToken, appUrl);
  
  return sendEmail({
    to: email,
    subject: "Verify Your IvorVerse AI Email",
    html,
    text: `Verify your email by visiting: ${appUrl || "https://ivorverse.ai"}/verify-email?token=${verificationToken}`,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  appUrl?: string
): Promise<boolean> {
  const html = generatePasswordResetEmailHtml(email, resetToken, appUrl);
  
  return sendEmail({
    to: email,
    subject: "Reset Your IvorVerse AI Password",
    html,
    text: `Reset your password by visiting: ${appUrl || "https://ivorverse.ai"}/reset-password?token=${resetToken}`,
  });
}

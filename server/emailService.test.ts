import { describe, it, expect } from "vitest";
import { generateVerificationEmailHtml, generatePasswordResetEmailHtml } from "./_core/emailService";

describe("Email Service", () => {
  describe("Verification Email Template", () => {
    it("should generate verification email HTML", () => {
      const email = "test@example.com";
      const token = "abc123def456";
      const appUrl = "https://example.com";

      const html = generateVerificationEmailHtml(email, token, appUrl);

      expect(html).toContain("Verify Your Email");
      expect(html).toContain("Welcome to IvorVerse AI");
      expect(html).toContain(token);
      expect(html).toContain(`${appUrl}/verify-email?token=${token}`);
      expect(html).toContain("24 hours");
    });

    it("should use default app URL if not provided", () => {
      const email = "test@example.com";
      const token = "abc123def456";

      const html = generateVerificationEmailHtml(email, token);

      expect(html).toContain("https://ivorverse.ai/verify-email?token=");
    });

    it("should include verification link in HTML", () => {
      const email = "test@example.com";
      const token = "abc123def456";
      const appUrl = "https://example.com";

      const html = generateVerificationEmailHtml(email, token, appUrl);

      expect(html).toContain(`href="${appUrl}/verify-email?token=${token}"`);
    });

    it("should include token for manual entry", () => {
      const email = "test@example.com";
      const token = "abc123def456";

      const html = generateVerificationEmailHtml(email, token);

      // Should include token in a code/pre block for manual entry
      expect(html).toContain(token);
    });
  });

  describe("Password Reset Email Template", () => {
    it("should generate password reset email HTML", () => {
      const email = "test@example.com";
      const token = "xyz789uvw012";
      const appUrl = "https://example.com";

      const html = generatePasswordResetEmailHtml(email, token, appUrl);

      expect(html).toContain("Reset Your Password");
      expect(html).toContain("Password Reset Request");
      expect(html).toContain(token);
      expect(html).toContain(`${appUrl}/reset-password?token=${token}`);
      expect(html).toContain("1 hour");
    });

    it("should use default app URL if not provided", () => {
      const email = "test@example.com";
      const token = "xyz789uvw012";

      const html = generatePasswordResetEmailHtml(email, token);

      expect(html).toContain("https://ivorverse.ai/reset-password?token=");
    });

    it("should include reset link in HTML", () => {
      const email = "test@example.com";
      const token = "xyz789uvw012";
      const appUrl = "https://example.com";

      const html = generatePasswordResetEmailHtml(email, token, appUrl);

      expect(html).toContain(`href="${appUrl}/reset-password?token=${token}"`);
    });

    it("should include security warning", () => {
      const email = "test@example.com";
      const token = "xyz789uvw012";

      const html = generatePasswordResetEmailHtml(email, token);

      expect(html).toContain("Security Notice");
      expect(html).toContain("didn't request a password reset");
    });

    it("should include token for manual entry", () => {
      const email = "test@example.com";
      const token = "xyz789uvw012";

      const html = generatePasswordResetEmailHtml(email, token);

      // Should include token in a code/pre block for manual entry
      expect(html).toContain(token);
    });
  });

  describe("Email HTML Structure", () => {
    it("should include proper HTML structure in verification email", () => {
      const html = generateVerificationEmailHtml("test@example.com", "token123");

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<html>");
      expect(html).toContain("</html>");
      expect(html).toContain("<head>");
      expect(html).toContain("</head>");
      expect(html).toContain("<body>");
      expect(html).toContain("</body>");
    });

    it("should include proper HTML structure in reset email", () => {
      const html = generatePasswordResetEmailHtml("test@example.com", "token123");

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<html>");
      expect(html).toContain("</html>");
      expect(html).toContain("<head>");
      expect(html).toContain("</head>");
      expect(html).toContain("<body>");
      expect(html).toContain("</body>");
    });

    it("should include CSS styling", () => {
      const html = generateVerificationEmailHtml("test@example.com", "token123");

      expect(html).toContain("<style>");
      expect(html).toContain("</style>");
      expect(html).toContain("font-family");
      expect(html).toContain("background-color");
    });

    it("should include footer with copyright", () => {
      const html = generateVerificationEmailHtml("test@example.com", "token123");

      expect(html).toContain("IvorVerse AI");
      expect(html).toContain("All rights reserved");
    });
  });

  describe("Email Content Variations", () => {
    it("should handle different app URLs correctly", () => {
      const token = "token123";
      const urls = [
        "https://example.com",
        "http://localhost:3000",
        "https://subdomain.example.com",
      ];

      urls.forEach((url) => {
        const html = generateVerificationEmailHtml("test@example.com", token, url);
        expect(html).toContain(`${url}/verify-email?token=${token}`);
      });
    });

    it("should handle special characters in tokens", () => {
      const email = "test@example.com";
      const specialTokens = [
        "abc123def456",
        "0000000000000000000000000000000000000000000000000000000000000000",
        "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      ];

      specialTokens.forEach((token) => {
        const html = generateVerificationEmailHtml(email, token);
        expect(html).toContain(token);
      });
    });
  });
});

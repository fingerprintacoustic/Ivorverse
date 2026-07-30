# IvorVerse AI - Authentication Testing Guide

## Overview

This guide provides step-by-step instructions for testing the complete email/password authentication system.

## Test Environment

- **Frontend:** http://localhost:3000 (or https://3000-xxx.manus.computer)
- **Backend:** tRPC API at /api/trpc
- **Database:** MySQL with Drizzle ORM

## Test Scenarios

### 1. Sign Up Flow

**Objective:** Create a new user account with email verification

**Steps:**

1. Navigate to http://localhost:3000
2. Click "Sign Up" button
3. Enter test data:
   - Name: "Test User"
   - Email: "testuser@example.com"
   - Password: "TestPassword123!"
   - Confirm Password: "TestPassword123!"
4. Click "Sign Up"

**Expected Results:**

- Success message displayed: "Account created. Please verify your email."
- Verification token displayed (for testing purposes)
- User created in database with:
  - `emailVerified = false`
  - `emailVerificationToken` set
  - `emailVerificationExpires` set to 24 hours from now
  - `passwordHash` set (hashed password)

**Test Cases:**

| Test Case | Input | Expected Result |
|-----------|-------|-----------------|
| Valid signup | All fields correct | Account created, verification token shown |
| Duplicate email | Existing email | Error: "Email already registered" |
| Short password | "pass" | Error: "Password must be at least 8 characters" |
| Mismatched passwords | Different confirm | Error: "Passwords do not match" |
| Invalid email | "notanemail" | Error: "Invalid email address" |
| Missing fields | Leave blank | Error: "All fields are required" |

### 2. Email Verification Flow

**Objective:** Verify email address using verification token

**Steps:**

1. After signup, copy the verification token
2. Navigate to http://localhost:3000/verify-email
3. Paste token in "Verification Token" field
4. Click "Verify Email"

**Expected Results:**

- Success message: "Email verified successfully. You can now log in."
- User record updated with:
  - `emailVerified = true`
  - `emailVerificationToken = null`
  - `emailVerificationExpires = null`
- Redirect to login page after 2 seconds

**Test Cases:**

| Test Case | Input | Expected Result |
|-----------|-------|-----------------|
| Valid token | Correct token | Email verified, redirect to login |
| Invalid token | Random string | Error: "Invalid or expired verification token" |
| Expired token | Old token (>24h) | Error: "Verification token has expired" |
| Empty token | Leave blank | Error: "Please enter your verification token" |

### 3. Login Flow

**Objective:** Log in with verified email and password

**Prerequisites:**

- User account created and email verified

**Steps:**

1. Navigate to http://localhost:3000/login
2. Enter credentials:
   - Email: "testuser@example.com"
   - Password: "TestPassword123!"
3. Click "Sign In"

**Expected Results:**

- Session cookie set (COOKIE_NAME)
- Redirect to /dashboard
- User authenticated and dashboard loaded

**Test Cases:**

| Test Case | Input | Expected Result |
|-----------|-------|-----------------|
| Valid credentials | Correct email/password | Login successful, redirect to dashboard |
| Wrong password | Correct email, wrong password | Error: "Invalid email or password" |
| Non-existent email | Non-existent email | Error: "Invalid email or password" |
| Unverified email | Correct credentials, unverified | Error: "Please verify your email before logging in" |
| Empty fields | Leave blank | Error: "All fields are required" |

### 4. Forgot Password Flow

**Objective:** Request password reset

**Steps:**

1. Navigate to http://localhost:3000/forgot-password
2. Enter email: "testuser@example.com"
3. Click "Send Reset Link"

**Expected Results:**

- Success message: "Password reset link sent to your email."
- Reset token displayed (for testing purposes)
- User record updated with:
  - `passwordResetToken` set
  - `passwordResetExpires` set to 1 hour from now

**Test Cases:**

| Test Case | Input | Expected Result |
|-----------|-------|-----------------|
| Valid email | Existing email | Reset link sent, token shown |
| Non-existent email | Non-existent email | Generic message (no email leak) |
| Invalid email | "notanemail" | Error: "Invalid email address" |
| Empty email | Leave blank | Error: "Email is required" |

### 5. Reset Password Flow

**Objective:** Set new password using reset token

**Prerequisites:**

- Password reset requested and token obtained

**Steps:**

1. Navigate to http://localhost:3000/reset-password?token=XXX (use token from forgot password)
2. Enter new password:
   - New Password: "NewPassword456!"
   - Confirm Password: "NewPassword456!"
3. Click "Reset Password"

**Expected Results:**

- Success message: "Password reset successfully. You can now log in with your new password."
- User record updated with:
  - `passwordHash` updated (new password hashed)
  - `passwordResetToken = null`
  - `passwordResetExpires = null`
- Redirect to login page after 2 seconds

**Test Cases:**

| Test Case | Input | Expected Result |
|-----------|-------|-----------------|
| Valid token & password | Correct token, new password | Password reset, redirect to login |
| Invalid token | Random token | Error: "Invalid or expired reset token" |
| Expired token | Old token (>1h) | Error: "Reset token has expired" |
| Short password | "pass" | Error: "Password must be at least 8 characters" |
| Mismatched passwords | Different confirm | Error: "Passwords do not match" |
| No token in URL | Missing token param | Error: "No reset token found" |

### 6. Complete User Journey

**Objective:** Test entire flow from signup to authenticated dashboard

**Steps:**

1. **Sign Up:** Create new account with email "journey@example.com"
2. **Verify Email:** Use token to verify email
3. **Login:** Log in with email and password
4. **Dashboard:** Verify dashboard loads and user is authenticated
5. **Logout:** Click logout button
6. **Verify Redirect:** Verify redirected to home page
7. **Login Again:** Log in again with same credentials

**Expected Results:**

- All steps complete successfully
- User can log in multiple times
- Session persists across page reloads
- Logout clears session

## Test Data

### Valid Test Accounts

| Email | Password | Status |
|-------|----------|--------|
| test1@example.com | TestPass123! | Verified |
| test2@example.com | SecurePass456! | Verified |
| test3@example.com | MyPassword789! | Unverified |

### Invalid Test Data

| Email | Password | Reason |
|-------|----------|--------|
| notanemail | TestPass123! | Invalid email format |
| test@example.com | short | Password too short |
| test@example.com | TestPass123! | Mismatched confirm |

## Security Testing

### Password Security

- [ ] Passwords are hashed with PBKDF2 (100,000 iterations)
- [ ] Passwords are never logged or exposed
- [ ] Password verification fails with wrong password
- [ ] Password reset invalidates old password

### Token Security

- [ ] Verification tokens are 64-character hex strings
- [ ] Reset tokens are 64-character hex strings
- [ ] Tokens expire after specified time
- [ ] Expired tokens cannot be used
- [ ] Invalid tokens are rejected

### Email Security

- [ ] Email addresses are unique in database
- [ ] Email addresses are case-insensitive for login
- [ ] Non-existent emails don't reveal user existence
- [ ] Email verification required before login

### Session Security

- [ ] Session cookies are set with secure flags
- [ ] Session cookies expire appropriately
- [ ] Logout clears session cookie
- [ ] Authenticated users cannot access login/signup pages
- [ ] Unauthenticated users cannot access protected pages

## Performance Testing

- [ ] Signup completes in <2 seconds
- [ ] Login completes in <2 seconds
- [ ] Email verification completes in <1 second
- [ ] Password reset completes in <2 seconds
- [ ] No N+1 database queries

## Browser Compatibility

- [ ] Chrome/Chromium
- [ ] Firefox
- [ ] Safari
- [ ] Edge

## Accessibility Testing

- [ ] Form labels are properly associated
- [ ] Error messages are announced
- [ ] Keyboard navigation works
- [ ] Focus indicators visible
- [ ] Color contrast sufficient

## Checklist

- [ ] All test cases passed
- [ ] No console errors
- [ ] No database errors
- [ ] Email service integrated (if applicable)
- [ ] Rate limiting implemented
- [ ] Security audit passed
- [ ] Performance acceptable
- [ ] Accessibility verified
- [ ] Browser compatibility confirmed
- [ ] Ready for production deployment

## Next Steps

1. **Email Service Integration:** Connect to SendGrid, Mailgun, or similar
2. **Rate Limiting:** Implement rate limiting for signup/login attempts
3. **Admin Tools:** Create admin interface for user management
4. **Monitoring:** Set up logging and monitoring for auth events
5. **Documentation:** Create user-facing documentation
6. **Support:** Prepare support documentation for common issues

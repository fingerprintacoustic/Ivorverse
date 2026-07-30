# IvorVerse AI - Complete Authentication Implementation Guide

## Current State
- ✅ Manus OAuth working
- ❌ Email/password registration NOT implemented
- ❌ Password reset NOT implemented
- ❌ Email verification NOT implemented
- ❌ Public signup NOT available

## Implementation Plan

### Phase 1: Database Schema Updates

**Add to `drizzle/schema.ts`:**

```typescript
// Registration fields for email/password signup
passwordHash: varchar("passwordHash", { length: 255 }), // bcrypt hash
emailVerified: boolean("emailVerified").default(false).notNull(),
emailVerificationToken: varchar("emailVerificationToken", { length: 255 }),
emailVerificationExpires: timestamp("emailVerificationExpires"),
passwordResetToken: varchar("passwordResetToken", { length: 255 }),
passwordResetExpires: timestamp("passwordResetExpires"),
```

**Migration SQL:**
```sql
ALTER TABLE users ADD COLUMN passwordHash VARCHAR(255);
ALTER TABLE users ADD COLUMN emailVerified BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE users ADD COLUMN emailVerificationToken VARCHAR(255);
ALTER TABLE users ADD COLUMN emailVerificationExpires TIMESTAMP;
ALTER TABLE users ADD COLUMN passwordResetToken VARCHAR(255);
ALTER TABLE users ADD COLUMN passwordResetExpires TIMESTAMP;
```

### Phase 2: Backend Authentication Procedures

**Create `server/_core/auth.ts`:**
- Hash password with bcrypt
- Verify password
- Generate verification token
- Generate reset token
- Send verification email
- Send reset email

**Add to `server/routers.ts`:**
```typescript
auth: router({
  // Existing
  me: publicProcedure.query(opts => opts.ctx.user),
  logout: publicProcedure.mutation(({ ctx }) => {...}),
  
  // New
  signup: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Hash password
      // Create user
      // Send verification email
      // Return success
    }),
  
  verifyEmail: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      // Verify token
      // Mark email as verified
      // Return success
    }),
  
  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      // Generate reset token
      // Send reset email
      // Return success
    }),
  
  resetPassword: publicProcedure
    .input(z.object({
      token: z.string(),
      newPassword: z.string().min(8),
    }))
    .mutation(async ({ input }) => {
      // Verify token
      // Hash new password
      // Update user
      // Return success
    }),
}),
```

### Phase 3: Frontend Pages

**Create `client/src/pages/Signup.tsx`:**
- Email input
- Password input (with strength indicator)
- Name input (optional)
- Sign up button
- Link to login page

**Create `client/src/pages/Login.tsx`:**
- Email input
- Password input
- Login button
- "Forgot password?" link
- "Sign up" link

**Create `client/src/pages/ForgotPassword.tsx`:**
- Email input
- Submit button
- Message: "Check your email for reset link"

**Create `client/src/pages/ResetPassword.tsx`:**
- New password input
- Confirm password input
- Reset button
- Redirect to login on success

### Phase 4: Landing Page Updates

**Update `client/src/pages/Home.tsx`:**
```typescript
// Replace Sign In button with:
<div className="flex gap-2">
  <Button asChild variant="outline">
    <a href="/login">Sign In</a>
  </Button>
  <Button asChild>
    <a href="/signup">Sign Up</a>
  </Button>
</div>
```

### Phase 5: Routes

**Add to `client/src/App.tsx`:**
```typescript
<Route path="/login" component={Login} />
<Route path="/signup" component={Signup} />
<Route path="/forgot-password" component={ForgotPassword} />
<Route path="/reset-password" component={ResetPassword} />
```

## Testing Checklist

- [ ] Create new account with email/password
- [ ] Verify email verification email sent
- [ ] Click verification link
- [ ] Login with email/password
- [ ] Logout
- [ ] Request password reset
- [ ] Click reset link
- [ ] Reset password
- [ ] Login with new password
- [ ] Verify normal user cannot access admin pages
- [ ] Verify admin can manage users

## Security Considerations

1. **Password Hashing:** Use bcrypt with salt rounds ≥ 10
2. **Token Expiration:** Verification tokens expire in 24 hours, reset tokens in 1 hour
3. **Rate Limiting:** Limit signup/reset attempts to prevent abuse
4. **Email Verification:** Required before account is fully active
5. **HTTPS Only:** All auth endpoints require HTTPS
6. **Session Security:** Use secure, httpOnly cookies

## URLs After Implementation

- **Sign Up:** `/signup`
- **Login:** `/login`
- **Forgot Password:** `/forgot-password`
- **Reset Password:** `/reset-password?token=XXX`
- **Profile:** `/settings`
- **Admin:** `/admin` (admin only)

## Next Steps

1. Update database schema
2. Implement backend procedures
3. Create frontend pages
4. Add email service integration
5. Test complete flow
6. Deploy


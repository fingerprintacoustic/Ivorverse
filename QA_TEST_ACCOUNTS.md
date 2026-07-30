# QA Test Accounts

This document provides test credentials for QA testing of the IvorVerse AI authentication system.

## Test Account Credentials

### Verified Accounts (Can Login)

| Email | Password | Name | Status |
|-------|----------|------|--------|
| test1@example.com | TestPassword123! | Test User 1 | ✅ Verified |
| test2@example.com | SecurePass456! | Test User 2 | ✅ Verified |
| admin@example.com | AdminPass123! | Admin User | ✅ Verified |

### Unverified Account (Cannot Login)

| Email | Password | Name | Status |
|-------|----------|------|--------|
| test3@example.com | MyPassword789! | Test User 3 | ⏳ Unverified |

## Creating Test Accounts

To create these test accounts in your database, run:

```bash
npx tsx server/seedTestUsers.ts
```

This will:
1. Check if each test account already exists
2. Create accounts that don't exist
3. Verify email for accounts marked as verified
4. Print results to console

## Testing Scenarios

### 1. Successful Login
- Email: `test1@example.com`
- Password: `TestPassword123!`
- Expected: Login succeeds, redirects to dashboard

### 2. Unverified Email
- Email: `test3@example.com`
- Password: `MyPassword789!`
- Expected: Error message "Please verify your email before logging in"

### 3. Invalid Password
- Email: `test1@example.com`
- Password: `WrongPassword123!`
- Expected: Error message "Invalid email or password"

### 4. Non-existent Email
- Email: `nonexistent@example.com`
- Password: `AnyPassword123!`
- Expected: Error message "Invalid email or password"

### 5. Rate Limiting (Signup)
- Attempt to sign up 6 times with different emails within 1 hour
- Expected: 6th attempt blocked with "Too many signup attempts" error

### 6. Rate Limiting (Login)
- Attempt to log in with wrong password 11 times within 15 minutes
- Expected: 11th attempt blocked with "Too many login attempts" error

### 7. Password Reset
- Request password reset for `test1@example.com`
- Expected: Success message, verification token displayed (for testing)
- Use token to reset password
- Expected: Can log in with new password

### 8. Email Verification
- Sign up with new email
- Expected: Verification token displayed
- Use token to verify email
- Expected: Can now log in

## Manual Testing Checklist

- [ ] Test 1: Successful login with verified account
- [ ] Test 2: Login blocked for unverified account
- [ ] Test 3: Invalid password error
- [ ] Test 4: Non-existent email error
- [ ] Test 5: Signup rate limiting
- [ ] Test 6: Login rate limiting
- [ ] Test 7: Password reset flow
- [ ] Test 8: Email verification flow
- [ ] Test 9: Session persistence (page reload)
- [ ] Test 10: Logout clears session

## Database Verification

To verify test accounts in the database:

```sql
SELECT id, email, name, emailVerified, loginMethod FROM user WHERE email LIKE 'test%@example.com' OR email = 'admin@example.com';
```

Expected output:
```
id | email                | name           | emailVerified | loginMethod
---|----------------------|----------------|---------------|----------
1  | test1@example.com    | Test User 1    | 1             | email
2  | test2@example.com    | Test User 2    | 1             | email
3  | test3@example.com    | Test User 3    | 0             | email
4  | admin@example.com    | Admin User     | 1             | email
```

## Notes

- Test accounts use simple, memorable passwords for ease of testing
- Passwords follow the 8+ character requirement
- Emails use `example.com` domain (not a real domain)
- All test accounts can be safely deleted and recreated
- Do not use test credentials in production
- Rate limiting is per-email, so test accounts can be used repeatedly after limits reset

## Troubleshooting

### "User already exists" error
- Delete the existing test user from the database
- Re-run the seed script

### "Invalid email or password" when logging in
- Verify the account is in the database with correct email
- Check that emailVerified = 1 for verified accounts
- Verify the password hash matches using the auth functions

### Rate limiting not working
- Check that rate limiter is imported in routers.ts
- Verify rate limit keys are being generated correctly
- Check browser console for errors

## Support

For issues with test accounts or testing procedures, see:
- `AUTHENTICATION_TESTING_GUIDE.md` - Comprehensive testing guide
- `server/seedTestUsers.ts` - Seed script source code
- `server/_core/auth.ts` - Authentication utilities

# CAPTCHA Integration Guide (Optional Enhancement)

This guide provides instructions for adding CAPTCHA protection to the signup form to prevent automated abuse.

## Why Add CAPTCHA?

While the authentication system includes rate limiting, CAPTCHA provides additional protection against:
- Automated bot attacks
- Credential stuffing
- Brute force registration attempts

## Recommended CAPTCHA Solutions

### 1. **reCAPTCHA v3** (Recommended for signup)
- **Provider:** Google
- **Type:** Invisible, risk-based
- **Pros:** User-friendly, no interaction required, risk scoring
- **Cons:** Requires Google account, data privacy considerations
- **Cost:** Free
- **Setup Time:** ~30 minutes

### 2. **hCaptcha**
- **Provider:** hCaptcha
- **Type:** Challenge-based or invisible
- **Pros:** Privacy-focused, GDPR compliant, free tier available
- **Cons:** May require user interaction
- **Cost:** Free tier available
- **Setup Time:** ~30 minutes

### 3. **Cloudflare Turnstile**
- **Provider:** Cloudflare
- **Type:** Invisible or challenge-based
- **Pros:** Fast, reliable, free tier
- **Cons:** Requires Cloudflare account
- **Cost:** Free tier available
- **Setup Time:** ~30 minutes

## Implementation Steps (reCAPTCHA v3)

### Step 1: Get reCAPTCHA Keys

1. Go to [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
2. Click "Create" to add a new site
3. Fill in the form:
   - **Label:** OmniCreator AI Signup
   - **reCAPTCHA type:** reCAPTCHA v3
   - **Domains:** Your domains (e.g., ivorverse.ai, ivorverse-ai.web.app, localhost)
4. Accept terms and submit
5. Copy the **Site Key** and **Secret Key**

### Step 2: Add Environment Variables

Store the keys in your project secrets:

```bash
VITE_RECAPTCHA_SITE_KEY=<your-site-key>
RECAPTCHA_SECRET_KEY=<your-secret-key>
```

### Step 3: Update Frontend (Signup.tsx)

```tsx
import { useEffect } from 'react';

export function Signup() {
  useEffect(() => {
    // Load reCAPTCHA script
    const script = document.createElement('script');
    script.src = 'https://www.google.com/recaptcha/api.js';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, []);

  const handleSignup = async (email: string, password: string) => {
    // Get reCAPTCHA token
    const token = await (window as any).grecaptcha.executeAsync(
      import.meta.env.VITE_RECAPTCHA_SITE_KEY,
      { action: 'signup' }
    );

    // Send token with signup request
    const result = await trpc.auth.signup.useMutation({
      email,
      password,
      recaptchaToken: token,
    });
  };

  return (
    // Your signup form JSX
  );
}
```

### Step 4: Update Backend (routers.ts)

```ts
import axios from 'axios';

// Add recaptchaToken to signup input
signup: publicProcedure
  .input(
    z.object({
      email: z.string().email(),
      password: z.string().min(8),
      recaptchaToken: z.string(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    // Verify reCAPTCHA token
    const recaptchaResponse = await axios.post(
      'https://www.google.com/recaptcha/api/siteverify',
      null,
      {
        params: {
          secret: process.env.RECAPTCHA_SECRET_KEY,
          response: input.recaptchaToken,
        },
      }
    );

    // Check score (0.0 = bot, 1.0 = human)
    if (recaptchaResponse.data.score < 0.5) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Signup verification failed. Please try again.',
      });
    }

    // Continue with signup logic...
  }),
```

### Step 5: Test

1. Visit the signup page
2. Submit the form
3. Check browser console for reCAPTCHA token
4. Verify backend receives and validates token

## Alternative: hCaptcha Implementation

### Frontend

```tsx
import HCaptcha from '@hcaptcha/react-hcaptcha';

export function Signup() {
  const captchaRef = useRef<HCaptcha>(null);

  const handleSignup = async () => {
    const token = captchaRef.current?.getResponse();
    
    await trpc.auth.signup.useMutation({
      email,
      password,
      captchaToken: token,
    });
  };

  return (
    <>
      <HCaptcha
        ref={captchaRef}
        sitekey={import.meta.env.VITE_HCAPTCHA_SITE_KEY}
      />
      <button onClick={handleSignup}>Sign Up</button>
    </>
  );
}
```

### Backend

```ts
import axios from 'axios';

signup: publicProcedure
  .input(
    z.object({
      email: z.string().email(),
      password: z.string().min(8),
      captchaToken: z.string(),
    })
  )
  .mutation(async ({ input }) => {
    // Verify hCaptcha token
    const response = await axios.post(
      'https://hcaptcha.com/siteverify',
      {
        secret: process.env.HCAPTCHA_SECRET_KEY,
        response: input.captchaToken,
      }
    );

    if (!response.data.success) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'CAPTCHA verification failed',
      });
    }

    // Continue with signup logic...
  }),
```

## Installation Commands

### For reCAPTCHA v3 (no package needed, use API directly)
```bash
# No installation needed, use Google API directly
```

### For hCaptcha
```bash
pnpm add @hcaptcha/react-hcaptcha
```

### For Cloudflare Turnstile
```bash
pnpm add @turnstile/vue @turnstile/react
```

## Testing CAPTCHA

### Local Testing
- reCAPTCHA v3: Use localhost in admin console
- hCaptcha: Add localhost to allowed domains
- Turnstile: Use test keys provided by Cloudflare

### Test Keys (hCaptcha)
```
Site Key: 10000000-ffff-ffff-ffff-000000000001
Secret Key: 0x0000000000000000000000000000000000000000
```

## Security Considerations

1. **Never expose secret keys** in frontend code
2. **Always verify tokens** on the backend
3. **Set appropriate thresholds** (reCAPTCHA score, timeout)
4. **Monitor abuse patterns** and adjust settings
5. **Combine with rate limiting** for defense in depth

## Performance Impact

- **reCAPTCHA v3:** <100ms, invisible to user
- **hCaptcha:** 1-3s if challenge required
- **Turnstile:** <500ms, minimal impact

## Compliance

- **GDPR:** hCaptcha and Turnstile are more privacy-friendly
- **CCPA:** Ensure privacy policy mentions CAPTCHA usage
- **Accessibility:** All CAPTCHA solutions offer accessibility options

## Troubleshooting

### "Invalid site key" error
- Verify site key is correct
- Check domain is added to reCAPTCHA console
- Clear browser cache

### "Token expired" error
- Tokens expire after 2 minutes
- Verify token immediately after generation
- Implement retry logic

### High false positive rate
- Lower reCAPTCHA v3 score threshold
- Adjust hCaptcha difficulty settings
- Review user behavior patterns

## Next Steps

1. Choose CAPTCHA provider based on your needs
2. Get API keys from provider
3. Add environment variables
4. Implement frontend integration
5. Implement backend verification
6. Test thoroughly
7. Monitor and adjust settings based on abuse patterns

## Resources

- [reCAPTCHA Documentation](https://developers.google.com/recaptcha/docs/v3)
- [hCaptcha Documentation](https://docs.hcaptcha.com/)
- [Cloudflare Turnstile Documentation](https://developers.cloudflare.com/turnstile/)

## Decision Matrix

| Feature | reCAPTCHA v3 | hCaptcha | Turnstile |
|---------|-------------|----------|-----------|
| Cost | Free | Free | Free |
| Privacy | Moderate | High | High |
| User Experience | Excellent | Good | Excellent |
| Setup Time | 30 min | 30 min | 30 min |
| Accuracy | Very High | High | Very High |
| GDPR Friendly | No | Yes | Yes |

**Recommendation:** Start with reCAPTCHA v3 for best UX, or hCaptcha if privacy is critical.

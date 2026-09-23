# IvorVerse AI - Setup & Deployment Guide

## Overview

IvorVerse AI is a comprehensive AI-powered creative and productivity platform built with React, Express, tRPC, and PostgreSQL. It combines 10 powerful features into a unified dashboard. **One AI. Unlimited Creation.**

## Project Structure

```
ivorverse-ai/
├── client/                 # React frontend
│   ├── src/
│   │   ├── pages/         # Feature pages (Dashboard, Chat, etc.)
│   │   ├── components/    # Reusable UI components
│   │   ├── contexts/      # React contexts
│   │   ├── lib/           # Utilities and tRPC client
│   │   └── App.tsx        # Main router
│   └── index.html
├── server/                # Express backend
│   ├── routers.ts         # tRPC procedures
│   ├── db.ts              # Database queries
│   ├── storage.ts         # S3 storage helpers
│   └── _core/             # Core infrastructure
├── drizzle/               # Database schema & migrations
├── shared/                # Shared types and constants
└── package.json
```

## Features Implemented

### Core Infrastructure ✅
- **Database**: PostgreSQL with 13 tables (users, projects, chat, music, video, images, characters, subscriptions, etc.)
- **Authentication**: Email/password with email verification and password reset (no OAuth)
- **API**: tRPC with 50+ procedures for all features
- **Storage**: S3-compatible file storage
- **LLM Integration**: OpenAI-compatible API for AI responses

### Frontend Pages ✅
- **Landing Page** (`/`): Beautiful marketing site with pricing and features
- **Dashboard** (`/dashboard`): Central hub showing all projects and quick access to features
- **Chat Feature** (`/feature/chat`): AI Chat interface with file upload support

### Backend Procedures ✅
- **Projects**: CRUD operations for all project types
- **Chat**: Message handling, file uploads, report generation
- **Research**: Web search, report generation with citations
- **Music**: Lyrics, structure, and production prompt generation
- **Image**: Image, logo, thumbnail, and graphic generation
- **Voice**: Audio transcription and speech generation
- **Characters**: Character CRUD and management
- **Subscriptions**: Tier management and tracking
- **Admin**: User management, usage stats, audit logging

## Database Schema

### Core Tables
- `users` - User accounts with subscription info
- `projects` - All user projects (chat, research, music, video, etc.)
- `chatMessages` - Chat conversation history
- `characters` - Reusable character profiles
- `files` - Uploaded and generated files
- `subscriptions` - Subscription tier tracking
- `usage` - Monthly usage tracking per feature
- `researchReports` - Generated research reports
- `musicProjects` - Music generation data
- `videoProjects` - Video generation data
- `appProjects` - App builder projects
- `teamMembers` - Team collaboration (Business tier)
- `auditLogs` - Admin action logging

## Environment Variables

Copy `.env.example` to `.env` and fill it in. That file is the full, commented list:

```
JWT_SECRET                      # Session cookie signing key
APP_URL                         # Public app URL (email links, Stripe redirects)
FIREBASE_SERVICE_ACCOUNT_JSON   # Firestore credentials (optional locally with ADC or emulators)
FIREBASE_STORAGE_BUCKET         # Firebase Storage bucket
ANTHROPIC_API_KEY               # AI provider
OPENAI_API_KEY                  # AI provider
E2B_API_KEY                     # App Builder sandbox / video rendering
FAL_KEY                         # Music generation
STRIPE_SECRET_KEY               # Billing
STRIPE_WEBHOOK_SECRET           # Billing webhooks
PLATFORM_FEE_PERCENT            # Marketplace fee (default 0)
RESEND_API_KEY                  # Email sending
EMAIL_FROM                      # Email sender
OWNER_EMAIL                     # Owner notifications
VITE_ANALYTICS_ENDPOINT         # Analytics endpoint (optional)
VITE_ANALYTICS_WEBSITE_ID       # Analytics website ID (optional)
```

Login is email/password only, so the old Manus OAuth variables (`VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, `OWNER_OPEN_ID`) and Manus Forge variables are no longer used.

## Development

### Install Dependencies
```bash
pnpm install
```

### Run Development Server
```bash
pnpm run dev
```

The dev server will start at `http://localhost:3000`

### Database Migrations
```bash
# Generate migration from schema changes
pnpm drizzle-kit generate

# Apply migrations
pnpm drizzle-kit migrate
```

### Build for Production
```bash
pnpm run build
```

### Run Tests
```bash
pnpm test
```

## Subscription Tiers

### Free
- 10 chat messages/day
- 5 research queries/day
- 2 image generations/day
- 10MB file uploads
- No music/video generation

### Pro ($29/month)
- Unlimited chat messages
- Unlimited research queries
- 50 image generations/day
- 100MB file uploads
- 5 music/video generations/day
- 5 character memory slots

### Business ($99/month)
- All Pro features
- Team collaboration (5 users)
- Shared workspaces
- 20 music/video generations/day
- Unlimited characters
- Priority support

## API Endpoints

All API calls go through `/api/trpc`. Example:

```typescript
// Frontend
const { data } = await trpc.projects.list.useQuery();
const result = await trpc.chat.sendMessage.useMutation({
  projectId: 1,
  message: "Hello Ivor"
});

// Backend procedure
projects: router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return await db.getUserProjects(ctx.user.id);
  }),
})
```

## Deployment

### Via Firebase
```bash
npm run deploy
```
Builds the client and the Cloud Function, then runs `firebase deploy` (Hosting + Functions, see `firebase.json`).

### Via Docker (Self-hosted)
```bash
# Build Docker image
docker build -t ivorverse-ai .

# Run container
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="..." \
  ivorverse-ai
```

## Key Features to Implement Next

### Phase 3-4: Feature Pages
- [ ] Research feature page with web search UI
- [ ] App Builder with code generation preview
- [ ] Music Studio with lyrics/structure editor
- [ ] Image Studio with generation gallery
- [ ] Voice Studio with transcription interface
- [ ] Music Video Generator workflow
- [ ] Character Memory gallery

### Phase 5: Admin Dashboard
- [ ] User management interface
- [ ] Usage analytics and charts
- [ ] Revenue tracking
- [ ] Subscription management

### Phase 6: Payments
- [ ] Stripe integration for subscriptions
- [ ] Billing portal
- [ ] Invoice generation

## Testing

### Unit Tests
```bash
# Run all tests
pnpm test

# Watch mode
pnpm test --watch
```

### Example Test (server/auth.logout.test.ts)
```typescript
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    // Test implementation
  });
});
```

## Performance Optimization

- **Code Splitting**: Feature pages lazy-loaded
- **Database Indexing**: Indexes on userId, projectId, createdAt
- **Caching**: User subscription data cached in session
- **Image Optimization**: Generated images stored in S3
- **API Streaming**: Long-running operations use streaming responses

## Security

- **Authentication**: Email/password with a signed JWT session cookie (`server/_core/session.ts`)
- **Authorization**: Role-based access control (user/admin)
- **Rate Limiting**: Per-user rate limits based on subscription tier
- **SQL Injection**: Drizzle ORM prevents SQL injection
- **XSS Protection**: React's built-in escaping
- **CORS**: Configured for frontend domain only

## Monitoring & Logging

Server logs go to stdout (the terminal locally, Cloud Logging for the deployed function). Client-side errors show in the browser console.

## Support & Documentation

- **Architecture**: See `ARCHITECTURE.md`
- **Database Schema**: See `drizzle/schema.ts`
- **API Procedures**: See `server/routers.ts`
- **Frontend Components**: See `client/src/components/`

## Troubleshooting

### Dev Server Not Starting
```bash
# Clear cache and restart
rm -rf .next node_modules/.vite
pnpm install
pnpm run dev
```

### Database Connection Issues
```bash
# Check DATABASE_URL is set
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

### Build Errors
```bash
# Clear build cache
rm -rf dist .vite

# Rebuild
pnpm run build
```

## Next Steps

1. **Stripe Integration**: Set up payment processing for subscriptions
2. **Feature Pages**: Build UI for all 10 features
3. **Admin Dashboard**: Create admin panel for user management
4. **Testing**: Write comprehensive vitest tests
5. **Performance**: Optimize database queries and add caching
6. **Monitoring**: Set up error tracking and analytics
7. **Documentation**: Create user guides and API documentation

## License

Proprietary - IvorVerse Technologies

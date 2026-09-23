# IvorVerse AI - Setup & Deployment Guide

## Overview

IvorVerse AI is a comprehensive AI-powered creative and productivity platform built with React, Express, tRPC, and Firebase (Firestore, Storage, Hosting and Cloud Functions). It combines 10 powerful features into a unified dashboard. **One AI. Unlimited Creation.**

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
│   ├── db.ts              # Firestore data access
│   ├── storage.ts         # Firebase Storage helpers
│   └── _core/             # Core infrastructure
├── functions/             # Cloud Functions entry (API + job worker)
├── shared/                # Shared types and constants
├── firebase.json          # Hosting, Functions, Firestore and emulator config
├── firestore.rules        # Denies direct client access (all access goes through the API)
├── firestore.indexes.json # Composite indexes
└── package.json
```

## Features Implemented

### Core Infrastructure ✅
- **Database**: Firestore (users, projects, chat, music, video, characters, subscriptions, etc.)
- **Authentication**: Email/password with email verification and password reset (no OAuth)
- **API**: tRPC with 50+ procedures for all features
- **Storage**: Firebase Storage
- **LLM Integration**: Claude (Anthropic API) for the chat assistant; OpenAI for general completions, images and transcription

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

## Data Model

Data lives in Firestore collections, accessed only through `server/db.ts`. Documents keep numeric ids (a `_counters` collection hands them out), so the rest of the code works with `number` ids.

### Main Collections
- `users` - User accounts with subscription info
- `projects` - All user projects (chat, research, music, video, etc.)
- `chatMessages` - Chat conversation history
- `projectMemory` - Per-project memory for the chat assistant
- `characters` - Reusable character profiles
- `files` - Uploaded and generated files (bytes live in Firebase Storage)
- `subscriptions` - Subscription tier tracking
- `usage` - Monthly usage tracking per feature
- `researchReports` - Generated research reports
- `musicProjects`, `videoProjects`, `appProjects` - Feature data
- `agents`, `agentTasks`, `workflows`, `workflowRuns` - Agents and workflows
- `products`, `sales` - Marketplace
- `jobs` - Background jobs (picked up by the `jobWorker` Cloud Function)
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
npm install
```

### Run Development Server
```bash
npm run dev
```

The dev server will start at `http://localhost:3000`. It needs Firestore credentials: run `gcloud auth application-default login`, set `FIREBASE_SERVICE_ACCOUNT_JSON`, or use the emulators.

### Firebase Emulators
```bash
npm run emulators
```

Firestore has no migrations. Collections are created on first write; add composite indexes to `firestore.indexes.json`.

### Build for Production
```bash
npm run build
```

### Run Tests
```bash
npm test
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

### As a Node server (self-hosted)
```bash
npm run build
npm start
```
Serves the API and the built client from one process on `PORT` (default 3000). It still uses Firestore and Firebase Storage, so set `FIREBASE_SERVICE_ACCOUNT_JSON` and the other variables from `.env.example`. Without the `jobWorker` Cloud Function, background jobs run in the same process.

## Testing

### Unit Tests
```bash
# Run all tests
npm test

# Watch mode
npx vitest
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
- **Image Optimization**: Generated images stored in Firebase Storage
- **API Streaming**: Long-running operations use streaming responses

## Security

- **Authentication**: Email/password with a signed JWT session cookie (`server/_core/session.ts`)
- **Authorization**: Role-based access control (user/admin)
- **Rate Limiting**: Per-user rate limits based on subscription tier
- **Database Access**: Firestore rules deny all client access; only the server (Admin SDK) reads and writes
- **XSS Protection**: React's built-in escaping
- **CORS**: Configured for frontend domain only

## Monitoring & Logging

Server logs go to stdout (the terminal locally, Cloud Logging for the deployed function). Client-side errors show in the browser console.

## Support & Documentation

- **Architecture**: See `ARCHITECTURE.md`
- **Data Model**: See `server/db.ts`
- **API Procedures**: See `server/routers.ts`
- **Frontend Components**: See `client/src/components/`

## Troubleshooting

### Dev Server Not Starting
```bash
# Clear cache and restart
rm -rf node_modules/.vite
npm install
npm run dev
```

### Firestore Connection Issues
"Unable to detect a Project Id" means no Firebase credentials were found. Run `gcloud auth application-default login`, set `FIREBASE_SERVICE_ACCOUNT_JSON` in `.env`, or run against the emulators (`npm run emulators`).

### Build Errors
```bash
# Clear build cache
rm -rf dist .vite

# Rebuild
npm run build
```

## License

Proprietary - IvorVerse Technologies

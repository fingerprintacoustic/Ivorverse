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
- **Authentication**: Manus OAuth 2.0 integration
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

The following environment variables are automatically injected:

```
DATABASE_URL                    # PostgreSQL connection string
JWT_SECRET                      # Session cookie signing key
VITE_APP_ID                     # Manus OAuth application ID
OAUTH_SERVER_URL                # Manus OAuth backend URL
VITE_OAUTH_PORTAL_URL           # Manus login portal URL
OWNER_OPEN_ID                   # Owner's Manus OpenID
OWNER_NAME                      # Owner's name
BUILT_IN_FORGE_API_URL          # Manus API base URL
BUILT_IN_FORGE_API_KEY          # Manus API key (server-side)
VITE_FRONTEND_FORGE_API_KEY     # Manus API key (frontend)
VITE_FRONTEND_FORGE_API_URL     # Manus API URL (frontend)
VITE_ANALYTICS_ENDPOINT         # Analytics endpoint
VITE_ANALYTICS_WEBSITE_ID       # Analytics website ID
```

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

### Via Manus Platform
1. Click "Publish" button in the Management UI
2. Select custom domain or use auto-generated `xxx.manus.space` domain
3. Platform handles SSL, scaling, and monitoring

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

- **Authentication**: Manus OAuth with session cookies
- **Authorization**: Role-based access control (user/admin)
- **Rate Limiting**: Per-user rate limits based on subscription tier
- **SQL Injection**: Drizzle ORM prevents SQL injection
- **XSS Protection**: React's built-in escaping
- **CORS**: Configured for frontend domain only

## Monitoring & Logging

Logs are stored in `.manus-logs/`:
- `devserver.log` - Server startup and errors
- `browserConsole.log` - Client-side console output
- `networkRequests.log` - HTTP requests and responses
- `sessionReplay.log` - User interactions

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

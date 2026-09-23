# IvorVerse AI - Architecture & Design

## Overview

IvorVerse AI is a unified SaaS platform combining AI-powered creative and productivity tools. The platform is built on a modern stack with React frontend, Express/tRPC backend, Firestore database, and integrated AI services, deployed on Firebase.

## Technology Stack

**Frontend:**
- React 19 with TypeScript
- Tailwind CSS 4 for styling
- shadcn/ui components for consistency
- Wouter for routing
- tRPC client for type-safe API calls

**Backend:**
- Express 4 with TypeScript
- tRPC 11 for RPC procedures
- Firebase Admin SDK for Firestore and Storage access (`server/db.ts`, `server/storage.ts`)
- Claude via the Anthropic API for the chat assistant, including web search
- OpenAI for general completions, image generation (gpt-image-1) and transcription (Whisper)
- fal.ai (ACE-Step) for music, E2B sandboxes for App Builder and video rendering
- Resend for email

**Database:**
- Firestore; no migrations, composite indexes in `firestore.indexes.json`

**Authentication:**
- Email/password with email verification and password reset
- Signed JWT session cookie (`server/_core/session.ts`)

**Hosting:**
- Firebase Hosting for the client; the `api` Cloud Function serves `/api/**`
- `jobWorker` Cloud Function for long-running background jobs

**Payments:**
- Stripe integration for subscription management

**Storage:**
- Firebase Storage for files, images, videos

## Data Model

Firestore collections with numeric document ids. The main ones:

**users**
- id (PK)
- email (login identifier)
- passwordHash
- name
- role (user | admin)
- subscriptionTier (free | pro | business)
- createdAt
- updatedAt
- lastSignedIn

**projects**
- id (PK)
- userId (FK)
- name
- type (chat | research | app | music | image | voice | video | character)
- content (JSON)
- createdAt
- updatedAt

**characters**
- id (PK)
- userId (FK)
- name
- description
- faceImageUrl
- voiceUrl
- personality (JSON)
- createdAt
- updatedAt

**files**
- id (PK)
- userId (FK)
- projectId (FK, nullable)
- filename
- fileKey (Firebase Storage key)
- url
- mimeType
- size
- createdAt

**subscriptions**
- id (PK)
- userId (FK)
- tier (free | pro | business)
- stripeCustomerId
- stripeSubscriptionId
- status (active | canceled | expired)
- currentPeriodStart
- currentPeriodEnd
- createdAt
- updatedAt

**usage**
- id (PK)
- userId (FK)
- feature (chat | research | app | music | image | voice | video)
- count
- month
- year

## API Structure (tRPC Procedures)

### Authentication
- `auth.me` - Get current user
- `auth.logout` - Logout current user

### Projects
- `projects.list` - List user's projects
- `projects.create` - Create new project
- `projects.get` - Get project details
- `projects.update` - Update project
- `projects.delete` - Delete project

### Chat
- `chat.sendMessage` - Send chat message with streaming
- `chat.uploadFile` - Upload file for chat
- `chat.generateReport` - Generate report from chat
- `chat.generatePlan` - Generate business/marketing plan

### Research
- `research.search` - Search the web
- `research.generateReport` - Generate research report with citations
- `research.summarizeSource` - Summarize a specific source

### App Builder
- `appBuilder.generateRequirements` - Generate project requirements
- `appBuilder.generateDesign` - Generate UI design
- `appBuilder.generateSchema` - Generate database schema
- `appBuilder.generateAPI` - Generate API structure
- `appBuilder.generateCode` - Generate source code

### Music Studio
- `music.generateLyrics` - Generate song lyrics
- `music.generateStructure` - Generate song structure
- `music.generateProductionPrompt` - Generate production prompt

### Image Studio
- `image.generate` - Generate image from prompt
- `image.generateLogo` - Generate logo
- `image.generateThumbnail` - Generate thumbnail
- `image.generateGraphic` - Generate social media graphic

### Voice Studio
- `voice.transcribe` - Transcribe uploaded audio
- `voice.generateSpeech` - Generate speech from text
- `voice.cloneVoice` - Clone voice from sample (if available)

### Music Video
- `musicVideo.generate` - Generate complete music video
- `musicVideo.getProgress` - Get generation progress
- `musicVideo.cancel` - Cancel generation

### Characters
- `characters.list` - List user's characters
- `characters.create` - Create new character
- `characters.get` - Get character details
- `characters.update` - Update character
- `characters.delete` - Delete character

### Admin
- `admin.listUsers` - List all users (admin only)
- `admin.getUserDetails` - Get user details (admin only)
- `admin.disableUser` - Disable user account (admin only)
- `admin.getUsageStats` - Get usage statistics (admin only)
- `admin.getRevenueStats` - Get revenue statistics (admin only)

## Visual Design Direction

### Color Palette
- **Primary**: Modern gradient from deep purple to vibrant blue
- **Accent**: Bright cyan for interactive elements
- **Background**: Dark theme with subtle gradients (charcoal to deep navy)
- **Text**: Light gray for primary text, white for emphasis
- **Success/Error**: Standard green and red with custom tones

### Typography
- **Headings**: Bold, modern sans-serif (system font stack)
- **Body**: Clean, readable sans-serif with generous line height
- **Code**: Monospace with syntax highlighting

### Components
- **Cards**: Subtle shadows, rounded corners (8-12px), semi-transparent backgrounds
- **Buttons**: Gradient fills, smooth transitions, active states with scale
- **Inputs**: Minimal borders, focus states with glow effects
- **Modals**: Backdrop blur, smooth entrance animations
- **Navigation**: Sidebar for main nav, top bar for secondary actions

### Layout
- **Dashboard**: Sidebar navigation (collapsible), main content area with grid layout
- **Feature Pages**: Full-width with centered content containers
- **Chat Interface**: Split layout (sidebar for history, main for conversation)
- **Responsive**: Mobile-first, breakpoints at 640px, 1024px, 1280px

## Feature Implementation Strategy

### MVP Priority (Phase 1-3)
1. User authentication and dashboard
2. AI Chat Assistant (core feature)
3. Basic project management

### Phase 2 (Phase 4-6)
4. Deep Research Tool
5. Music and Image Studios
6. Voice Studio

### Phase 3 (Phase 7-9)
7. AI App Builder
8. Music Video Generator
9. Character Memory System
10. Admin Dashboard

### Phase 4 (Phase 10)
11. Subscription management
12. Rate limiting and quotas
13. Performance optimization

## Subscription Tiers

**Free**
- 10 chat messages/day
- 5 research queries/day
- 2 image generations/day
- Limited file upload (10MB)
- No music/video generation

**Pro**
- Unlimited chat messages
- Unlimited research queries
- 50 image generations/day
- 100MB file upload
- 5 music/video generations/day
- Character memory (5 characters)

**Business**
- All Pro features
- Team collaboration (5 users)
- Shared workspaces
- 20 music/video generations/day
- Unlimited characters
- Priority support

## Security Considerations

- All API calls require authentication (except public landing page)
- Rate limiting per user and subscription tier
- File uploads scanned for malware
- API keys stored in environment variables
- CORS configured for frontend domain only
- Firestore rules deny all direct client access; only the server reads and writes
- XSS protection via React's built-in escaping

## Performance Optimization

- Lazy loading for feature pages
- Image optimization and CDN delivery
- Database query optimization with indexes
- Caching for frequently accessed data
- Streaming responses for long-running operations
- Code splitting for faster initial load

## Monitoring & Analytics

- Error tracking and logging
- User activity tracking
- Feature usage analytics
- Performance metrics
- Subscription churn monitoring
- Revenue tracking

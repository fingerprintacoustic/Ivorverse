# IvorVerse AI

A React 19 + Tailwind 4 + Express 4 + tRPC 11 app backed by Firestore and Firebase Storage, with email/password authentication. It deploys to Firebase: Hosting serves the client and a Cloud Function serves the API. Procedures are your contracts, and types flow end to end.

---

## Quick Facts

- **tRPC-first:** define procedures in `server/routers.ts`, consume them with `trpc.*` hooks.
- **Superjson out of the box:** `Date` values survive the round trip as `Date`.
- **Auth baked in:** email/password login via `trpc.auth.*` sets a session cookie, `protectedProcedure` injects `ctx.user`.
- **One API prefix:** all RPC traffic is under `/api/trpc`, and Firebase Hosting rewrites `/api/**` to the `api` Cloud Function.

---

## Getting Started

```bash
npm install
cp .env.example .env   # then fill it in, see Environment Variables
npm run dev            # Express + Vite dev server on http://localhost:3000
```

Firestore needs credentials: run `gcloud auth application-default login`, set `FIREBASE_SERVICE_ACCOUNT_JSON`, or start the emulators with `npm run emulators`.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Builds the client to `dist/public` and the Node server to `dist/index.js` |
| `npm run build:functions` | Bundles the Cloud Functions entry (`functions/index.ts`) |
| `npm run check` | Type-checks with `tsc` |
| `npm test` | Runs the Vitest suite |
| `npm run emulators` | Starts the Firebase emulators |
| `npm run deploy` | Builds everything and runs `firebase deploy` |

---

## Build Loop

1. Add or extend data access helpers in `server/db.ts` (Firestore). If a new query filters or sorts on several fields, add its composite index to `firestore.indexes.json`.
2. Add or extend procedures in `server/routers.ts`, then wire the UI with `trpc.*.useQuery/useMutation`.
3. Build the frontend following `Frontend Workflow`.
4. Cover your changes with Vitest specs in `server/*.test.ts` (see `server/auth.logout.test.ts`) and run `npm test`.

No manual REST routes, no Axios client, no shared contract files.

---

## Key Files

```
server/db.ts → Firestore data access (entity types + query helpers)
server/routers.ts → tRPC procedures (auth + features)
server/storage.ts → Firebase Storage helpers
server/_core/ → Sessions, context, jobs, AI helpers, Vite bridge
functions/index.ts → Cloud Functions entry (api + background job worker)
client/src/App.tsx → Routes wiring & layout shells
client/src/lib/trpc.ts → tRPC client binding
client/src/pages/ → Feature UI that calls trpc hooks
firebase.json, firestore.rules, firestore.indexes.json → Firebase config
```

---

## File Structure

```
client/
  public/         ← Small configuration files ONLY (favicon.ico, robots.txt). DO NOT put images/media here.
  src/
    pages/        ← Page-level components
    components/   ← Reusable UI & shadcn/ui
    contexts/     ← React contexts
    hooks/        ← Custom hooks
    lib/trpc.ts   ← tRPC client
    App.tsx       ← Routes & layout
    main.tsx      ← Providers
    index.css     ← global style
server/
  db.ts           ← Firestore data access
  routers.ts      ← tRPC procedures
  storage.ts      ← Firebase Storage helpers
  _core/          ← Framework plumbing and AI/job helpers
functions/        ← Cloud Functions entry
shared/           ← Shared constants & types
```

### ⚠️ Handling Images & Media

**DO NOT** store images, videos, or large assets in `client/public/` or `client/src/assets/`. Local media files bloat the Hosting deploy.

Put them in Firebase Storage instead: from server code use `storagePut()` (see File Storage), or upload static assets to the bucket with the Firebase console or `gcloud storage cp` and reference their URLs.

Only small configuration files like `favicon.ico`, `robots.txt`, and `manifest.json` belong in `client/public/`. Files there are served from the site root, so reference them with absolute paths (`/robots.txt`, etc.).

---

## Authentication Flow

- Login is email/password only (there is no OAuth). Users sign up at `/signup`, verify their email via the link sent to `/verify-email`, then sign in at `/login`; `/forgot-password` and `/reset-password` handle resets. The pages call `trpc.auth.signup`, `login`, `verifyEmail`, `requestPasswordReset` and `resetPassword`.
- A successful login sets the `app_session_id` cookie, a JWT signed with `JWT_SECRET` and keyed by user id (`server/_core/session.ts`).
- To send someone to sign in, use `getLoginUrl()` from `client/src/const.ts`; it returns `/login`, adding `?next=<current path>` so they come back afterwards.
- Each request to `/api/trpc` builds context via `server/_core/context.ts`, making the current user available as `ctx.user`.
- Wrap protected logic in `protectedProcedure`; public access uses `publicProcedure`.
- Frontend reads auth state with `trpc.auth.me.useQuery()` and invokes `trpc.auth.logout.useMutation()`—no cookie plumbing required.

---

## Environment Variables

Copy `.env.example` to `.env` and fill it in; that file is the full, commented list. The main ones:
- `JWT_SECRET`: Session cookie signing secret
- `APP_URL`: Public URL of the app, used in verification/reset emails and Stripe redirects
- `FIREBASE_SERVICE_ACCOUNT_JSON`: Service account for Firestore (optional locally if you use `gcloud auth application-default login` or the emulators)
- `FIREBASE_STORAGE_BUCKET`: Firebase Storage bucket for generated images and uploads
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`: AI providers
- `E2B_API_KEY`, `FAL_KEY`: App Builder sandbox and music generation
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PLATFORM_FEE_PERCENT`: Billing and marketplace
- `RESEND_API_KEY`, `EMAIL_FROM`, `OWNER_EMAIL`: Email (verification, password reset, owner notifications)

No OAuth variables (`VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`) or Manus Forge variables are needed any more.

Do not commit `.env` files.

---
## Frontend Workflow

1. Choose a design style before you write any frontend code according to Design Guide (color, font, shadow, art style). Remember to edit `client/src/index.css` for global theming and add needed font using google font cdn in `client/index.html`.
2. Design the layout and navigation structure based on app purpose. Establish navigation in App.tsx accordingly:
  - **Personal tools & internal dashboards** (finance trackers, task managers, admin panels, personal finance apps, analytics): Use DashboardLayout with sidebar navigation for consistent experience.
  - **Public-facing products** (marketing sites, e-commerce, communities): Design custom navigation (top nav, contextual nav) and landing page to attract users.
3. Start by updating `client/src/pages/Home.tsx` (the landing page shell) using shadcn/ui components to introduce links, CTAs, or feature entry points. 
4. Create or update additional components under `client/src/pages/FeatureName.tsx`, continuing to leverage shadcn/ui + Tailwind for consistent styling.
5. Register the route (or navigation entry) in `client/src/App.tsx`.
6. Read data with `const { data, isLoading } = trpc.feature.useQuery(params);`.
7. Mutate data with `trpc.feature.useMutation()`. Use optimistic updates for list operations, toggles, and profile edits. For critical operations (payments, auth), use `invalidate` with loading states.
8. Use `useAuth()` for current user state, login URL from `getLoginUrl()`, and avoid direct cookie handling.
9. Handle loading/empty/error states in the UI—tRPC already surfaces typed responses and errors.

---

## Frontend Development Guidelines

**tRPC & Data Management:**
- Use `trpc.*.useQuery/useMutation` for all backend calls—never introduce Axios/fetch wrappers.
- **Use optimistic updates for instant feedback**: ideal for adding/editing/deleting list items, toggling states, updating profiles. Use `onMutate` to update cache, `onError` to rollback (The onMutate/onError/onSettled pattern). For critical operations (payments, auth), prefer `invalidate` with explicit loading states.
- When using `invalidate` as fallback: call `trpc.useUtils().feature.invalidate()` in mutation's `onSuccess`.
- Auth state comes from `useAuth()`; do not manipulate cookies manually.

**UI & Styling:**
- Prefer shadcn/ui components for interactions to keep a modern, consistent look; import from `@/components/ui/*` (e.g., `button`, `card`, `dialog`).
- Compose Tailwind utilities with component variants for layout and states; avoid excessive custom CSS. Use built-in `variant`, `size`, etc. where available.
- Preserve design tokens: keep the `@layer base` rules in `client/src/index.css`. Utilities like `border-border` and `font-sans` depend on them.
- Consistent design language: use spacing, radius, shadows, and typography via tokens. Extract shared UI into `components/` for reuse instead of copy‑paste.
- Accessibility and responsiveness: keep visible focus rings and ensure keyboard reachability; design mobile‑first with thoughtful breakpoints.
- Theming: Choose dark/light theme to start with for ThemeProvider according to your design style (dark or light bg), then manage colors pallette with CSS variables in `client/src/index.css` instead of hard‑coding to keep global consistency.
- Micro‑interactions and empty states: add motion, empty states, and icons tastefully to improve quality without distracting from content.
- Navigation: For internal tools/admin panels, use persistent sidebar. For public-facing apps, design navigation based on content structure (top nav, side nav, or contextual)—ensure clear escape routes from all pages.
- Placeholder UI elements: When adding structural placeholders (nav items, table actions) for not-yet-implemented features, show toast on click ("Feature coming soon"). Inform user which elements are placeholders when presenting work.

**React Best Practices:**
- Never call setState/navigation in render phase → wrap in `useEffect`

**Customized Defaults:**
This template customizes some Tailwind/shadcn defaults for simplified usage:
- `.container` is customized to auto-center and add responsive padding (see `index.css`). Use directly without `mx-auto`/`px-*`. For custom widths, use `max-w-*` with `mx-auto px-4`.
- `.flex` is customized to have `min-width:0` and `min-height:0` by default
- `button` variant `outline` uses transparent background (not `bg-background`). Add bg color class manually if needed.

---

## 🎨 Design Guide

When generating frontend UI, avoid generic patterns that lack visual distinction:
- Avoid generic full-page centered layouts—prefer asymmetric/sidebar/grid structures for landing pages and dashboards
- Avoid applying dashboard/sidebar patterns to public-facing apps (forums, communities, e-commerce)—reserve those for internal tools
- When user provides vague requirements, make creative design decisions (choose specific color palette, typography, layout approach)
- Prioritize visual diversity: combine different design systems (e.g., one color scheme + different typography + another layout principle)
- For landing pages: prefer asymmetric layouts, specific color values (not just "blue"), and textured backgrounds over flat colors
- For dashboards: use defined spacing systems, soft shadows over borders, and accent colors for hierarchy

---

## Animation Guide

Bake motion taste in from the first line of code. Snappy, physically intuitive interactions are not a polish pass — they are part of the initial build.
- Decide whether to animate at all: keyboard-initiated actions (command palettes, shortcuts) must be instant — never animate them. High-frequency interactions (hover, list nav) should be minimal. Reserve richer motion for occasional events (modals, drawers, toasts) and rare delight moments (onboarding).
- Keep UI animations under 300ms. A 180ms dropdown feels significantly better than a 400ms one. Typical ranges: button press 100–160ms, tooltips 125–200ms, dropdowns 150–250ms, modals/drawers 200–500ms.
- Use strong custom easings, not the weak CSS defaults. Default to a snappy ease-out for entering/exiting UI: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1);`. For moving/morphing use `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);`. NEVER use `ease-in` for UI animations — it feels sluggish.
- Buttons must feel responsive: add `transform: scale(0.97)` on `:active` with a ~160ms ease-out transition so the UI confirms it heard the user.
- Never animate from `scale(0)` — nothing in the real world appears from nothing. Start from `scale(0.95)` combined with `opacity: 0`.
- Origin-aware popovers/dropdowns: scale in from the trigger point (e.g. `transform-origin: var(--radix-popover-content-transform-origin)`). Modals are the exception and stay centered.
- Prefer CSS transitions over @keyframes for dynamic UI state. Transitions can be interrupted and reversed smoothly mid-flight; keyframes restart from zero and feel broken when interrupted.
- Only animate `transform` and `opacity` for motion — they run on the GPU and skip layout/paint. Avoid animating `width`, `height`, `padding`, `margin`, `top/left` unless absolutely necessary.
- Stagger grouped entrances by 30–80ms per item to create a cascading reveal instead of a wall of motion.
- Asymmetric timing for deliberate actions: hold-to-confirm should be slow and linear on press (e.g. 2s linear), but release/cancel should snap back fast (~200ms ease-out).
- Respect `prefers-reduced-motion`: gate non-essential motion behind `@media (prefers-reduced-motion: no-preference)`.

---

## Feature Checklist

- [ ] Entity type and query helper added in `server/db.ts`
- [ ] Composite index added to `firestore.indexes.json` if the query needs one- [ ] Procedure created in `server/routers.ts` (choose `public` vs `protected`)
- [ ] UI calls the procedure via `trpc.*.useQuery/useMutation`
- [ ] Success + error paths verified in the browser

---

## Pre-built Components

Before implementing UI features, check if these components already exist:

Dashboard & Layout:
- `client/src/components/DashboardLayout.tsx` - Full dashboard layout with sidebar navigation, auth handling, and user profile. Use this for any admin panel or dashboard-style app instead of building from scratch.
- `client/src/components/DashboardLayoutSkeleton.tsx` - Loading skeleton for dashboard during auth checks

Chat & Messaging:
- `client/src/components/AIChatBox.tsx` - Full-featured chat interface with message history, streaming support, and markdown rendering. Use this for any chat/conversation UI instead of building from scratch.

When implementing features that match these categories, MUST evaluate the component first to decide whether to use or customize it.

---

## Internal Tools & Admin Panels

For certain app types, this template provides DashboardLayout—a standardized sidebar pattern.

**Use DashboardLayout for:**
- Admin/management dashboards
- Personal productivity apps (task managers, note-taking)
- Analytics/monitoring tools

**Do NOT use for:**
- Public content platforms (forums, blogs, social networks)
- E-commerce storefronts
- Marketing/landing sites

**Layout & Navigation**
- Use `DashboardLayout` component from `client/src/components/DashboardLayout.tsx` and remove any page-level headers to avoid duplication.
- When use DashboardLayout, read its content before making changes and preserve its core structure by default.

**Role-based Access Control**
When building apps with distinct access levels (e.g., e-commerce with public home, user account, admin panel):
- The `user` table includes a `role` field (enum: `admin` | `user`) for identity separation
- Use `ctx.user.role` in procedures to gate admin-only operations
- Wrap admin-only backend logic in `adminProcedure`
- Frontend can conditionally render navigation/routes based on `useAuth().user?.role`

Example procedure pattern:
```ts
adminOnlyProcedure: protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
  return next({ ctx });
}),
```

**Managing Admins**
- To promote a user to admin, set `role: "admin"` on their document in the Firestore `users` collection (for example in the Firebase console).
- To add roles beyond `admin`/`user`, extend the `role` union in `server/db.ts` and the checks in `server/_core/trpc.ts`.

---

## AI Helpers

All of these run server-side only (inside tRPC procedures or jobs), so API keys never reach the browser.

- **Chat assistant:** `server/_core/orchestrator.ts` drives Claude through the Anthropic SDK (`ANTHROPIC_API_KEY`) with tools for web search, image generation, memory, and starting app-build/music jobs. Add a tool by declaring it in `TOOLS` and handling it in `executeTool()`.
- **General completions:** `invokeLLM()` in `server/_core/llm.ts` calls the OpenAI Chat Completions API (`OPENAI_API_KEY`). It supports `tools`, `tool_choice` and `response_format` (JSON Schema). Pass `model` explicitly. `listLLMModels()` lists the models the key can use.
- **Images:** `generateImage({ prompt, originalImages? })` in `server/_core/imageGeneration.ts` uses OpenAI `gpt-image-1` and stores the result with `storagePut()`.
- **Transcription:** `transcribeAudio({ audioUrl, language?, prompt? })` in `server/_core/voiceTranscription.ts` uses OpenAI Whisper and returns the native Whisper response (`text`, `language`, `segments`). It enforces a 16MB limit.
- **Music:** `server/_core/musicGeneration.ts` (ACE-Step via fal.ai, `FAL_KEY`).
- **App Builder and video rendering:** `server/_core/appBuilder.ts` and `videoGeneration.ts` run in an E2B sandbox (`E2B_API_KEY`).

Work that can outlast a request (Firebase Hosting cuts proxied requests off at 60s) goes through `enqueueJob()` in `server/_core/jobs.ts`: the API writes a `jobs/{id}` document and returns, the `jobWorker` Cloud Function runs it with a 9-minute budget, and the client polls. Locally (no Cloud Functions), jobs run in-process instead.

LLM responses often contain markdown. Render them with `<Streamdown>{content}</Streamdown>` from `streamdown`.

---

## ☁️ File Storage

Use the helpers in `server/storage.ts`, backed by Firebase Storage (`FIREBASE_STORAGE_BUCKET`).

```ts
import { storagePut } from "./server/storage";

const { key, url } = await storagePut(
  `${userId}-files/${fileName}.png`,
  fileBuffer, // Buffer | Uint8Array | string
  "image/png"
);
// key = unique storage key (a random suffix is added); save it in Firestore
// url = signed read URL, valid for up to 7 days
```

Tips
- Save the `key` in Firestore and treat it as the source of truth. Signed URLs expire, so get a fresh one with `storageGetSignedUrl(key)` (or `storageGet(key)`) when serving the file later.
- For uploads, have the client POST to your server, then call `storagePut` from your backend.
- Delete objects with `storageDelete(keys)` or `storageDeletePrefix(prefix)` when the owning record goes away.
- Stream a file back through the API with `storageReadStream(key)` (see `/api/files/:fileId/download`).

---

## Owner Notifications

`notifyOwner({ title, content })` in `server/_core/notification.ts` emails the site owner (`OWNER_EMAIL`, sent via Resend). Admins can also call it through the `trpc.system.notifyOwner` mutation.

It returns `true` when the email was sent and `false` when `OWNER_EMAIL` or email sending isn't configured, so decide whether you need a fallback. Keep this channel for owner-facing alerts; end-user email goes through `server/_core/emailService.ts`.

---

## ⏱ Datetime & Timezone

Persistence: Store all business timestamps as UTC-based Unix timestamps (milliseconds since epoch) at the database and API layer. Do not store client-local, timezone-dependent, or string-based timestamps unless explicitly required as separate fields.
Frontend display: In React components, always convert UTC timestamps to the user’s local timezone for display e.g. new Date(utcTimestamp).toLocaleString(). Keep all internal state and API interactions in UTC timestamps to avoid drift and confusion.

---

## Tips

- Keep router files under ~150 lines—split into `server/routers/<feature>.ts` once they grow.
- Show loading states at component level (spinners, skeletons) rather than blocking entire pages—keeps the app feeling responsive.

---

## Common Pitfalls

### Infinite loading loops from unstable references
**Anti-pattern:** Creating new objects/arrays in render that are used as query inputs
```tsx
// ❌ Bad: New Date() creates new reference every render → infinite queries
const { data } = trpc.items.getByDate.useQuery({
  date: new Date(), // ← New object every render!
});

// ❌ Bad: Array/object literals in query input
const { data } = trpc.items.getByIds.useQuery({
  ids: [1, 2, 3], // ← New array reference every render!
});
```

**Correct approach:** Stabilize references with useState/useMemo
```tsx
// ✅ Good: Initialize once with useState
const [date] = useState(() => new Date());
const { data } = trpc.items.getByDate.useQuery({ date });

// ✅ Good: Memoize complex inputs
const ids = useMemo(() => [1, 2, 3], []);
const { data } = trpc.items.getByIds.useQuery({ ids });
```

**Why this happens:** TRPC queries trigger when input references change. Objects/arrays created in render have new references each time, causing infinite re-fetches.

### Storing file bytes in Firestore
**Anti-pattern:** Putting file content (bytes or base64) into a Firestore document. Documents are capped at 1 MiB and every read pulls the whole payload.

**Correct approach:** Upload the bytes with `storagePut()` and store only the `key` plus metadata (filename, MIME type, size) in the document. See File Storage.

### Navigation dead-ends in subpages
**Problem:** Creating nested routes without escape routes—no header nav, no sidebar, no back button.

**Root cause:** Implementing individual pages before establishing global layout structure.

**Solution:** Define layout wrapper in App.tsx first, then build pages inside it. For admin tools use DashboardLayout; for detail pages add back button with `router.back()`.

### Invisible text from theme/color mismatches

**Root cause:** Semantic colors (`bg-background`, `text-foreground`) are CSS variables that resolve based on ThemeProvider's active theme. Mismatches cause invisible text.

**Two critical rules:**

1. **Match theme to CSS variables:** If `defaultTheme="dark"` in App.tsx, ensure `.dark {}` in index.css has dark background + light foreground values
2. **Always pair bg with text:** When using `bg-{semantic}`, MUST also use `text-{semantic}-foreground` (not automatic - text inherits from parent otherwise)

**Quick reference:**
```tsx
// ✅ Theme + CSS alignment
<ThemeProvider defaultTheme="dark">  {/* Must match .dark in index.css */}
  <div className="bg-background text-foreground">...</div>
</ThemeProvider>

// ✅ Required class pairs
<div className="bg-popover text-popover-foreground">...</div>
<div className="bg-card text-card-foreground">...</div>
<div className="bg-accent text-accent-foreground">...</div>
```

### Nested anchor tags in Link components
**Problem:** Wrapping `<a>` tags inside another `<a>` or wouter's `<Link>` creates nested anchors and runtime errors.

**Solution:** Pass children directly to Link—it already renders an `<a>` internally.
```tsx
// ❌ Bad: <Link><a>...</a></Link> or <a><a>...</a></a>
// ✅ Good: <Link>...</Link> or just <a>...</a>
```

### Empty `Select.Item` values
**Rule:** Every `<Select.Item>` must have a non-empty `value` prop—never `""`, `undefined`, or omitted.

---

## Login Redirects & Emailed Links

**Sending users to sign in:** use `getLoginUrl()` from `client/src/const.ts`. It returns `/login?next=<current path>` (or plain `/login`), and the login page only follows `next` if `safeNextPath()` accepts it as a same-site path, so it can't be used as an open redirect.

**Links the server emails out** (verification, password reset, Stripe redirects): build them from `APP_URL`, never from the request's `Origin` or `Host` header. Those headers are attacker-controlled, so they are only trusted in development (see `server/_core/appUrl.ts`).

**Unsupported browsers:** anything that blocks first-party cookies (the session lives in the `app_session_id` cookie).

# Formhive — Claude Code context

## What this project is

A **Formhive** platform that lets organisations collect structured data from passive, non-technical recipients via WhatsApp, SMS, and email — without requiring them to install an app or log into a portal.

The core insight: existing tools like KoboToolbox assume an enumerator (a trained field worker) actively collects data from people face-to-face. Formhive sends a tokenised link to a farmer's WhatsApp. The farmer clicks it, fills a mobile-optimised form, submits. Done. No app, no login, no training.

Target users: government departments, agricultural ministries, NGOs, sports associations — anyone who needs to regularly collect structured data from a group of people who won't come looking for a form on their own.

Business model: self-hostable and free (open core, AGPL-3.0), with a paid cloud version at formhive.com.

---

## Architecture — six microservices, one event bus

All services communicate via **Redis Streams** (event bus). They are loosely coupled — no direct service-to-service HTTP calls. Each service emits and consumes events.

```
apps/
  api/           → Config API + Auth. The only public-facing HTTP service.
  scheduler/     → Reads campaign deadlines and reminder schedules. Fires events.
  notification/  → Consumes reminder events. Sends WhatsApp / SMS / email.
  form/          → Serves tokenised form links. Validates and stores submissions.
  validator/     → Consumes raw submissions. Applies schema rules. Emits validated events.
  dashboard/     → React SPA. Admin UI for non-developer tenants.

packages/
  db/            → Drizzle ORM schema + client. Shared by all apps. Never deployed alone.
  types/         → Shared TypeScript types and Zod schemas.
  events/        → Event name constants and payload type definitions for the event bus.
```

---

## Current phase: Phase 1 — single tenant, core engine

We are building the minimum that lets one real government department run a real data collection campaign. Not a demo. Not a proof of concept. Real users, real data, by month 4.

**In scope for Phase 1:**
- Config API (POST /schemas, POST /recipients, POST /schedules, POST /campaigns, GET /submissions)
- JWT auth (single tenant, no multi-tenant isolation yet)
- Redis Streams event bus wiring all services
- Scheduler service (node-cron, fires campaign.reminder.due events)
- Notification service (email via Nodemailer + SMTP, SMS stub, WhatsApp stub)
- Form service (tokenised links, mobile-optimised form renderer)
- Validator service (Ajv-based schema validation)
- Admin dashboard (React, basic campaign status view)

**Out of scope for Phase 1 (do not build):**
- Multi-tenancy (tenant_id columns exist in schema but are hardcoded to a default)
- Billing
- BYOD webhooks or local agent
- Offline mobile SDK
- WhatsApp Business API (use stubs with TODO comments for now)
- ODK Collect compatibility endpoint

---

## Database schema — five core tables

Defined in `packages/db/src/schema.ts` using Drizzle ORM with PostgreSQL.

**Critical rule:** Every table has a `tenant_id` column even in Phase 1 where we hardcode a default. Adding it later to a live database is painful. It goes in now.

```
tenants       id, name, api_key_hash, plan, created_at
schemas       id, tenant_id, name, version, fields jsonb, created_at
recipients    id, tenant_id, ref, name, channels jsonb, prefill jsonb, created_at
campaigns     id, tenant_id, name, schema_id, recipient_group_id, deadline timestamptz,
              reminders jsonb, status (draft|active|closed), webhook_url, created_at
submissions   id, tenant_id, campaign_id, recipient_ref, data jsonb,
              status (pending|valid|invalid), submitted_at, created_at
```

---

## Tech stack decisions (and why — do not change without discussion)

| Concern | Choice | Why |
|---|---|---|
| API framework | Fastify | Faster than Express, native TypeScript, schema validation built in |
| ORM | Drizzle ORM | Type-safe, migration-based, no magic, SQL-close |
| Database | PostgreSQL (Supabase in dev) | JSONB for flexible field data, strong consistency |
| Event bus | Redis Streams | Already a dependency (caching), no extra infra, enough for Phase 1 |
| Validation | Ajv | The standard JSON Schema validator, used by everyone |
| Monorepo | pnpm workspaces + Turborepo | One lock file, shared packages, independent deployments |
| Deployment | Railway (dev/staging) | No DevOps overhead for one person |
| Language | TypeScript strict mode everywhere | Catch errors at compile time, not runtime |

---

## Coding conventions

**TypeScript**
- `strict: true` in all tsconfigs. No `any`. Use `unknown` and narrow it.
- Zod for all runtime validation at API boundaries. Drizzle infers DB types.
- Export types from `packages/types`, not from `apps/`.

**API design**
- REST for the Config API. No GraphQL.
- All endpoints return `{ data, error }` envelope.
- Errors always have `{ code, message, field? }` shape.
- Use Fastify's built-in schema validation (JSON Schema) for request bodies.

**Event bus**
- Event names follow `noun.verb.tense` pattern: `campaign.reminder.due`, `submission.received`, `submission.validated`.
- Event payloads are defined in `packages/events/src/index.ts` with TypeScript types.
- Every service that consumes events must handle unknown event shapes gracefully — log and skip, never crash.

**File structure inside each app**
```
src/
  app.ts          → Fastify instance, register plugins
  server.ts       → app.listen(), entry point
  routes/         → One file per route group (health.ts, campaigns.ts, etc.)
  services/       → Business logic, no HTTP concern
  lib/            → Singletons (redis.ts, db.ts)
  types.ts        → Local types not worth putting in packages/types
```

**Git**
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`
- Never commit .env files. Always update .env.example when adding a new variable.
- One PR per logical change. Small PRs are better than large ones.

---

## Environment variables

All apps read from a single `.env` at the repo root. Each app declares which vars it needs in its own `.env.schema.ts` using `@fastify/env`.

Required for all apps:
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
NODE_ENV=development|production
```

Required per app:
```
# apps/api
PORT=3000
JWT_SECRET=...

# apps/form
FORM_PORT=3001

# apps/notification
SMTP_HOST=...
SMTP_PORT=...
SMTP_USER=...
SMTP_PASS=...
WHATSAPP_API_URL=stub     # "stub" means log to console in Phase 1
SMS_API_URL=stub          # same
```

---

## XLSForm compatibility (important for adoption)

When the schema API accepts field definitions, use XLSForm type names:
- `text`, `decimal`, `integer`, `select_one`, `select_multiple`, `date`, `geopoint`, `image`, `audio`

This means any organisation with existing KoboToolbox or ODK forms can import them. It costs nothing to align with this standard and it signals credibility to the NGO and government sector.

---

## What makes this different from KoboToolbox / ODK

KoboToolbox = enumerator model. A trained field worker opens the app and collects data from someone face-to-face.

Formhive = push model. The platform sends a WhatsApp/SMS to a passive recipient (farmer, club officer, department head). They click the link on their own phone. The platform tracks who has and hasn't submitted and automatically skips reminders for people who already responded.

The scheduler + notification + skip-if-submitted logic is the core differentiator. This is what doesn't exist as a self-hostable open-source tool.

---

## Known ioredis gotchas

**XREADGROUP argument order** — ioredis requires COUNT before BLOCK, matching
the Redis protocol spec. The correct call is:

  client.xreadgroup(
    'GROUP', group, consumer,
    'COUNT', 10,
    'BLOCK', 2000,
    'STREAMS', stream,
    '>'
  )

Wrong (BLOCK before COUNT) will throw at runtime, not compile time.

---

## Phase 1 simplification — campaign activation broadcasts to all tenant recipients

When a campaign transitions to 'active', the platform creates one submission row
for every recipient in the tenant. There is no per-campaign recipient group in
Phase 1. This is replaced with recipient_group_id logic in Phase 2.


---

## Vitest + @fastify/autoload incompatibility

Do NOT use @fastify/autoload in apps that have Vitest tests. Autoload uses
Node's native dynamic import() to load route files at runtime, which bypasses
Vite's transform pipeline. TypeScript route files fail to load in the test
environment.

Instead, register routes with explicit static imports in app.ts:

  import schemaRoutes from './routes/v1/schemas/index.js'
  app.register(schemaRoutes, { prefix: '/v1/schemas' })

This applies to all apps with tests: api, form, validator, etc.

---

## Environment variables in dev

tsx does not auto-load .env. Every app's dev script must use:

  "dev": "tsx watch --env-file=../../.env src/server.ts"

The ../../.env path is relative to apps/<name>/ pointing at the repo root .env.
This applies to all apps — api, form, scheduler, notification, validator.
Non-HTTP services that use src/index.ts as the entry point follow the same pattern.

---

## Licence header

Every new source file (.ts, .tsx) must start with these two lines before any imports:

  // SPDX-License-Identifier: AGPL-3.0-only
  // Copyright (C) 2025 Formhive contributors

Do not add it to generated files (migrations, dist output, .json files).

---

## Testing event-driven services

Do not use setTimeout or arbitrary delays in tests for event-driven services.
Use the waitFor() polling helper in apps/validator/src/test/helpers/waitFor.ts.
Copy the same helper into any new service that needs it.

Pattern:
  1. Seed DB state
  2. Publish event via eventBus.publish()
  3. await waitFor(() => checkDbForExpectedState())
  4. Assert final DB state

---

## Scheduler job functions must be exported

Both job functions must be exported as named functions from their own files,
not defined inline inside cron.schedule(). This is required for testing —
tests call the functions directly without invoking the cron timer.

  // correct
  export async function runReminderDispatch() { ... }
  cron.schedule('*/5 * * * *', runReminderDispatch)

  // wrong — untestable
  cron.schedule('*/5 * * * *', async () => { ... })


---

## Dashboard (apps/dashboard)

apps/dashboard is a React SPA built with Vite + React + Tailwind v4 + React
Query. It is the admin UI for non-developer tenants.

It communicates with apps/api only — never directly with the DB or Redis.
All API calls go through src/api/client.ts (axios with JWT interceptor).
The axios baseURL is '/api' in all environments. In development the Vite dev
server proxies /api → http://localhost:3000. In Docker, nginx proxies /api/
to http://api:3000/ (stripping the prefix) — matching the Vite proxy exactly.

Port: 3002 in dev (pnpm --filter dashboard dev).

### Docker / production build

The dashboard Dockerfile uses a two-stage build:
- Stage 1 (node:20-alpine): installs pnpm, installs deps, runs `vite build`
  (not `tsc && vite build` — tsc is skipped in Docker because test files
  contain partial mock objects that are valid at runtime but fail strict
  type-checking; type safety is verified by `pnpm test` in development)
- Stage 2 (nginx:alpine): serves dist/ as static files via nginx

nginx.conf caches /assets/* for 1 year (Vite hashes filenames), sets no-cache
on HTML, and falls back to index.html for all unmatched routes (React Router).

VITE_API_URL is accepted as a Docker build arg (default: http://localhost:3000)
for future use. The nginx proxy is what routes /api/* at runtime.

---


## Styling conventions (dashboard only)

Tailwind v4 — no tailwind.config.js. Config lives in src/index.css via
@import "tailwindcss". Use utility classes only, no CSS modules or
styled-components.

Use cn() from src/lib/utils.ts for conditional class names:
  import { cn } from '@/lib/utils'

All shadcn/ui components live in src/components/ui/ as source files —
they are not a node_modules dependency. Never install shadcn as a package.

Two weights only: font-normal (400) and font-medium (500).
Never use font-semibold or font-bold — too heavy against the sidebar.


---


## State management (dashboard)

Server state   → React Query (@tanstack/react-query v5)
                 staleTime: 30s, retry: 1
                 Never use useState + useEffect + fetch for API calls

Client state   → Zustand (src/store/auth.ts — token only)
                 Never put server data in Zustand

Form state     → react-hook-form + zod resolver
                 Define zod schemas in the same file as the form component

Do not use Redux, Context API for server state, or SWR.

---

## Architecture Decision Records

Significant technical decisions are documented in adr/.
Before making a decision that changes the architecture, check if an
existing ADR covers it. If making a new significant decision, create
a new ADR following the format in adr/README.md.

Never delete or edit accepted ADRs — create a new one that supersedes
the old one instead.

--

## Do not do these things

- Do not make direct HTTP calls between microservices. Use the event bus.
- Do not put business logic in route handlers. Routes call services, services do the work.
- Do not skip the `tenant_id` column on any new table.
- Do not use `any` type.
- Do not create new environment variables without adding them to `.env.example`.
- Do not install a new dependency without considering if it already exists in another package in the monorepo.
- Do not add a new `apps/` service without a corresponding `Dockerfile`.

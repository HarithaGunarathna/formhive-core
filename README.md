# Formhive

Formhive lets organisations collect structured data from passive, non-technical recipients via WhatsApp, SMS, and email — without requiring them to install an app or log into a portal.

A campaign manager creates a form schema, imports a recipient list, and activates a campaign. Each recipient gets a personalised link. They click it, fill a mobile-optimised form, and submit. The platform tracks who has and hasn't responded and can send automatic reminders to those who haven't.

> **Current status:** Phase 1 — single tenant, core collection engine (API + Form + Validator). Scheduler and Notification stubs are in place; full delivery integrations are Phase 2.

---

## Architecture

Six microservices communicate exclusively through a **Redis Streams** event bus. No service makes direct HTTP calls to another.

```
apps/
  api/          → Config API + Auth  (port 3000)
  form/         → Tokenised form renderer + submission handler  (port 3001)
  validator/    → Consumes submission.received, validates against schema, emits result
  scheduler/    → Reads campaign deadlines and reminder schedules, fires events  (stub)
  notification/ → Consumes reminder events, sends email/SMS/WhatsApp  (stub)
  dashboard/    → React admin SPA  (not yet built)

packages/
  db/           → Drizzle ORM schema + PostgreSQL client (shared)
  types/        → Shared TypeScript types (FormField, XlsFormFieldType, …)
  events/       → Event name constants, payload types, EventBus class
```

### Event flow

```
POST /v1/campaigns/:id  (status → active)
  └─ creates one submissions row per recipient
  └─ publishes campaign.activated

POST /f/:token  (recipient submits form)
  └─ coerces field types (string → number for decimal/integer)
  └─ saves data to submissions.data
  └─ publishes submission.received

validator service
  └─ consumes submission.received
  └─ validates data against Ajv-built JSON Schema
  └─ updates submissions.status → valid | invalid
  └─ publishes submission.validated | submission.invalid
```

---

## Tech stack

| Concern | Choice |
|---|---|
| API framework | Fastify 4 |
| ORM | Drizzle ORM |
| Database | PostgreSQL 16 |
| Event bus | Redis 7 Streams |
| Validation | Ajv 8 + ajv-formats |
| Monorepo | pnpm workspaces + Turborepo |
| Language | TypeScript (strict) |
| Tests | Vitest — integration tests against real DB and Redis (no mocks) |

---

## Prerequisites

- **Node.js** ≥ 20.6 (for `--env-file` support)
- **pnpm** 9 — `npm install -g pnpm`
- **Docker** + Docker Compose

---

## Quick start

### 1 — Clone and install

```bash
git clone <repo-url>
cd formhive-core
pnpm install
```

### 2 — Environment

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

```
JWT_SECRET=any-random-string-at-least-32-chars
```

Everything else defaults work with the Docker Compose setup below.

### 3 — Start infrastructure

```bash
docker compose up -d
docker compose ps   # both postgres and redis should show (healthy)
```

If a container is unhealthy: `docker compose logs postgres` or `docker compose logs redis`.

### 4 — Migrate and seed

```bash
pnpm db:migrate     # applies all Drizzle migrations
pnpm db:seed        # creates the Phase 1 tenant row; writes SEED_API_KEY to .env
```

Confirm in Drizzle Studio (`pnpm db:studio`):
- `tenants` table has one row
- All other tables are empty

### 5 — Start all services

```bash
pnpm dev
```

Wait for all five services to start. You should see:

```
@formhive/api:dev         Server listening at http://0.0.0.0:3000
@formhive/form:dev        Server listening at http://0.0.0.0:3001
@formhive/validator:dev   [validator] service starting…
@formhive/scheduler:dev   [scheduler] service starting…
@formhive/notification:dev [notification] service starting…
```

---

## End-to-end walkthrough

The steps below exercise every part of the current pipeline: API → Form → Validator → Redis.

### Step 1 — Get an auth token

```bash
# Replace <your-seed-api-key> with the value of SEED_API_KEY in your .env
TOKEN=$(curl -s http://localhost:3000/v1/auth/token \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"api_key":"<your-seed-api-key>"}' | jq -r '.data.token')

echo $TOKEN   # confirm it is not empty
```

### Step 2 — Create a form schema

```bash
SCHEMA_ID=$(curl -s http://localhost:3000/v1/schemas \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "harvest_survey_v1",
    "fields": [
      {
        "id": "farm_size",
        "type": "decimal",
        "label": "Farm size (acres)",
        "required": true,
        "validation": { "minimum": 0.1, "maximum": 500 }
      },
      {
        "id": "crop_type",
        "type": "select_one",
        "label": "Primary crop",
        "required": true,
        "choices": [
          { "value": "paddy",      "label": "Paddy" },
          { "value": "maize",      "label": "Maize" },
          { "value": "vegetables", "label": "Vegetables" }
        ]
      }
    ]
  }' | jq -r '.data.id')

echo $SCHEMA_ID
```

Expected: a UUID.

### Step 3 — Create recipients

```bash
curl -s http://localhost:3000/v1/recipients \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "recipients": [
      { "ref": "FARMER_001", "name": "Nimal Perera",   "channels": { "email": "nimal@test.com"  } },
      { "ref": "FARMER_002", "name": "Kamal Silva",    "channels": { "email": "kamal@test.com"  } },
      { "ref": "FARMER_003", "name": "Sunil Fernando", "channels": { "email": "sunil@test.com"  } }
    ]
  }' | jq
```

Expected: `{ "data": { "created": 3, "updated": 0 } }`

### Step 4 — Create a campaign

```bash
CAMPAIGN_ID=$(curl -s http://localhost:3000/v1/campaigns \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"name\": \"Paddy harvest survey Oct 2025\",
    \"schema_id\": \"$SCHEMA_ID\",
    \"deadline\": \"2025-10-31T23:59:00Z\",
    \"reminders\": []
  }" | jq -r '.data.id')

echo $CAMPAIGN_ID
```

Expected: `status: "draft"`.

### Step 5 — Activate the campaign

```bash
curl -s http://localhost:3000/v1/campaigns/$CAMPAIGN_ID \
  -X PATCH \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"status": "active"}' | jq '.data.status'
```

Expected: `"active"`.

### Step 6 — Check submission tokens were created

```bash
curl -s http://localhost:3000/v1/campaigns/$CAMPAIGN_ID/submissions \
  -H "Authorization: Bearer $TOKEN" | jq '.data[] | {ref: .recipientRef, token: .submissionToken, status: .status}'
```

Expected: 3 rows, all `status: "pending"`, each with a 21-character `submissionToken`.

Save one token for the browser test, and a second for the invalid submission test:

```bash
FORM_TOKEN=$(curl -s http://localhost:3000/v1/campaigns/$CAMPAIGN_ID/submissions \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].submissionToken')

FORM_TOKEN_2=$(curl -s http://localhost:3000/v1/campaigns/$CAMPAIGN_ID/submissions \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[1].submissionToken')
```

### Step 7 — Open the form in a browser

Navigate to:

```
http://localhost:3001/f/<FORM_TOKEN>
```

Check:
- Both fields render with their labels
- Crop type shows as a dropdown with Paddy / Maize / Vegetables
- Submitting shows the thank-you page

### Step 8 — Submit valid and invalid data via curl

**Valid submission** (farm_size within 0.1–500):

```bash
curl -s http://localhost:3001/f/$FORM_TOKEN \
  -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "farm_size=3.5" \
  --data-urlencode "crop_type=paddy"
```

**Invalid submission** (farm_size exceeds maximum):

```bash
curl -s http://localhost:3001/f/$FORM_TOKEN_2 \
  -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "farm_size=9999" \
  --data-urlencode "crop_type=paddy"
```

### Step 9 — Confirm the validator processed both

Wait 1–2 seconds, then:

```bash
curl -s http://localhost:3000/v1/campaigns/$CAMPAIGN_ID/submissions \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data[] | {ref: .recipientRef, status: .status, errors: .validationErrors}'
```

Expected:

```json
{ "ref": "FARMER_001", "status": "valid",   "errors": [] }
{ "ref": "FARMER_002", "status": "invalid", "errors": ["..."] }
{ "ref": "FARMER_003", "status": "pending"                    }
```

Also check the validator logs in the terminal:

```
[validator] <uuid> → VALID
[validator] <uuid> → INVALID: /farm_size must be <= 500
```

### Step 10 — Confirm events in Redis

```bash
redis-cli XRANGE formhive:submissions - +
```

You should see three event types:

| Event | When |
|---|---|
| `submission.received` | Form submitted |
| `submission.validated` | Validator accepted the data |
| `submission.invalid` | Validator rejected the data |

### What a clean run looks like

| Step | Action | Expected |
|---|---|---|
| 1 | Auth token | JWT issued |
| 2 | Schema created | UUID returned, 201 |
| 3 | Recipients created | `created: 3` |
| 4 | Campaign created | `status: draft` |
| 5 | Campaign activated | `status: active` |
| 6 | Submissions created | 3 rows, all pending, each with a token |
| 7 | Form renders | Fields visible, dropdown works |
| 8 | Form submitted | Thank-you page |
| 9 | Validator ran | `valid` and `invalid` statuses in DB |
| 10 | Redis stream | `submission.received`, `submission.validated`, `submission.invalid` all present |

---

## Running the test suites

Each service with tests runs against a real PostgreSQL database and Redis instance (no mocks). Run `pnpm db:seed` once before running any tests.

```bash
# All services
pnpm --filter @formhive/api test
pnpm --filter @formhive/form test
pnpm --filter @formhive/validator test
```

Or from the repo root (runs all in dependency order via Turborepo — add a `test` pipeline to `turbo.json` first):

```bash
turbo run test
```

Test counts as of Phase 1:

| Service | Tests |
|---|---|
| `apps/api` | 44 |
| `apps/form` | 9 |
| `apps/validator` | 5 |
| **Total** | **58** |

---

## Project structure

```
formhive-core/
├── apps/
│   ├── api/          Fastify — auth, schemas, recipients, campaigns, submissions
│   ├── form/         Fastify — tokenised form render + POST submission handler
│   ├── validator/    Event consumer — Ajv validation, updates submission status
│   ├── scheduler/    Event producer — deadline + reminder firing (Phase 2)
│   ├── notification/ Event consumer — email/SMS/WhatsApp delivery (Phase 2)
│   └── dashboard/    React SPA — admin UI (Phase 2)
├── packages/
│   ├── db/           Drizzle schema, migrations, client
│   ├── types/        Shared TypeScript interfaces
│   └── events/       EventBus class, stream names, event payload types
├── docker-compose.yml
├── .env.example
└── turbo.json
```

---

## Environment variables

All services read from a single `.env` at the repo root (passed via `--env-file=../../.env` in each `dev` script).

| Variable | Used by | Description |
|---|---|---|
| `DATABASE_URL` | all | PostgreSQL connection string |
| `REDIS_URL` | all | Redis connection string |
| `NODE_ENV` | all | `development` or `production` |
| `PORT` | api | HTTP port (default 3000) |
| `FORM_PORT` | form | HTTP port (default 3001) |
| `JWT_SECRET` | api | Secret for signing JWTs |
| `SEED_API_KEY` | api tests | Plaintext API key written by `db:seed` |
| `SMTP_HOST` | notification | SMTP server hostname |
| `SMTP_PORT` | notification | SMTP server port |
| `SMTP_USER` | notification | SMTP username |
| `SMTP_PASS` | notification | SMTP password |
| `WHATSAPP_API_URL` | notification | Set to `stub` in Phase 1 |
| `SMS_API_URL` | notification | Set to `stub` in Phase 1 |

---

## License

AGPL-3.0-only. See [LICENSE](LICENSE).

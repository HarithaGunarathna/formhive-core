# Formhive

Formhive lets organisations collect structured data from passive, non-technical recipients via WhatsApp, SMS, and email — without requiring them to install an app or log into a portal.

A campaign manager creates a form schema, imports a recipient list, and activates a campaign. Each recipient gets a personalised link. They click it, fill a mobile-optimised form, and submit. The platform tracks who has and hasn't responded and can send automatic reminders to those who haven't.

> **Current status:** Phase 1 — single tenant, core collection engine (API + Form + Validator + Scheduler + Notification). Delivery integrations (real SMS/WhatsApp APIs) are Phase 2.

---

## Architecture

Six microservices communicate exclusively through a **Redis Streams** event bus. No service makes direct HTTP calls to another.

```
apps/
  api/          → Config API + Auth  (port 3000)
  form/         → Tokenised form renderer + submission handler  (port 3001)
  validator/    → Consumes submission.received, validates against schema, emits result
  scheduler/    → Reads campaign deadlines and reminder schedules, fires events every 5 min
  notification/ → Consumes notification.send events, routes to email/SMS/WhatsApp channels
  dashboard/    → React admin SPA  (not yet built)

packages/
  db/           → Drizzle ORM schema + PostgreSQL client (shared)
  types/        → Shared TypeScript types (FormField, XlsFormFieldType, …)
  events/       → Event name constants, payload types, EventBus class
```

### Event flow

```
SUBMISSION PIPELINE
POST /f/:token  (recipient submits form)
  └─ coerces field types (string → number for decimal/integer)
  └─ saves data to submissions.data
  └─ publishes submission.received

validator service (consumes submission.received)
  └─ validates data against Ajv-built JSON Schema
  └─ updates submissions.status → valid | invalid
  └─ publishes submission.validated | submission.invalid

REMINDER & NOTIFICATION PIPELINE
POST /v1/campaigns/:id  (status → active)
  └─ creates one submissions row per recipient

PATCH /v1/campaigns/:id  (add reminders)
  └─ updates campaigns.reminders array with send_at times

scheduler service (runs every 5 minutes)
  └─ queries active campaigns with send_at in the past
  └─ filters by only_if: 'not_submitted' if specified
  └─ publishes notification.send for each recipient

notification service (consumes notification.send)
  └─ routes to email (Nodemailer/SMTP), SMS stub, WhatsApp stub
  └─ logs delivery success/failure
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

---

## Testing Scheduler & Notification (Reminders)

The scheduler runs every 5 minutes to send reminders. For faster testing without waiting, use the manual trigger script.

### Step 11 — Update the campaign with past reminders

Add a reminder with `send_at` in the past so the scheduler will pick it up:

```bash
curl -s http://localhost:3000/v1/campaigns/$CAMPAIGN_ID \
  -X PATCH \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "reminders": [
      {
        "send_at": "2025-01-01T09:00:00Z",
        "channel": "whatsapp",
        "message_template": "opening",
        "only_if": "not_submitted"
      }
    ]
  }' | jq '.data.reminders'
```

Expected: The reminders array is updated on the campaign.

### Step 12 — Trigger the scheduler manually

Run the trigger script to dispatch reminders immediately (avoids waiting 5 minutes):

```bash
pnpm --filter scheduler trigger:now
```

Watch the logs in the scheduler and notification terminals (or use `pnpm dev` in another terminal):

**In scheduler logs:**
```
[scheduler] sent reminder 0 for campaign <id> to FARMER_001
[scheduler] sent reminder 0 for campaign <id> to FARMER_002
[scheduler] sent reminder 0 for campaign <id> to FARMER_003
```

**In notification logs (stubs):**
```
[notification] sent WhatsApp to +<phone> (template: opening)
[notification] sent WhatsApp to +<phone> (template: opening)
[notification] sent WhatsApp to +<phone> (template: opening)
```

### Step 13 — Verify reminder deduplication in the database

Confirm that the reminder log was written (each recipient, each reminder index tracked):

```bash
psql $DATABASE_URL -c "SELECT campaign_id, reminder_index, recipient_ref, sent_at FROM campaign_reminder_log ORDER BY sent_at DESC LIMIT 10;"
```

Expected: 3 rows (one per recipient), all with reminder_index=0 and recent sent_at timestamps.

Run the trigger again and confirm **no new logs are created**:

```bash
pnpm --filter scheduler trigger:now
# No output because reminders are deduplicated
```

### Step 14 — Test skip-if-submitted filtering

Submit a form to mark one recipient as done:

```bash
# Get a fresh form token
FORM_TOKEN=$(curl -s http://localhost:3000/v1/campaigns/$CAMPAIGN_ID/submissions \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].submissionToken')

# Submit it
curl -s http://localhost:3001/f/$FORM_TOKEN \
  -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "farm_size=5" \
  --data-urlencode "crop_type=paddy"
```

Wait 1–2 seconds for validation, then add a **second** reminder and trigger again:

```bash
curl -s http://localhost:3000/v1/campaigns/$CAMPAIGN_ID \
  -X PATCH \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "reminders": [
      {
        "send_at": "2025-01-01T09:00:00Z",
        "channel": "whatsapp",
        "message_template": "opening",
        "only_if": "not_submitted"
      },
      {
        "send_at": "2025-01-02T09:00:00Z",
        "channel": "sms",
        "message_template": "reminder",
        "only_if": "not_submitted"
      }
    ]
  }' | jq

pnpm --filter scheduler trigger:now
```

Expected in logs: Only 2 SMS reminders sent (to FARMER_002 and FARMER_003). FARMER_001 who already submitted is skipped.

### Step 15 — Test campaign closer

Set the deadline to the past and trigger the closer:

```bash
curl -s http://localhost:3000/v1/campaigns/$CAMPAIGN_ID \
  -X PATCH \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"deadline": "2024-01-01T00:00:00Z"}' | jq '.data.status'

# Create and run the closer script (or use pnpm scripts)
pnpm --filter scheduler run build

# Run the campaign closer (update the scripts first if not present)
node apps/scheduler/dist/scripts/closeCampaignsNow.js 2>/dev/null || \
  tsx --env-file=.env apps/scheduler/src/scripts/closeCampaignsNow.ts
```

Confirm the campaign is closed:

```bash
curl -s http://localhost:3000/v1/campaigns/$CAMPAIGN_ID \
  -H "Authorization: Bearer $TOKEN" | jq '.data.status'
```

Expected: `"closed"`

### What a clean end-to-end run looks like

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
| 11 | Reminders added | Campaign reminders array updated |
| 12 | Scheduler triggered | 3 `notification.send` events published to Redis |
| 13 | Reminders logged | 3 rows in `campaign_reminder_log` table |
| 14 | Skip-if-submitted works | 2nd reminder only sent to non-submitted recipients |
| 15 | Campaign closed | Status transitions to `closed` |

---

## Running locally with Docker

Run the entire stack (all services + database + cache) in Docker:

### 1 — Set up environment

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

```
JWT_SECRET=any-random-string-at-least-32-chars
```

### 2 — Start infrastructure

```bash
docker compose up -d
```

This starts:
- PostgreSQL (port 5432)
- Redis (port 6379)
- API (port 3000)
- Form (port 3001)
- Validator, Scheduler, Notification (background)

Wait for all services to be healthy:

```bash
docker compose ps   # all should show 'Up'
```

### 3 — Run migrations

```bash
pnpm db:migrate
```

### 4 — View logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api
docker compose logs -f notification
```

---

## Running all services locally (without Docker)

For rapid development, start all services in parallel on your machine:

```bash
# Terminal 1: Start infrastructure
docker compose up postgres redis -d

# Terminal 2: Run all services
pnpm db:migrate
pnpm dev:all

# Or individually:
pnpm --filter @formhive/api dev &
pnpm --filter @formhive/form dev &
pnpm --filter @formhive/validator dev &
pnpm --filter @formhive/scheduler dev &
pnpm --filter @formhive/notification dev &
```

---

## Running the test suites

Each service with tests runs against a real PostgreSQL database and Redis instance (no mocks). Run `pnpm db:seed` once before running any tests.

```bash
# All services
pnpm --filter @formhive/api test
pnpm --filter @formhive/form test
pnpm --filter @formhive/validator test
pnpm --filter @formhive/scheduler test
```

Or from the repo root (runs all in dependency order via Turborepo — add a `test` pipeline to `turbo.json` first):

```bash
turbo run test
```

Test counts as of Phase 1:

| Service | Tests |
|---|---|
| `apps/api` | 49 |
| `apps/form` | 9 |
| `apps/validator` | 5 |
| `apps/scheduler` | 9 |
| **Total** | **72** |

---

## Project structure

```
formhive-core/
├── apps/
│   ├── api/          Fastify — auth, schemas, recipients, campaigns, submissions
│   ├── form/         Fastify — tokenised form render + POST submission handler
│   ├── validator/    Event consumer — Ajv validation, updates submission status
│   ├── scheduler/    Cron jobs — reminder dispatch, campaign closer (fires events)
│   ├── notification/ Event consumer — routes to email/SMS/WhatsApp channels
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
| `FORM_BASE_URL` | scheduler, notifications | Base URL for form links (e.g., `http://localhost:3001`) |
| `JWT_SECRET` | api | Secret for signing JWTs |
| `SEED_API_KEY` | api tests | Plaintext API key written by `db:seed` |
| `SMTP_HOST` | notification | SMTP server hostname |
| `SMTP_PORT` | notification | SMTP server port |
| `SMTP_USER` | notification | SMTP username |
| `SMTP_PASS` | notification | SMTP password |
| `WHATSAPP_API_URL` | notification | Set to `stub` for Phase 1, real provider URL in Phase 2 |
| `SMS_API_URL` | notification | Set to `stub` for Phase 1, real provider URL in Phase 2 |

---

## End-to-End Docker Test

After running `docker compose up -d`, verify the complete flow works:

### 1 — Get an auth token

```bash
SEED_API_KEY=$(grep SEED_API_KEY .env | cut -d= -f2)

TOKEN=$(curl -s http://localhost:3000/v1/auth/token \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"api_key\":\"$SEED_API_KEY\"}" | jq -r '.data.token')

echo "Token: $TOKEN"
```

### 2 — Create a schema

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

echo "Schema ID: $SCHEMA_ID"
```

### 3 — Create recipients

```bash
curl -s http://localhost:3000/v1/recipients \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "recipients": [
      { "ref": "FARMER_001", "name": "Nimal Perera",   "channels": { "email": "nimal@test.com", "whatsapp": "+94771234567" } },
      { "ref": "FARMER_002", "name": "Kamal Silva",    "channels": { "email": "kamal@test.com", "whatsapp": "+94772345678" } },
      { "ref": "FARMER_003", "name": "Sunil Fernando", "channels": { "email": "sunil@test.com", "whatsapp": "+94773456789" } }
    ]
  }' | jq
```

### 4 — Create and activate campaign

```bash
CAMPAIGN_ID=$(curl -s http://localhost:3000/v1/campaigns \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"name\": \"Paddy harvest survey\",
    \"schema_id\": \"$SCHEMA_ID\",
    \"deadline\": \"2025-12-31T23:59:00Z\",
    \"reminders\": []
  }" | jq -r '.data.id')

echo "Campaign ID: $CAMPAIGN_ID"

# Activate it
curl -s http://localhost:3000/v1/campaigns/$CAMPAIGN_ID \
  -X PATCH \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"status": "active"}' | jq '.data.status'
```

### 5 — Get submission token and open form in browser

```bash
FORM_TOKEN=$(curl -s http://localhost:3000/v1/campaigns/$CAMPAIGN_ID/submissions \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].submissionToken')

echo "Open this in your browser:"
echo "http://localhost:3001/f/$FORM_TOKEN"
```

Navigate to the URL in your browser, fill the form, and submit.

### 6 — Verify submission was processed

Wait 2 seconds for the validator to run, then:

```bash
curl -s http://localhost:3000/v1/campaigns/$CAMPAIGN_ID/submissions \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data[0] | {ref: .recipientRef, status: .status, submittedAt: .submittedAt}'
```

Expected: `status: "valid"` and a `submittedAt` timestamp.

---

## License

AGPL-3.0-only. See [LICENSE](LICENSE).

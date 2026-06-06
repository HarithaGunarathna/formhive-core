# Formhive

[![License: AGPL v3][licence-badge]][licence]
[![pnpm 9.7][pnpm-badge]][pnpm-url]
[![TypeScript 5][ts-badge]][ts-url]
[![Node ≥ 20.6][node-badge]][node-url]
[![Self-hosted · Free][self-hosted-badge]]()

**Send a tokenised form link to your recipients via WhatsApp, SMS, or email. They click, fill, submit — no app, no login, no training required.**

- 📨 **Push model** — the platform reaches out to recipients; they don't have to find a form
- 🔔 **Smart reminders** — automatically skips recipients who have already submitted
- 📋 **XLSForm-compatible** — import existing KoboToolbox / ODK form schemas directly
- 📎 **File uploads** — image, audio, and file fields stream to S3-compatible object storage
- 🏢 **Multi-tenant** — organisations self-register with account name + password; data is fully isolated per tenant
- 🏠 **Self-hostable** — AGPL-3.0, runs on any Docker host, one `docker compose up`

> **Status:** Multi-tenant account system and object-storage file uploads are live. Real WhatsApp/SMS delivery integrations are still stubbed (Phase 2).

---

## Services

Six microservices communicate exclusively via **Redis Streams** — no direct HTTP calls between services.

| Service | Role | Port |
|---|---|---|
| `api` | Account auth, schemas, recipients, campaigns, submissions | 3000 |
| `form` | Tokenised form renderer + submission + file upload handler | 3001 |
| `validator` | Ajv schema validation, emits result events | — |
| `scheduler` | Reminder dispatch + campaign closer (cron) | — |
| `notification` | Email / SMS / WhatsApp delivery | — |
| `dashboard` | React admin SPA | 3002 |

Backing services: **PostgreSQL** (data), **Redis** (event bus), **MinIO / Cloudflare R2** (object storage for uploaded files).

---

## Self-host in 5 commands

**Prerequisites:** Node.js ≥ 20.6, pnpm 9, Docker

```bash
git clone <repo-url> && cd formhive-core
pnpm install
cp .env.example .env          # set JWT_SECRET at minimum
docker compose up -d          # starts postgres + redis + minio
pnpm db:migrate && pnpm db:seed
pnpm dev                      # all services start
```

`pnpm db:seed` creates the default admin tenant (account `formhive_admin`,
password `changeme123`) and writes its API key to `SEED_API_KEY` in `.env`.
Sign in to the dashboard at <http://localhost:3002> with those credentials,
or register a new organisation from the sign-up page.

---

<details>
<summary><strong>API quickstart</strong> — token → schema → campaign → form link</summary>

UI users sign in with account name + password (`POST /v1/auth/login`).
The flow below uses the developer API-key path (`POST /v1/auth/token`) for
scripting — the key is in `SEED_API_KEY` after `pnpm db:seed`.

```bash
# 1 — Get an auth token (developer API-key flow)
TOKEN=$(curl -s http://localhost:3000/v1/auth/token \
  -X POST -H "Content-Type: application/json" \
  -d '{"api_key":"<SEED_API_KEY>"}' | jq -r '.data.token')

# 2 — Create a form schema
SCHEMA_ID=$(curl -s http://localhost:3000/v1/schemas \
  -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"survey","fields":[{"id":"plot_size","type":"decimal","label":"Plot size (ha)","required":true}]}' \
  | jq -r '.data.id')

# 3 — Add recipients
curl -s http://localhost:3000/v1/recipients \
  -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"recipients":[{"ref":"F001","name":"Nimal Perera","channels":{"email":"nimal@test.com"}}]}'

# 4 — Create and activate a campaign
CAMPAIGN_ID=$(curl -s http://localhost:3000/v1/campaigns \
  -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"Oct survey\",\"schema_id\":\"$SCHEMA_ID\",\"deadline\":\"2026-12-31T23:59:00Z\",\"reminders\":[]}" \
  | jq -r '.data.id')

curl -s http://localhost:3000/v1/campaigns/$CAMPAIGN_ID \
  -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"active"}'

# 5 — Get the recipient's form token and open it in a browser
curl -s http://localhost:3000/v1/campaigns/$CAMPAIGN_ID/submissions \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].submissionToken'
# → http://localhost:3001/f/<token>
```

</details>

---

## Stack

| Layer | Choice |
|---|---|
| API framework | Fastify 4 |
| ORM | Drizzle ORM |
| Database | PostgreSQL 16 + JSONB |
| Event bus | Redis 7 Streams |
| Object storage | MinIO (dev) / Cloudflare R2 (prod), S3-compatible |
| Auth | Account name + password (UI) · API key (developer) · JWT |
| Monorepo | pnpm workspaces + Turborepo |
| Language | TypeScript (strict) |
| Tests | Vitest — integration tests against real DB + Redis |

---

## Links

- [Architecture Decision Records](adr/) — why every major decision was made
- [CLAUDE.md](CLAUDE.md) — coding conventions, gotchas, and constraints for contributors

---

## License

[AGPL-3.0-only](LICENSE)

<!-- Badge definitions -->
[licence-badge]: https://img.shields.io/badge/License-AGPL%20v3-blue.svg
[licence]: LICENSE
[pnpm-badge]: https://img.shields.io/badge/pnpm-9.7.0-F69220?logo=pnpm&logoColor=white
[pnpm-url]: https://pnpm.io
[ts-badge]: https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white
[ts-url]: https://www.typescriptlang.org/
[node-badge]: https://img.shields.io/badge/Node.js-%E2%89%A520.6-339933?logo=nodedotjs&logoColor=white
[node-url]: https://nodejs.org/
[self-hosted-badge]: https://img.shields.io/badge/self--hosted-free-4CAF50

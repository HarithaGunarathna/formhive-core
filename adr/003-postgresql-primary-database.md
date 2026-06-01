# ADR-003: PostgreSQL as primary database

**Status:** Accepted
**Date:** 2025-01-15

## Context

The platform needs to store structured relational data (tenants, campaigns, submissions) alongside flexible schema data — form field definitions and submission payloads that vary per campaign. These two concerns pull in different directions: relational integrity vs. schema flexibility.

## Decision

PostgreSQL with JSONB columns for flexible data (form field definitions, submission payloads).

## Reasons

- JSONB handles form field definitions and submission payloads without requiring schema migrations every time a form changes
- Strong ACID guarantees for submission data — a farmer's submission must never be lost or partially written
- Drizzle ORM has excellent PostgreSQL support and generates plain SQL migrations
- Supabase provides managed PostgreSQL for development with a generous free tier
- JSONB fields can be queried with standard SQL operators — no separate query language needed

## Alternatives considered

**MongoDB** — rejected because relational integrity between tenants, campaigns, and submissions is important. Joins between these entities are simpler and safer in SQL.

**MySQL** — rejected because JSONB support is weaker than PostgreSQL; `JSON` column type in MySQL lacks the indexing and operator support PostgreSQL provides.

**SQLite** — rejected because it does not support concurrent writes from multiple service containers, which rules it out for any multi-container deployment.

## Consequences

- All flexible data (form fields, submission payloads) is stored as JSONB
- Drizzle migrations are required for any structural schema changes
- Self-hosters need a PostgreSQL instance — provided in `docker-compose.yml`
- JSONB columns are typed as `unknown` in Drizzle; explicit type assertions are needed when reading flexible fields

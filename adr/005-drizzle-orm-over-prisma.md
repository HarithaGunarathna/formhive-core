# ADR-005: Drizzle ORM over Prisma

**Status:** Accepted
**Date:** 2025-01-15

## Context

Needed a database ORM or query builder with TypeScript support, schema-based migrations, and compatibility with a monorepo where the database package is shared across multiple service containers.

## Decision

Drizzle ORM.

## Reasons

- Schema is defined in TypeScript — types are inferred directly from the schema definition, no code generation step
- SQL-close API — queries read like SQL, making them predictable and debuggable
- Migration files are plain SQL — easy to inspect, version, and run manually if needed
- Lightweight runtime — no daemon or query engine binary, which matters in a monorepo where the package is imported by five separate services
- `drizzle-kit studio` provides a visual database browser for development

## Alternatives considered

**Prisma** — rejected because it requires a code generation step (`prisma generate`) that adds complexity to every Docker build, and the Prisma query engine daemon adds memory overhead in each container. In a monorepo with five services, that daemon runs five times.

**Kysely** — considered but lacks a migration tool as complete as `drizzle-kit`. Writing migrations manually is error-prone.

**Raw SQL with postgres.js** — rejected because type safety on query results requires significant manual effort; every query return type must be declared by hand.

## Consequences

- Schema changes require `drizzle-kit generate` then `drizzle-kit migrate`
- JSONB columns are typed as `unknown` in Drizzle — explicit type assertions are needed when reading flexible fields
- All DB logic lives in `packages/db` and is shared across all services atomically

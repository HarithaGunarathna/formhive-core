# ADR-001: Monorepo with pnpm workspaces

**Status:** Accepted
**Date:** 2025-01-15

## Context

Six microservices need to share TypeScript types (`packages/types`), a database schema package (`packages/db`), and an event bus package (`packages/events`). The alternatives were a single monorepo or separate repositories per service.

## Decision

Single monorepo using pnpm workspaces and Turborepo.

## Reasons

- Shared packages are importable without publishing to npm — one file change updates all consumers atomically
- A single TypeScript compilation catches cross-service type errors before they reach production
- One CI pipeline, one lock file, one place to look for issues
- Cross-service refactors happen in a single PR with a single review
- Turborepo only rebuilds packages that changed — independent deployments are preserved without independent repos

## Alternatives considered

**Polyrepo (one repo per service)** — rejected because cross-service changes require multiple coordinated PRs, shared types need private npm publishing, and the coordination overhead is designed for multi-team organisations, not a solo developer.

**npm workspaces without Turborepo** — rejected because there is no build graph awareness; everything rebuilds on every change regardless of what changed.

## Consequences

- All services deploy independently via their own `Dockerfile`
- New services are added as `apps/` directories and follow the same scaffold
- The repository grows in a single place — easier to navigate for a solo developer

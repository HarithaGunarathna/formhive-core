# ADR-014: Account-based authentication and multi-tenancy

**Status:** Accepted
**Date:** 2026-06-05

## Context

Phase 1 used a single hardcoded tenant with a seed API key. This was intentional to defer complexity while the core engine was being built. Phase 2 requires multiple organisations to use the platform independently with complete data isolation.

Two authentication approaches were considered:
- API key only (like Phase 1, just per-tenant)
- Account name + password (like a standard web product)

The platform is open-source and self-hostable, targeting a wide range of organisations including government departments and NGOs. Not all users are developers comfortable managing API keys.

## Decision

Two-layer authentication system:

1. **UI users** authenticate with `account_name` + `password` via `POST /v1/auth/login`. The API key is managed internally and never shown after provisioning.

2. **Developer tenants** authenticate with their internal API key via `POST /v1/auth/token` for server-to-server integration.

Both flows return a JWT containing `{ tenantId, plan, accountName }`. Route handlers read `request.user.tenantId` regardless of which flow was used — the distinction is invisible to the API layer.

## Account name rules

Account names follow the pattern `^[a-z0-9_]{3,30}$`:
- Lowercase letters, numbers, and underscores only
- No spaces, hyphens, or special characters
- 3 to 30 characters
- Globally unique across all tenants

Reasons for these constraints:
- **No spaces:** prevents confusion in URLs, logs, and identifiers
- **Lowercase only:** avoids case-sensitivity bugs across systems
- **Underscore only special char:** readable, URL-safe, and unambiguous
- **Uniqueness:** account name is the human-readable tenant identifier used in logs, support requests, and future subdomain routing (e.g. `agri_ministry.formhive.com`)

Validation lives in `provisionTenant()` in `packages/db/src/provisioner.ts` and is also enforced at the API layer via Fastify JSON Schema `pattern`.

## Reasons

- Non-technical users expect a username + password flow — they do not know what an API key is and cannot recover one if lost without developer help
- Account name is more memorable and meaningful than a UUID or random key — `agri_ministry` is easier to reference in support conversations than `fh_live_3a8f...`
- Keeping the API key internal removes the risk of users accidentally exposing it through screenshots or copy-paste errors
- Two auth flows serve two distinct user types without forcing either to use an inappropriate mechanism

## Alternatives considered

**API key only for all users** — rejected because non-technical users do not understand API keys and have no recovery path without developer help.

**Email + password with no account name** — rejected because account name provides a stable, human-readable tenant identifier useful for logs, subdomains, and support. Email addresses change over time.

**OAuth / SSO** — rejected as Phase 3 scope. Can be added as an additional auth method without changing the core JWT-based system.

**Organisation name instead of account name** — rejected because organisation names contain spaces and special characters and are not unique across tenants. Account names are programmer-friendly identifiers that map to a tenant unambiguously.

## Consequences

- All tables already have `tenant_id` from Phase 1 — no schema migration needed for isolation, only for the new auth columns (`account_name`, `password_hash`)
- `DEFAULT_TENANT_ID` is removed entirely — no more hardcoding anywhere in the codebase
- `GET /v1/auth/check-account-name` enables real-time availability checking in the registration UI before form submission
- `POST /v1/auth/token` is retained for developer tenants integrating server-to-server; it is not exposed in the dashboard UI
- Migration `0003_add_password_auth.sql` sanitizes existing `name` values into valid account names via `regexp_replace(lower(name), '[^a-z0-9_]', '_', 'g')` so production data is never lost on upgrade
- **Future:** password reset flow required (Phase 3 follow-up)
- **Future:** email verification on registration (Phase 3 follow-up)
- **Future:** account name can serve as a subdomain prefix for white-labelled deployments

## Tenant isolation guarantee

Every query in every route must include `WHERE tenant_id = request.user.tenantId`. This is enforced by convention (documented in CLAUDE.md) and verified by the four tenant isolation tests in `apps/api/src/test/auth.test.ts`, which confirm that tenant A can never read tenant B's data even when both exist in the same database.

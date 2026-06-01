# ADR-008: Multi-tenancy from day one

**Status:** Accepted
**Date:** 2025-01-15

## Context

Phase 1 serves a single tenant (one government department or organisation). Multi-tenancy — where multiple organisations share one deployment — is a Phase 2 concern. The question was whether to add `tenant_id` columns to every table from the start, or retrofit them when multi-tenancy is needed.

## Decision

Add `tenant_id` as a UUID foreign key on every table from day one, hardcoded to a default tenant UUID (`00000000-0000-0000-0000-000000000001`) in Phase 1.

## Reasons

- Adding `tenant_id` to tables with live production data requires a migration that backfills existing rows — a risky, time-consuming operation that can cause downtime
- The column costs nothing in Phase 1 where it is always the same value
- Phase 2 migration becomes a one-line change: read `tenant_id` from the JWT claims instead of using the hardcoded default
- Prevents accidentally writing queries that would leak data across tenants if multi-tenancy is added later without careful review

## Alternatives considered

**Add `tenant_id` in Phase 2** — rejected because migrating live production data is significantly riskier than adding an unused column early. A `NOT NULL` column backfill on a large submissions table with live traffic is a well-known source of production incidents.

**Separate database per tenant** — rejected as operationally complex for a solo developer. A separate database per tenant requires separate connection pools, separate migration runs, and separate monitoring per tenant.

## Consequences

- Every query must include `WHERE tenant_id = ?` — enforced by convention and code review
- Default tenant UUID: `00000000-0000-0000-0000-000000000001`
- Phase 2 work: replace `DEFAULT_TENANT_ID` constant with `request.user.tenantId` from the JWT
- New tables must include `tenant_id` — enforced by the "do not skip tenant_id" rule in CLAUDE.md

# ADR-009: BYOD — three delivery modes

**Status:** Accepted
**Date:** 2025-01-15

## Context

Large organisations (government ministries, NGOs with existing data systems) will not store submission data in a third-party platform. They need validated submissions to flow automatically into their own systems. Data sovereignty is a hard requirement in many government contexts, especially in Sri Lanka and similar markets.

## Decision

Three BYOD (Bring Your Own Database) modes:

1. **Webhook push** — the platform POSTs validated submissions to a tenant-supplied endpoint
2. **Direct database write** — the tenant provides an encrypted connection string; the platform writes directly
3. **Local agent** — an open-source Docker container runs inside the tenant's network, polls the Formhive API, and writes to their internal database

## Reasons

- Webhook is the cleanest separation — the tenant owns all database logic; the platform never touches their infrastructure
- The local agent solves air-gapped and politically sensitive environments where the tenant cannot expose a public endpoint to the internet (government data sovereignty requirements)
- Direct write covers organisations that have neither a server to receive webhooks nor the ability to run a Docker container
- All three modes mean Formhive never has to hold data the tenant does not want to leave their network

## Alternatives considered

**Platform storage only, export CSV** — rejected because large organisations need automated data pipelines, not manual exports that require a human to trigger them.

**Single webhook mode only** — rejected because not all tenants can expose a public HTTPS endpoint due to firewall or security policy restrictions (common in government networks).

## Consequences

- The local agent is a separate public repository (`your-org/formhive-agent`) — open-source and auditable
- Webhook delivery needs retry logic and a failure queue (Phase 3)
- Direct write needs a connector service with encrypted credential storage (Phase 3)
- All three modes are configured via the BYOD settings UI (Phase 3)
- Phase 1 does not implement any BYOD mode — this ADR records the intended architecture

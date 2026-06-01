# ADR-007: AGPL-3.0 licence

**Status:** Accepted
**Date:** 2025-01-15

## Context

Formhive is self-hostable and open-source, but it also has a commercial cloud version at formhive.com. The licence needed to allow free self-hosting while protecting against competitors offering the platform as a managed service without contributing back.

## Decision

AGPL-3.0-only.

## Reasons

- AGPL-3.0 requires anyone who runs the software as a network service to release their modifications as open source — this is the key clause that protects against SaaS competitors
- Self-hosting and internal use are completely unrestricted
- Aligns with how Supabase, Plausible, Grafana, and other successful open-core SaaS products are licensed — the model is proven
- Protects the commercial cloud version's differentiation without restricting the community that would use and improve the self-hosted version

## Alternatives considered

**MIT** — rejected because it allows competitors to fork the code, make improvements, and run a competing managed service without contributing those improvements back.

**Apache 2.0** — same problem as MIT for network services; the licence has no network-use copyleft clause.

**Business Source Licence (BSL, used by n8n)** — rejected as more restrictive than needed (BSL prevents commercial use until a conversion date) and less familiar to the open-source community. AGPL achieves the protection goal without restricting legitimate use.

**Proprietary** — rejected because open-source is core to the adoption strategy in the government and NGO sector. Public institutions often require auditable, open-source code before deployment.

## Consequences

- All source files carry the SPDX licence header (two lines, before any imports)
- Generated files and migration SQL files are excluded from the header requirement
- Commercial customers who want to modify the code without open-sourcing changes need a commercial licence (Phase 2 business model)

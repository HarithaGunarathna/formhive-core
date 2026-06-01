# ADR-012: Push model over enumerator model

**Status:** Accepted
**Date:** 2025-01-15

## Context

Existing data collection tools (KoboToolbox, ODK) are built on the enumerator model — a trained field worker actively visits people and collects data face-to-face using a dedicated mobile app. The target users for Formhive (farmers, club officers, government department staff) are passive recipients: they will not install an app, they will not log into a portal, and they have not been trained to use a data collection tool.

## Decision

Push model — the platform sends a tokenised link to each recipient via WhatsApp, SMS, or email. The recipient clicks the link, fills a mobile-optimised web form, and submits. No app installation, no login, no training required.

## Reasons

- Removes every adoption barrier for non-technical recipients
- WhatsApp penetration in target markets (Sri Lanka and similar) exceeds 80% among smartphone users — recipients already know how to use the app
- Tokenised links (nanoid, 21 characters) provide per-recipient identity without requiring accounts or passwords
- The skip-if-submitted reminder logic means compliant recipients are never sent duplicate messages — only non-respondents receive follow-up reminders
- Significantly lower cost than face-to-face enumeration, which requires hiring, training, and managing field workers

## Alternatives considered

**Enumerator model (forking ODK)** — rejected because it requires trained field workers and a dedicated mobile app, which is exactly the friction we are trying to eliminate. The enumerator model is well-served by existing tools.

**Portal login for recipients** — rejected because creating and remembering credentials is a barrier that reduces response rates, especially among recipients who are sceptical of new technology or have low digital literacy.

## Consequences

- The form service serves public, unauthenticated routes (`/f/:token`)
- Submission tokens must be unguessable (nanoid, 21 characters) and effectively single-use
- WhatsApp Business API and SMS gateway integrations are required for production (stubs in Phase 1)
- The scheduler must track which recipients have already submitted to implement the skip-if-submitted logic
- The platform never requires recipients to create an account or remember a password

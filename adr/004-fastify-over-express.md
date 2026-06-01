# ADR-004: Fastify over Express

**Status:** Accepted
**Date:** 2025-01-15

## Context

Needed an HTTP framework for the API service and form service. The primary requirements were TypeScript support, request validation, and testability without starting a real server.

## Decision

Fastify for all HTTP services.

## Reasons

- Fastify is significantly faster than Express under load — relevant for the form service which receives submissions from many recipients
- Built-in JSON Schema validation on routes — request bodies are validated before handlers run, with no separate middleware needed
- Native TypeScript support with full type inference on request/reply objects
- Plugin system (`@fastify/jwt`, `@fastify/cors`, `@fastify/env`) covers all Phase 1 needs without extra configuration
- `app.inject()` enables HTTP integration tests without opening a real port — critical for the test strategy

## Alternatives considered

**Express** — rejected because it has no built-in request validation, is significantly slower, and TypeScript support requires additional setup (type definitions, separate body parser).

**Hono** — considered but ecosystem is smaller and `@fastify/*` plugins cover the requirements cleanly without additional work.

**NestJS** — rejected as too much abstraction and boilerplate for a solo developer. The decorator-based approach obscures the request lifecycle and makes debugging harder.

## Consequences

- `@fastify/autoload` cannot be used in apps that have Vitest tests — see ADR-011
- Route schemas must be defined in JSON Schema format, not Zod (Zod is used only at the application layer for complex transforms)
- Fastify plugins are scoped — hooks registered in a child plugin do not apply to sibling plugins unless registered at the root level

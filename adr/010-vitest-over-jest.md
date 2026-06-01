# ADR-010: Vitest over Jest

**Status:** Accepted
**Date:** 2025-02-01

## Context

Needed a test runner for a TypeScript monorepo with both Node.js backend services and a React + Vite frontend. The requirements were native TypeScript support, compatibility with the Vite build pipeline, and good performance in a monorepo.

## Decision

Vitest for all packages.

## Reasons

- Native TypeScript support — no `ts-jest` or Babel configuration needed
- Vite-compatible — the dashboard uses Vite; Vitest uses the same transform pipeline so React components render in tests without extra setup
- Compatible with Jest's API — `vi.mock()`, `expect()`, `beforeEach()`, etc. — same mental model, easier to find help online
- `pool: 'forks'` prevents `ioredis` connection conflicts between test files running in parallel (each fork gets its own connection lifecycle)

## Alternatives considered

**Jest** — rejected because TypeScript support requires `ts-jest`, which adds configuration complexity and diverges from the Vite transform pipeline. React component tests for the dashboard would require a separate Jest config that duplicates the Vite setup.

**Mocha + Chai** — rejected because the ecosystem is more fragmented (separate assertion library, separate spy library, separate coverage tool) and the API is less ergonomic than Vitest/Jest style.

## Consequences

- All test files use the `.test.ts` or `.test.tsx` extension
- Each app has its own `vitest.config.ts` rather than a root `jest.config.js`
- `fileParallelism: false` is required for integration tests that share a PostgreSQL database (prevents row-level conflicts between concurrent test files)
- Frontend component tests use `jsdom` environment; backend integration tests use `node` environment

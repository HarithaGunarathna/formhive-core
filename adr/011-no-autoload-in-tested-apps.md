# ADR-011: No @fastify/autoload in tested apps

**Status:** Accepted
**Date:** 2025-02-01

## Context

`@fastify/autoload` is a Fastify plugin that discovers and loads route files from a directory at runtime using Node's native dynamic `import()`. During testing, Vitest uses Vite's transform pipeline to handle TypeScript. When `@fastify/autoload` runs inside Vitest, it calls Node's native `import()` directly — bypassing Vite's transform pipeline — causing TypeScript route files to fail with `SyntaxError: Cannot use import statement in a module`.

## Decision

Do not use `@fastify/autoload` in any app that has Vitest tests. Register routes with explicit static imports in `app.ts` instead.

```ts
import schemaRoutes from './routes/v1/schemas/index.js'
app.register(schemaRoutes, { prefix: '/v1/schemas' })
```

## Reasons

- Static imports are resolved by Vite's transform pipeline at module load time — TypeScript is handled correctly in the test environment
- Explicit imports make the complete route structure visible in one place in `app.ts`
- The developer convenience of auto-discovery is not worth the test incompatibility

## Alternatives considered

**Keeping autoload and mocking it in tests** — rejected because mocking the route loader prevents the integration tests from exercising the actual route registration logic, which defeats their purpose.

**Switching from Vitest to Jest** — rejected because Jest has its own incompatibilities with the Vite frontend pipeline — see ADR-010.

## Consequences

- `app.ts` in `apps/api` and `apps/form` registers all routes explicitly
- New route files must be manually added to `app.ts` — there is no auto-discovery
- This limitation is documented in CLAUDE.md to prevent future regressions

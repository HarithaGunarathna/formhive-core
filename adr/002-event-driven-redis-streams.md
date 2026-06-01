# ADR-002: Event-driven architecture with Redis Streams

**Status:** Accepted
**Date:** 2025-01-15

## Context

Six services need to communicate without tight coupling. Direct HTTP calls between services would create a dependency web that makes services fragile, hard to test in isolation, and difficult to restart independently.

## Decision

All inter-service communication via Redis Streams event bus. No service makes direct HTTP calls to another service.

## Reasons

- Services are fully decoupled — the scheduler does not know the notification service exists; it only publishes an event
- Each service can be tested independently by publishing events directly to Redis and asserting DB state changes
- Redis is already a required dependency for caching — no additional infrastructure
- Streams provide persistence, consumer groups, and at-least-once delivery with the PEL (pending entry list) for crash recovery
- The stream is a natural audit trail — every event is durably stored

## Alternatives considered

**Direct HTTP calls** — rejected because it creates tight coupling, makes independent testing impossible without mocking, and introduces cascading failures when a downstream service is down.

**RabbitMQ** — rejected because it adds infrastructure complexity (a new daemon to operate) for no benefit at Phase 1 scale. Can be migrated to later if needed.

**Kafka** — rejected as significant operational overhead for a solo developer. Redis Streams provides the same delivery guarantees at this scale.

**BullMQ (Redis-based job queue)** — considered but Streams give more visibility into the event log and fit the audit trail requirement better.

## Consequences

- Event payload types must be defined in `packages/events` and kept in sync across producers and consumers
- Every service that consumes events must handle unknown event shapes gracefully (log and skip, never crash)
- The PEL must be drained on startup via `XAUTOCLAIM` to recover messages from a crashed consumer
- `ioredis` argument order for `XREADGROUP` requires `COUNT` before `BLOCK` — documented in CLAUDE.md

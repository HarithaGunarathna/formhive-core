# ADR-013: File uploads stored in object storage, not PostgreSQL

**Status:** Accepted
**Date:** 2026-06-05

## Context

XLSForm field types include `image`, `audio`, and (potentially) `video` — fields that carry binary attachments. Storing binary blobs inside the `submissions.data` JSONB column would bloat the database, slow backups and replication, and force every submission read to pull the full file payload even when only metadata is needed.

## Decision

File attachments in form submissions are stored in **object storage** — Cloudflare R2 in the managed cloud, MinIO for self-hosters. The `submissions.data` JSONB stores only the public URL of the uploaded file, never the binary itself.

Object keys follow a deterministic, tenant-prefixed pattern:

```
{tenant_id}/{campaign_id}/{submission_id}/{field_id}.{ext}
```

Example:
```
00000000-0000-0000-0000-000000000001/c1a8e9b2.../sub_xyz/photo.jpg
```

**Phasing:**
- **Phase 2:** Online upload only — the form service accepts `multipart/form-data` POSTs and streams the file to object storage before recording the URL in the submission row.
- **Phase 4:** Offline queue with sync — the mobile-optimised form caches uploads in IndexedDB and replays them when connectivity returns.

## Reasons

- **PostgreSQL is the wrong tool for blobs.** A few hundred 2 MB images turn a small operational database into a multi-gigabyte one. Backups, restores, and replication all slow down proportionally, even though only a tiny fraction of queries actually need the binary.
- **Tenant isolation by path prefix.** Putting `tenant_id` first in the object key makes per-tenant ACL policies and tenant deletion trivial — drop the prefix, all the tenant's files are gone.
- **R2 has no egress fees.** Recipients and dashboard users frequently re-download submission images for review. Egress-charged providers (AWS S3) would make this prohibitively expensive at scale; R2 charges only for storage.
- **MinIO is S3-compatible.** Self-hosters run a single Docker container that exposes the same API. One client implementation works against both production and self-hosted targets.
- **Deterministic keys are debuggable.** An operator can locate any file directly from the submission row alone — no separate file metadata table to consult.

## Alternatives considered

**PostgreSQL `bytea` or large objects** — rejected. Both bloat the database, slow operational tasks (vacuum, restore, replication), and force the entire binary through the network even when only the URL is needed.

**AWS S3 directly for the managed cloud** — rejected because S3's egress fees become a significant cost when submission images are viewed repeatedly. S3 remains a supported option for self-hosters who already have AWS infrastructure; the client interface is identical.

**Local filesystem on the form service container** — rejected. Files do not survive container restarts, are not shared between replicas, and are not backed up. Acceptable only for a single-node throwaway deployment.

**Per-tenant signed-URL upload directly from the browser** — considered for a future iteration. It removes the form service from the upload path entirely but requires more complex credential issuance and CORS configuration. Deferred to Phase 3.

## Consequences

- The form service gains a multipart body parser and an S3-compatible object storage client. File-size and MIME-type limits are enforced before the upload reaches object storage.
- `submissions.data` for an `image` field looks like `{ "photo": "https://files.formhive.com/<key>" }` — the validator schema for `image`/`audio` fields expects a string URL, not a binary.
- Self-hosters need an S3-compatible bucket. A MinIO container is added to `docker-compose.yml` as Phase 2 work so the default install remains single-command.
- Deleting a tenant or campaign requires a bulk object-storage prefix deletion in addition to the SQL cascade — captured as a cleanup job.
- Phase 4's offline mode requires an IndexedDB queue on the form client and a deduplicating sync endpoint on the form service. The deterministic key pattern (`submission_id` + `field_id`) makes idempotency on retry straightforward — same key, same content, safe to re-upload.

# ADR 0001: PostgreSQL metadata and private object storage

- Status: Accepted
- Date: 2026-07-14

## Context

The recovered application currently persists one JSON state file and writes uploads to local disk. That works for local recovery but not on Vercel: functions are stateless, instances run concurrently, and the filesystem is ephemeral. The product needs structured route/member/site relationships, evidence traceability, versioned reports, and protected photos and audio.

## Decision

Use a modular Node application with PostgreSQL as the source of truth for metadata and private S3-compatible object storage for binary media. Supabase is the recommended initial provider because it provides managed PostgreSQL, Auth, RLS and Storage in one operational boundary. Vercel functions connect through a pooled database URL.

The browser never receives the database service key. Upload authorization and signed download URLs are issued by the API. Every business row is scoped to a group, directly or through an assignment. RLS verifies authenticated group membership. Reports are immutable versions derived from editable drafts.

## Alternatives

- Keep JSON and local uploads: simplest locally, but loses writes and media on Vercel and cannot safely handle concurrent updates.
- Store files as PostgreSQL bytea: transactional but expensive, increases backups and makes media delivery inefficient.
- Split into multiple services: adds queues, deployments and observability without value at current scale.

## Consequences

- Production requires a database migration, a private bucket and four environment variables.
- Local JSON remains a development adapter and recovery fixture, not a production datastore.
- Database backups cover metadata; bucket versioning/lifecycle rules cover binaries.
- Uploads should become presigned direct-to-storage uploads before large field use. The current multipart endpoint is retained for local development only.

## Failure handling

- Reject writes when database/storage configuration is absent in production.
- Compute SHA-256 to make upload retries idempotent and detect duplicates.
- Create the evidence row only after object upload succeeds, or mark it `pending` and reconcile asynchronously.
- Use immutable report versions so failed generation never replaces the last reviewable version.

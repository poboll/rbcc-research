# Database and media architecture

## Production topology

```text
React/Vite browser
  -> Vercel Node API (auth, validation, Agent, DOCX)
       -> pooled PostgreSQL (metadata, workflow, report versions)
       -> private object storage (photos, audio, documents)
       -> DeepSeek API (evidence-grounded synthesis only)
```

The backend remains one deployable modular application. `src/server/` owns domain behavior; storage adapters are the only environment-specific layer.

## Data ownership

- `groups`, `members`, `group_members`: identity and authorization boundary.
- `routes`, `route_members`, `sites`, `route_stops`, `assignments`: the Day 1-3 plan and each member's responsibility.
- `research_questions`, `evidence_records`, `problems`, `solutions`: evidence chain from hypothesis to validated proposal.
- `report_drafts`, `report_versions`: editable working copy and immutable review snapshots.
- `knowledge_documents`, `collaboration_tasks`, `collaboration_updates`, `agent_messages`: shared knowledge and collaboration history.
- `media_objects`: storage metadata only; never stores file bytes.

The executable schema is in `supabase/migrations/0001_initial_schema.sql`.

## Photo and audio object keys

Use private objects with stable, non-personally-readable keys:

```text
groups/{group_id}/members/{member_id}/sites/{site_id}/{yyyy}/{mm}/{uuid}.{ext}
```

`media_objects` records bucket, object key, original filename, MIME type, bytes, SHA-256, image dimensions or audio duration, upload status and creation time. `evidence_records` holds captions, transcript/text, capture time, member, assignment and workflow status.

Recommended controls:

1. Allow only an explicit MIME list and 25 MB maximum at both API and bucket policy.
2. Verify magic bytes server-side; do not trust browser MIME or extension.
3. Use a private bucket and signed URLs with a 5-15 minute lifetime.
4. Strip image EXIF GPS unless the team explicitly needs location evidence.
5. Hash files and make `(group, sha256)` retries idempotent.
6. Keep originals immutable; derived thumbnails/transcripts use separate object keys.
7. Enable bucket versioning and a lifecycle rule for abandoned `pending` uploads.

## Request flows

### Field upload

1. Member selects assignment and records text/caption.
2. API verifies group membership and assignment ownership.
3. API issues a presigned upload target with a canonical object key.
4. Browser uploads directly to the private bucket.
5. Browser confirms upload; API verifies metadata and inserts evidence/media rows in one transaction.
6. Collaboration feed publishes the new evidence reference.

### Ten-thousand-character report

1. API loads assignment, questions, evidence, problems, linked solutions and knowledge documents.
2. It constructs four evidence packets: situation, empathy, pain points and proposals.
3. DeepSeek generates one bounded block at a time and may cite only supplied record IDs.
4. The API validates structure and citations, merges blocks and stores a new immutable version.
5. Review reads the versioned JSON; DOCX is generated on demand from the same version.

## Vercel behavior

`api/index.mjs` is a serverless compatibility entry. When `BLOB_READ_WRITE_TOKEN` is available, media/DOCX objects and the current JSON state are persisted in private Vercel Blob. This makes the deployed workflow usable before the PostgreSQL migration, but JSON state uses whole-document writes and can lose concurrent edits. PostgreSQL remains the production target for multi-user field operation. Without Blob or database configuration, functions run seeded data in volatile memory. Vercel local disk and `/tmp` are never authoritative storage.

Required environment variables:

```text
DATABASE_URL                 pooled PostgreSQL URL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY   server only
SUPABASE_STORAGE_BUCKET     rbcc-private-media
BLOB_READ_WRITE_TOKEN       automatically injected by the linked Vercel Blob store
DEEPSEEK_API_KEY            rotate the key exposed in chat before use
DEEPSEEK_MODEL              deepseek-v4-flash
```

## Backup and operations

- Daily PostgreSQL backups with point-in-time recovery during the event window.
- Bucket versioning plus a daily inventory of object keys referenced by `media_objects`.
- Structured logs include request ID, group ID, route/assignment ID and duration, never API keys or raw transcripts.
- Alert on upload failure rate, report generation latency, database saturation and orphan object count.

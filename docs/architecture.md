# Architecture notes

## Current request flow

```text
Browser
  |
  v
Next.js App Router
  |-- /api/playlist/preview  -> URL and bitrate validation (no provider fetch yet)
  |-- /api/health            -> database configuration/connectivity status
  |
  v
MongoDB / Mongoose
  |-- DownloadJob schema (foundation only; not yet used by a job API)
```

## Download job model

The model records the anonymous owner's **token hash**, never the raw ownership token. Job APIs generate a cryptographically random token, store only its hash, and verify ownership for history. Future cancellation and download requests must perform the same owner check. Do not use a public job ID alone as authorization.

Jobs support queued/processing/completed/failed/cancelled states, per-track progress, a selected bitrate, and an optional expiry date. Assign expiry only after a job reaches a terminal state. MongoDB TTL deletion removes the document, not generated files; a worker must remove local/object-storage files separately.

## Provider and media boundary

Provider metadata integrations must use official or otherwise permitted interfaces. A provider adapter returning track metadata is not permission to download the audio. Media processing must accept only authorized downloadable source files and must not bypass DRM, authentication, or platform access restrictions.

## Before production

- Add rate limiting and request-size limits.
- Add anonymous owner-token creation, hashing, secure cookie handling, and job-level authorization.
- The internal worker route supports lease-based claim, heartbeat, and bounded retry. Add a separately deployed trusted worker runtime, cancellation, concurrency limits, and resource quotas.
- Add SSRF defenses before any server-side URL fetch: DNS/IP validation, redirect revalidation, outbound network controls, timeouts, and response-size caps.
- Add a storage cleanup worker that removes physical files and archives.
- Add automated tests and CI, then verify a production build before deployment.

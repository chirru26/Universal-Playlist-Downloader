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


Job cancellation: `DELETE /api/jobs/:jobId` verifies the anonymous owner cookie and only cancels jobs in `queued` or `processing` state. It clears the worker lease so a worker can no longer heartbeat that job. Cancellation does not stop external media work already running; a future worker must check lease validity and cancellation state before publishing outputs.


## Authorized audio upload intake

`POST /api/uploads` accepts a user-provided audio file up to 25 MB, checks the file signature against a small supported-format list, stores it under a cryptographically random filename in `AUTHORIZED_UPLOAD_DIR`, and creates an `authorized-upload` job. The directory must be private and shared by the Next.js server and the trusted worker. The worker claim API deliberately only claims these upload jobs; it will not claim YouTube, Spotify, or SoundCloud playlist URL jobs. Upload intake does not yet convert audio or expose a download URL. A future worker must validate files more deeply, convert only authorized inputs, report progress, create outputs in private storage, and provide owner-checked download endpoints. Serverless deployments require a private object-storage adapter instead of a local shared directory.

# Architecture notes

## Main request flows

### Playlist metadata preview

\`\`\`text
Browser
  -> POST /api/playlist/metadata
  -> YouTube Data API or Spotify Web API (metadata only)
  -> Browser renders playlist title and paginated track metadata
\`\`\`

YouTube and Spotify playlist URLs are metadata/official-link inputs only. They are never queued as audio download jobs, and the app does not scrape protected media streams.

### Jamendo catalog downloads

\`\`\`text
Browser
  -> GET /api/jamendo/search?q=...
  -> Jamendo v3 tracks API
  -> Browser displays search results and download permission

Browser clicks Download MP3
  -> GET /api/jamendo/tracks/:trackId/download
  -> Server re-checks audiodownload_allowed and validates Jamendo CDN URL
  -> 302 redirect to the Jamendo-authorized download resource
\`\`\`

The \ `JAMENDO_CLIENT_ID` is kept server-side. A track is downloadable only if Jamendo's latest response explicitly allows it and provides an accepted HTTPS download URL. The UI includes Jamendo track and license links when provided. A download flag is not a blanket grant for commercial reuse; users must follow the listed license and attribution terms.

### Authorized media conversion

\`\`\`text
User uploads audio or eligible MP4/WebM they own/are authorized to process
  -> POST /api/uploads (signature checks, 25 MB audio / 100 MB video limit)
  -> Private AUTHORIZED_UPLOAD_DIR + MongoDB queued job
  -> Separate worker polls /api/internal/worker with WORKER_API_SECRET
  -> FFprobe duration estimate and FFmpeg MP3 conversion
  -> Worker reports progress and completes the leased job
  -> Owner-authenticated GET /api/jobs/:jobId/download streams the MP3
\`\`\`

For eligible videos uploaded to the user's own YouTube channel, YouTube Studio or Google Takeout can provide a video file. The user uploads that MP4 to TuneFetch for audio conversion. The workflow cannot download other people's videos or extract audio directly from arbitrary YouTube playlist URLs.

## Worker and job ownership

- Anonymous job ownership uses a cryptographically random browser token in an HttpOnly cookie. MongoDB stores only its SHA-256 hash.
- Every job history, cancellation, and completed download lookup verifies the owner token. A public job ID alone is not authorization.
- The internal worker API requires a server-only \ `WORKER_API_SECRET` bearer token.
- Job claiming uses a short lease. Heartbeats renew the lease and update progress; failures are retried a bounded number of times.
- The worker claims only \ `authorized-upload` jobs and uses \ `spawn` with explicit FFmpeg arguments rather than invoking a shell.
- The app and worker must share a private filesystem directory. Serverless deployments need a private object-storage adapter instead.
- MongoDB TTL removes expired job documents, not stored media files. An automated cleanup worker is still required.

## Security and production requirements

- Add rate limiting, per-user quotas, concurrency controls, upload storage quotas, and automated cleanup of expired/orphaned files.
- Basic file signatures and extension checks are not malware scanning or deep media validation. Keep uploaded files private and run the worker with minimal system privileges.
- Do not expose provider client IDs, worker secrets, owner tokens, or storage paths in client-side code.
- If introducing arbitrary server-side URL fetches, reject private/reserved IP ranges and revalidate DNS/IPs after every redirect; enforce HTTPS, timeouts, content-type and byte limits, and outbound network controls.
- Do not bypass DRM, authentication, paywalls, or platform access controls.
- Run typecheck, lint, integration tests, and a production build before deployment; verify the worker and shared storage on the target host.

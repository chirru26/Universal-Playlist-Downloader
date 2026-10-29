# TuneFetch — Universal Playlist Downloader

A privacy-conscious, anonymous playlist workflow built with Next.js, TypeScript, Tailwind CSS, and MongoDB.

> **Current status:** The app includes YouTube/Spotify metadata preview, Jamendo catalog search, permission-checked MP3 downloads for Jamendo tracks, and an FFmpeg worker that converts authorized audio uploads or eligible MP4/WebM files to MP3. YouTube and Spotify playlist URLs themselves remain metadata-only; for your own eligible YouTube uploads, download the MP4 from YouTube Studio and upload it to TuneFetch for conversion. Jamendo search/download requires a `JAMENDO_CLIENT_ID`. The worker requires a self-hosted app and worker sharing private storage, MongoDB, FFmpeg, and FFprobe. SoundCloud metadata, ZIP downloads, and automated storage cleanup remain unimplemented.

## Stack

- Next.js App Router, React, TypeScript
- Tailwind CSS v4
- Zod request validation
- MongoDB + Mongoose
- Official metadata API integrations: YouTube Data API and Spotify Web API (credentials required)
- Jamendo v3 catalog search with per-track `audiodownload_allowed` checks and a server-side permission recheck before download
- Separate Node.js worker using FFmpeg/FFprobe for authorized audio uploads and MP4/WebM videos
- Owner-checked individual MP3 downloads; ZIP archives and automated storage cleanup remain planned

## Requirements

- Node.js 20.9+ (use a currently supported LTS release)
- npm and Git
- MongoDB local instance or MongoDB Atlas connection string for database-backed features
- YouTube Data API key and/or Spotify developer credentials to enable those metadata adapters
- Jamendo API client ID for its searchable catalog and permitted track downloads (create one at https://devportal.jamendo.com/)

## Run locally

1. Clone the repository:

   ```bash
   git clone https://github.com/chirru26/Universal-Playlist-Downloader.git
   cd Universal-Playlist-Downloader
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env.local` and fill in the credentials you have. Keep credentials private; never commit `.env.local`. Set `JAMENDO_CLIENT_ID` for Jamendo catalog search. For authorized file uploads, configure `AUTHORIZED_UPLOAD_DIR` as a private directory shared by the Next.js server and worker. This local-volume approach is for self-hosted deployments, not serverless hosting. Install FFmpeg and FFprobe on the worker host. Set `WORKER_APP_URL` to the deployed app URL, and configure the same `WORKER_API_SECRET` and `AUTHORIZED_UPLOAD_DIR` on both app and worker hosts.

   - macOS/Linux: `cp .env.example .env.local`
   - Windows PowerShell: `Copy-Item .env.example .env.local`

4. Start the app:

   ```bash
   npm run dev
   ```

5. Open http://localhost:3000.
   - `/api/health` reports database configuration/connectivity.
   - The homepage Preview button calls `POST /api/playlist/metadata`.
   - `POST /api/playlist/provider` detects supported provider URL formats without fetching them.
   - `GET /api/jamendo/search?q=...` searches the Jamendo catalog. `GET /api/jamendo/tracks/:trackId/download` checks that the artist allows downloading before redirecting to Jamendo’s download URL. `POST /api/uploads` accepts supported user-provided audio or video files, checks basic file signatures, and queues authorized conversion jobs. `GET /api/jobs/:jobId/download` streams completed MP3s only to the owning browser.

## Run the background worker

The worker is a separate long-running Node.js process. It does not run inside a serverless request:

1. Install Node.js 20.9+ and install FFmpeg/FFprobe on the worker host. Verify `ffmpeg -version` and `ffprobe -version`.
2. Make the same private `AUTHORIZED_UPLOAD_DIR` volume available to both the Next.js app and the worker. Restrict directory access to those services.
3. On the app, configure `MONGODB_URI`, `WORKER_API_SECRET`, and `AUTHORIZED_UPLOAD_DIR`. On the worker host, set those same values plus `WORKER_APP_URL` to the deployed app's origin. Optional: `WORKER_POLL_MS`, `FFMPEG_PATH`, and `FFPROBE_PATH`.
4. Start the worker from the repository checkout with:

   ```bash
   npm run worker
   ```

Keep the worker running under your host's process supervisor. Do not expose the worker secret to browser/client variables. The worker only processes user-uploaded authorized media; it never downloads a YouTube or Spotify playlist URL. For eligible videos that you uploaded to your own YouTube channel, YouTube Studio can provide an MP4; upload that file here for audio conversion. Other users’ videos are not supported by this workflow. Automated cleanup for expired files and ZIP downloads are still outstanding, so configure storage quotas and clean up orphaned/expired files before production use.

## API credentials

- **YouTube:** enable the YouTube Data API v3 for a Google Cloud project and set `YOUTUBE_DATA_API_KEY`.
- **Spotify:** create an app in the Spotify developer dashboard and set `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`.
- **Jamendo:** register an app in the [Jamendo developer portal](https://devportal.jamendo.com/) and set `JAMENDO_CLIENT_ID`. The UI only shows a download action when the track metadata says the artist allows downloads; the server checks this permission again at download time.
- Do not expose these credentials in client-side code or commit them to Git.
- Metadata API access is subject to each provider's current access rules, quotas, and terms.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript check

## Roadmap

1. [x] Next.js scaffold and responsive landing page
2. [x] URL/bitrate validation and provider detection
3. [x] YouTube playlist metadata adapter foundation
4. [x] Spotify playlist/album metadata adapter foundation
5. [x] Metadata preview UI
6. [x] MongoDB connection utility, job model, health endpoint
7. [x] Provider metadata pagination controls; [ ] integration tests
8. [ ] SoundCloud metadata adapter using permitted access
9. [x] Anonymous owner tokens, job APIs, access checks, and cancellation
10. [x] Worker queue, cancellation, authorized upload intake, FFmpeg conversion/progress, and owner-authenticated MP3 downloads
11. [x] Jamendo search and downloads with artist permission checks; YouTube-own-upload MP4-to-MP3 workflow
12. [ ] ZIP generation, secure storage cleanup, rate limits, integration tests, CI verification, and deployment

## Responsible-use boundaries

Metadata access does not grant permission to download a platform's audio. Integrations must respect provider APIs, terms, copyright, and access restrictions. The application must not bypass DRM, authentication, paywalls, or other access controls. Only process media the user owns or is authorized to download.

## Security notes

- Provider API credentials are read server-side only.
- Jamendo tracks are offered for download only when `audiodownload_allowed` is `true` and an HTTPS download URL is present. The download route re-fetches the track record to re-check permission and allows only Jamendo storage hosts.
- The YouTube workflow does not extract audio from playlist URLs. It points owners to YouTube Studio for eligible videos they uploaded, then accepts the downloaded MP4 for the existing FFmpeg conversion pipeline.
- The preview endpoint does not download audio.
- The internal worker endpoint requires a server-only `WORKER_API_SECRET` bearer token and provides claim, heartbeat/progress, completion, and failure/retry actions. It only claims `authorized-upload` jobs, never provider playlist URLs. The worker uses `spawn` with explicit FFmpeg arguments (no shell), validates private storage keys, and serves outputs only after checking the anonymous owner token. The upload endpoint checks extension and basic file signatures, but it is not a malware scanner. Uploaded and converted files are private and must be stored in a directory accessible only to the app and trusted worker. Configure backups, quotas, rate limiting, and automated file cleanup before a public production launch.
- Before any arbitrary server-side URL fetching, implement DNS/IP checks, redirect revalidation, outbound network controls, timeouts, and response-size limits.
- The job model includes an owner-token hash field; job routes must generate random tokens, hash them, and verify ownership for every operation.
- MongoDB TTL indexes delete documents, not files. A cleanup worker must remove files from local/object storage.
- Do not deploy publicly until rate limits, job isolation, quotas, download authorization, cleanup, and tests are in place.

# TuneFetch — Universal Playlist Downloader

A privacy-conscious, anonymous playlist workflow built with Next.js, TypeScript, Tailwind CSS, and MongoDB.

> **Current status:** The app has a responsive UI, URL/provider detection, a metadata API foundation for YouTube playlists and Spotify playlists/albums, a MongoDB connection layer, a download-job model, a health endpoint, and CI configuration. Provider metadata calls require your own API credentials. SoundCloud metadata, actual background processing, audio conversion, and actual downloads are not implemented yet. A protected worker queue API now supports job claiming, lease renewal, and bounded retries; it does not process media itself. Anonymous job creation and history are now persisted when MongoDB is configured; saved jobs remain queued until a worker is added.

## Stack

- Next.js App Router, React, TypeScript
- Tailwind CSS v4
- Zod request validation
- MongoDB + Mongoose
- Official metadata API integrations: YouTube Data API and Spotify Web API (credentials required)
- Planned: worker queue, authorized media processing, ZIP archives, secure temporary/object storage

## Requirements

- Node.js 20.9+ (use a currently supported LTS release)
- npm and Git
- MongoDB local instance or MongoDB Atlas connection string for database-backed features
- YouTube Data API key and/or Spotify developer credentials to enable those metadata adapters

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

3. Copy `.env.example` to `.env.local` and fill in the credentials you have. Keep credentials private; never commit `.env.local`.

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
   - `POST /api/jobs` saves a playlist request to anonymous job history; `GET /api/jobs` lists jobs for the browser’s owner cookie. Both require MongoDB for persistence.

## API credentials

- **YouTube:** enable the YouTube Data API v3 for a Google Cloud project and set `YOUTUBE_DATA_API_KEY`.
- **Spotify:** create an app in the Spotify developer dashboard and set `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`.
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
7. [ ] Pagination controls and integration tests
8. [ ] SoundCloud metadata adapter using permitted access
9. [x] Anonymous owner tokens, job APIs, and access checks
10. [x] Worker queue claim/lease/retry API foundation; [ ] worker runtime, cancellation, and secure temporary storage
11. [ ] Individual downloads and ZIP generation for authorized audio sources
12. [ ] Rate limits, quotas, cleanup, tests, CI verification, and deployment

## Responsible-use boundaries

Metadata access does not grant permission to download a platform's audio. Integrations must respect provider APIs, terms, copyright, and access restrictions. The application must not bypass DRM, authentication, paywalls, or other access controls. Only process media the user owns or is authorized to download.

## Security notes

- Provider API credentials are read server-side only.
- The preview endpoint does not download audio.
- The internal worker endpoint requires a server-only `WORKER_API_SECRET` bearer token and provides claim, heartbeat, and failure/retry actions. It is queue infrastructure only, not an audio downloader.
- Before any arbitrary server-side URL fetching, implement DNS/IP checks, redirect revalidation, outbound network controls, timeouts, and response-size limits.
- The job model includes an owner-token hash field; job routes must generate random tokens, hash them, and verify ownership for every operation.
- MongoDB TTL indexes delete documents, not files. A cleanup worker must remove files from local/object storage.
- Do not deploy publicly until rate limits, job isolation, quotas, download authorization, cleanup, and tests are in place.

# TuneFetch — Universal Playlist Downloader

A privacy-conscious, anonymous playlist workflow built with Next.js, TypeScript, Tailwind CSS, and MongoDB.

> **Current status:** Milestone 2 adds the Mongoose connection layer, a download-job model, and a health endpoint. Playlist provider adapters, real metadata retrieval, background processing, audio conversion, and downloads are not implemented yet.

## Stack

- Next.js App Router, React, TypeScript
- Tailwind CSS v4
- Zod request validation
- MongoDB + Mongoose
- Planned: worker queue, FFmpeg for authorized files, ZIP archives, secure temporary/object storage

## Requirements

- Node.js 20.9+ (use a currently supported LTS release)
- npm and Git
- MongoDB local instance or a MongoDB Atlas connection string for database features

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

3. Copy `.env.example` to `.env.local` and set `MONGODB_URI` to your local or Atlas database. Keep credentials private; never commit `.env.local`.

   - macOS/Linux: `cp .env.example .env.local`
   - Windows PowerShell: `Copy-Item .env.example .env.local`

4. Start the app:

   ```bash
   npm run dev
   ```

5. Open http://localhost:3000. Check `/api/health` for database configuration/connectivity status.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript check

## Roadmap

1. [x] Next.js scaffold and responsive landing page
2. [x] URL/bitrate validation endpoint (no media fetching)
3. [x] MongoDB connection utility, job model, health endpoint
4. [ ] Provider-specific metadata adapters using permitted APIs
5. [ ] Anonymous owner tokens, job APIs, and access checks
6. [ ] Worker queue, retries, cancellation, and secure temporary storage
7. [ ] Individual downloads and ZIP generation for authorized audio sources
8. [ ] Rate limits, quotas, cleanup, tests, CI, and deployment

## Responsible-use boundaries

Metadata access does not grant permission to download a platform's audio. Integrations must respect provider APIs, terms, copyright, and access restrictions. The application must not bypass DRM, authentication, paywalls, or other access controls. Only process media the user owns or is authorized to download.

## Security notes

- The preview endpoint validates URLs but does not fetch them. A hostname allowlist alone is not a complete SSRF defense.
- Before server-side fetching, implement DNS/IP checks, redirect revalidation, outbound network controls, timeouts, and response-size limits.
- The job model stores an owner token hash field, not a raw token. Job routes must generate random tokens, hash them, and verify ownership for every operation.
- MongoDB TTL indexes delete documents, not files. A cleanup worker must remove files from local/object storage.
- Do not deploy publicly until rate limits, job isolation, quotas, download authorization, cleanup, and tests are in place.

# TuneFetch — Universal Playlist Downloader

A privacy-conscious, anonymous playlist and authorized-audio workflow built with Next.js, TypeScript, and Tailwind CSS.

> **Current status:** Milestone 1 scaffold and responsive UI. Playlist provider adapters, database persistence, background jobs, audio conversion, and downloads are not implemented yet. The preview endpoint validates input and intentionally does not fetch or download media.

## Stack

- Next.js App Router + React + TypeScript
- Tailwind CSS v4
- Zod request validation
- MongoDB/Mongoose and a background worker are planned for later milestones

## Requirements

- Node.js 20.9 or newer (use a current supported LTS release)
- npm
- Git

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

3. Create a local environment file:

   - macOS/Linux: `cp .env.example .env.local`
   - Windows PowerShell: `Copy-Item .env.example .env.local`

   MongoDB is not required for this initial UI milestone. It will be needed when persistence is introduced.

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open http://localhost:3000.

## Available scripts

- `npm run dev` — start development server
- `npm run build` — production build
- `npm run start` — run production server after building
- `npm run lint` — run ESLint
- `npm run typecheck` — run TypeScript checks

## Roadmap

1. [x] Initialize project structure and responsive landing page
2. [x] Add URL and bitrate validation endpoint (no media fetching)
3. [ ] Add provider-specific metadata adapters using permitted APIs
4. [ ] Add MongoDB models, anonymous job ownership, and retention rules
5. [ ] Add queue/worker infrastructure and secure temporary storage
6. [ ] Support conversion/downloads only for audio sources the user owns or is authorized to download
7. [ ] Add ZIP generation, progress tracking, rate limits, and cleanup
8. [ ] Add automated tests, CI, deployment configuration, and operational documentation

## Responsible-use boundaries

Platform APIs, terms, copyright, and download permissions vary. Metadata support does not imply permission to download a platform's audio. The app must not bypass DRM, paywalls, authentication, or access controls. Implementations should only process media from authorized sources and should respect each provider's terms and applicable law.

## Security notes

- Never commit `.env.local` or credentials.
- The preview endpoint validates the request and only accepts HTTPS URLs on a small host allowlist.
- This allowlist is input validation, not a complete SSRF defense; any future server-side fetching must include DNS/IP checks, redirect revalidation, timeouts, response-size limits, and outbound network controls.
- Before public deployment, add rate limiting, anonymous job isolation, file quotas, download authorization, and physical temporary-file cleanup. MongoDB TTL indexes alone do not delete files from disk or object storage.

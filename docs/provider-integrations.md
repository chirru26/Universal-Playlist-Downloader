# Provider integration notes

## Current behavior

- The provider URL utility performs local parsing and identifies supported YouTube, Spotify, and SoundCloud URL shapes.
- YouTube Data API and Spotify Web API adapters return permitted playlist/album metadata only. Their metadata does not grant a right to download platform audio.
- Jamendo has a server-side catalog search adapter at `GET /api/jamendo/search?q=...`. It returns track metadata, the public track page, license URL when supplied, and a download-enabled flag.
- Jamendo download requests go through `GET /api/jamendo/tracks/:trackId/download`. The server re-queries Jamendo immediately before download and only redirects when `audiodownload_allowed === true`, a valid HTTPS download URL exists, and the URL targets a Jamendo storage host.
- Authorized uploads are processed by the separately deployed FFmpeg worker. The worker accepts only `authorized-upload` jobs; it never claims YouTube, Spotify, or SoundCloud playlist URLs.

## Provider notes

- **Jamendo:** Set `JAMENDO_CLIENT_ID` server-side. Only display a Download MP3 action when Jamendo's `audiodownload_allowed` field is true. Re-check at download time because artist permission may change. Respect the track's license and any attribution/non-commercial requirements; a download permission is not a blanket commercial-use license.
- **Spotify:** Use the official developer API for permitted metadata. Do not extract or provide audio downloads from Spotify URLs.
- **YouTube / YouTube Music:** Use the official YouTube Data API for permitted metadata. Do not scrape or extract protected streams. For videos uploaded by the app user, direct them to YouTube Studio or Google Takeout where eligible; they can upload an eligible MP4 to TuneFetch for FFmpeg audio conversion. This workflow does not support videos belonging to other users.
- **SoundCloud:** Metadata integration is not implemented. If added, use supported APIs or creator-authorized download links where available and follow current platform terms.
- **Direct uploads:** The upload endpoint accepts supported audio files and MP4/WebM videos when the user owns or is authorized to process them. The worker uses FFmpeg to create MP3 output.

## Required before production

- Add rate limiting and usage quotas to public search and upload endpoints.
- Enforce storage limits and clean up expired/orphaned input and output files. MongoDB TTL removes job documents, not physical files.
- Keep provider client IDs and other credentials server-side.
- If adding arbitrary server-side URL fetching, resolve DNS and reject loopback, private, link-local, multicast, and reserved IP ranges (including IPv4-mapped IPv6); revalidate redirects and destinations; enforce HTTPS, timeouts, byte limits, MIME checks, and outbound network controls.
- Continue to reject DRM bypass, credential sharing, scraping protected media streams, and platform URL inputs as worker jobs.

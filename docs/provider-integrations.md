# Provider integration plan

## Current behavior

The provider utility performs local URL parsing only. It does not make outbound requests, scrape pages, extract media URLs, or download audio. The API can identify known hosts and infer a link category from the URL shape, but that inference is not verified metadata.

## Adapter contract (planned)

Each provider adapter should implement a common interface such as:

- `id`: stable provider identifier
- `isConfigured()`: report whether required server-side credentials exist
- `getPlaylistMetadata(url)`: return normalized title, tracks, artists, durations, and artwork through an approved API
- `getAuthorizedAudioSource(track)`: only return a source when the provider or user explicitly permits downloading that audio

Metadata lookup and audio-download authorization must remain separate capabilities.

## Provider notes

- **Spotify:** use Spotify's official developer APIs for permitted metadata; API access does not provide a general right to download tracks as MP3.
- **YouTube / YouTube Music:** use approved YouTube APIs for permitted metadata. Do not scrape or extract protected streams.
- **SoundCloud:** use supported APIs or creator-authorized download links where available. Availability and permissions depend on the track and current platform terms.
- **Direct audio:** a future adapter may accept direct files only after SSRF protections and content validation are implemented.

## Required before server-side URL fetching

- Resolve DNS and reject loopback, private, link-local, multicast, and reserved IP ranges (including IPv4-mapped IPv6).
- Revalidate every redirect and final destination.
- Enforce HTTPS, timeouts, byte limits, MIME checks, and outbound network controls.
- Do not send internal credentials or cookies to provider URLs.

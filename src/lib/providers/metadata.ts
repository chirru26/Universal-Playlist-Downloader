import type { ProviderId } from "@/lib/providers";

export type NormalizedTrack = {
  providerTrackId: string;
  title: string;
  artist: string;
  durationSeconds?: number;
  artworkUrl?: string;
};

export type PlaylistMetadata = {
  provider: ProviderId;
  title: string;
  tracks: NormalizedTrack[];
  nextPageToken?: string;
  totalTracks?: number;
};

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_CONFIGURED" | "INVALID_LINK" | "UPSTREAM_ERROR" | "RATE_LIMITED",
    public readonly httpStatus = 502,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

function safeArtworkUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  if (response.status === 429) {
    throw new ProviderError("The provider rate limit was reached. Please retry later.", "RATE_LIMITED", 429);
  }
  if (!response.ok) {
    throw new ProviderError("The provider could not return playlist metadata.", "UPSTREAM_ERROR", 502);
  }
  return (await response.json()) as Record<string, unknown>;
}

export async function getYoutubePlaylistMetadata(input: URL, pageToken?: string): Promise<PlaylistMetadata> {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY;
  if (!apiKey) throw new ProviderError("YouTube metadata is not configured on this server.", "NOT_CONFIGURED", 503);

  const playlistId = input.searchParams.get("list");
  if (!playlistId || input.hostname === "youtu.be") {
    throw new ProviderError("Provide a YouTube playlist URL containing a playlist ID.", "INVALID_LINK", 400);
  }

  const playlistApi = new URL("https://www.googleapis.com/youtube/v3/playlists");
  playlistApi.searchParams.set("part", "snippet,contentDetails");
  playlistApi.searchParams.set("id", playlistId);
  playlistApi.searchParams.set("key", apiKey);

  const itemsUrl = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  itemsUrl.searchParams.set("part", "snippet,contentDetails");
  itemsUrl.searchParams.set("playlistId", playlistId);
  itemsUrl.searchParams.set("maxResults", "50");
  itemsUrl.searchParams.set("key", apiKey);
  if (pageToken) itemsUrl.searchParams.set("pageToken", pageToken);

  const [playlistData, itemData] = await Promise.all([
    fetch(playlistApi, { signal: AbortSignal.timeout(8000), cache: "no-store" }).then(readJson),
    fetch(itemsUrl, { signal: AbortSignal.timeout(8000), cache: "no-store" }).then(readJson),
  ]);

  const playlistItems = Array.isArray(playlistData.items) ? playlistData.items as Record<string, unknown>[] : [];
  const playlistSnippet = (playlistItems[0]?.snippet ?? {}) as Record<string, unknown>;
  const snippet = (playlistSnippet ?? {}) as Record<string, unknown>;
  const rawItems = Array.isArray(itemData.items) ? itemData.items as Record<string, unknown>[] : [];

  const tracks = rawItems.flatMap((item): NormalizedTrack[] => {
    const trackSnippet = (item.snippet ?? {}) as Record<string, unknown>;
    const details = (item.contentDetails ?? {}) as Record<string, unknown>;
    const resource = (trackSnippet.resourceId ?? {}) as Record<string, unknown>;
    const videoId = readString(resource.videoId);
    if (!videoId) return [];
    const thumbnails = (trackSnippet.thumbnails ?? {}) as Record<string, unknown>;
    const thumbnail = (thumbnails.high ?? thumbnails.medium ?? thumbnails.default ?? {}) as Record<string, unknown>;
    const duration = typeof details.videoPublishedAt === "string" ? undefined : undefined;

    return [{
      providerTrackId: videoId,
      title: readString(trackSnippet.title) || "Untitled video",
      artist: readString(trackSnippet.videoOwnerChannelTitle) || readString(trackSnippet.channelTitle),
      ...(duration ? { durationSeconds: duration } : {}),
      ...(safeArtworkUrl(thumbnail.url) ? { artworkUrl: safeArtworkUrl(thumbnail.url) } : {}),
    }];
  });

  return {
    provider: "youtube",
    title: readString(snippet.title) || "YouTube playlist",
    tracks,
    ...(typeof itemData.nextPageToken === "string" ? { nextPageToken: itemData.nextPageToken } : {}),
    ...(typeof itemData.pageInfo === "object" && itemData.pageInfo !== null &&
      typeof (itemData.pageInfo as Record<string, unknown>).totalResults === "number"
      ? { totalTracks: (itemData.pageInfo as Record<string, number>).totalResults }
      : {}),
  };
}

let spotifyTokenCache: { token: string; expiresAt: number } | null = null;

async function getSpotifyAccessToken(): Promise<string> {
  if (spotifyTokenCache && spotifyTokenCache.expiresAt > Date.now() + 30_000) {
    return spotifyTokenCache.token;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new ProviderError("Spotify metadata is not configured on this server.", "NOT_CONFIGURED", 503);
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });

  const data = await readJson(response);
  const token = readString(data.access_token);
  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
  if (!token) throw new ProviderError("Spotify authentication returned no access token.", "UPSTREAM_ERROR", 502);

  spotifyTokenCache = { token, expiresAt: Date.now() + expiresIn * 1000 };
  return token;
}

export async function getSpotifyPlaylistMetadata(input: URL, pageOffset = 0): Promise<PlaylistMetadata> {
  const match = input.pathname.match(/^\/(playlist|album)\/([A-Za-z0-9]+)\/?$/);
  if (!match) {
    throw new ProviderError("Provide a Spotify playlist or album URL.", "INVALID_LINK", 400);
  }

  const [, type, id] = match;
  const token = await getSpotifyAccessToken();
  const endpoint = type === "playlist"
    ? `https://api.spotify.com/v1/playlists/${encodeURIComponent(id)}`
    : `https://api.spotify.com/v1/albums/${encodeURIComponent(id)}`;
  const detailsUrl = new URL(endpoint);
  detailsUrl.searchParams.set("limit", "100");
  detailsUrl.searchParams.set("offset", String(pageOffset));

  const response = await fetch(detailsUrl, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  const data = await readJson(response);

  const images = Array.isArray(data.images) ? data.images as Record<string, unknown>[] : [];
  const tracksContainer = (data.tracks ?? {}) as Record<string, unknown>;
  const rawItems = Array.isArray(tracksContainer.items) ? tracksContainer.items as Record<string, unknown>[] : [];

  const tracks = rawItems.flatMap((entry): NormalizedTrack[] => {
    const track = type === "playlist" ? (entry.track ?? {}) as Record<string, unknown> : entry;
    const trackId = readString(track.id);
    if (!trackId) return [];
    const artists = Array.isArray(track.artists) ? track.artists as Record<string, unknown>[] : [];
    const artist = artists.map((item) => readString(item.name)).filter(Boolean).join(", ");
    const durationMs = typeof track.duration_ms === "number" ? track.duration_ms : undefined;
    const album = (track.album ?? {}) as Record<string, unknown>;
    const albumImages = Array.isArray(album.images) ? album.images as Record<string, unknown>[] : [];
    const artwork = safeArtworkUrl((albumImages[0] ?? {}).url);

    return [{
      providerTrackId: trackId,
      title: readString(track.name) || "Untitled track",
      artist,
      ...(durationMs !== undefined ? { durationSeconds: Math.round(durationMs / 1000) } : {}),
      ...(artwork ? { artworkUrl: artwork } : {}),
    }];
  });

  const total = typeof tracksContainer.total === "number" ? tracksContainer.total : undefined;
  const next = typeof tracksContainer.next === "string" ? tracksContainer.next : undefined;

  return {
    provider: "spotify",
    title: readString(data.name) || (type === "album" ? "Spotify album" : "Spotify playlist"),
    tracks,
    ...(next ? { nextPageToken: String(pageOffset + 100) } : {}),
    ...(total !== undefined ? { totalTracks: total } : {}),
  };
}

export async function getPlaylistMetadata(input: URL): Promise<PlaylistMetadata> {
  const hostname = input.hostname.toLowerCase();
  if (hostname === "youtube.com" || hostname === "www.youtube.com" || hostname === "music.youtube.com") {
    return getYoutubePlaylistMetadata(input);
  }
  if (hostname === "open.spotify.com") {
    return getSpotifyPlaylistMetadata(input);
  }
  if (hostname === "soundcloud.com" || hostname === "www.soundcloud.com" || hostname === "m.soundcloud.com") {
    throw new ProviderError(
      "SoundCloud metadata is not connected yet. Use a supported provider while this integration is developed.",
      "NOT_CONFIGURED",
      503,
    );
  }
  throw new ProviderError("This provider is not supported.", "INVALID_LINK", 400);
}

export type JamendoTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationSeconds: number;
  artworkUrl?: string;
  trackUrl?: string;
  licenseUrl?: string;
  downloadAllowed: boolean;
};

type JamendoApiTrack = {
  id?: string | number;
  name?: string;
  duration?: number;
  artist_name?: string;
  album_name?: string;
  image?: string;
  album_image?: string;
  shareurl?: string;
  license_ccurl?: string;
  audiodownload?: string;
  audiodownload_allowed?: boolean;
};

type JamendoResponse = {
  headers?: { status?: string; error_message?: string };
  results?: JamendoApiTrack[];
};

export class JamendoError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "JamendoError";
  }
}

const API_BASE = "https://api.jamendo.com/v3.0";
const RESULT_LIMIT = 20;

function getClientId(): string {
  const clientId = process.env.JAMENDO_CLIENT_ID?.trim();
  if (!clientId) {
    throw new JamendoError("Jamendo is not configured on this server. Add JAMENDO_CLIENT_ID to the server environment.", 503);
  }
  return clientId;
}

function safeHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function safeLicenseUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === "http:" && ["creativecommons.org", "www.creativecommons.org", "artlibre.org"].includes(url.hostname)) {
      url.protocol = "https:";
    }
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function safeTrack(item: JamendoApiTrack): JamendoTrack | null {
  const id = String(item.id ?? "");
  if (!/^\d{1,12}$/.test(id)) return null;

  return {
    id,
    title: typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Untitled track",
    artist: typeof item.artist_name === "string" ? item.artist_name : "Unknown artist",
    album: typeof item.album_name === "string" ? item.album_name : "",
    durationSeconds: typeof item.duration === "number" && Number.isFinite(item.duration) ? Math.max(0, item.duration) : 0,
    ...(safeHttpsUrl(item.image ?? item.album_image) ? { artworkUrl: safeHttpsUrl(item.image ?? item.album_image) } : {}),
    ...(safeHttpsUrl(item.shareurl) ? { trackUrl: safeHttpsUrl(item.shareurl) } : {}),
    ...(safeLicenseUrl(item.license_ccurl) ? { licenseUrl: safeLicenseUrl(item.license_ccurl) } : {}),
    downloadAllowed: item.audiodownload_allowed === true && Boolean(safeHttpsUrl(item.audiodownload)),
  };
}

async function requestTracks(params: Record<string, string>): Promise<JamendoApiTrack[]> {
  const url = new URL(`${API_BASE}/tracks/`);
  url.searchParams.set("client_id", getClientId());
  url.searchParams.set("format", "json");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
  } catch {
    throw new JamendoError("Could not reach Jamendo. Please retry.", 502);
  }
  if (!response.ok) throw new JamendoError("Jamendo could not return track metadata.", 502);

  let data: JamendoResponse;
  try {
    data = (await response.json()) as JamendoResponse;
  } catch {
    throw new JamendoError("Jamendo returned an invalid response.", 502);
  }

  if (data.headers?.status === "error") {
    throw new JamendoError("Jamendo rejected the API request. Check the client ID and API access.", 502);
  }
  return Array.isArray(data.results) ? data.results : [];
}

export async function searchJamendoTracks(query: string, offset = 0): Promise<{ tracks: JamendoTrack[]; hasMore: boolean }> {
  const items = await requestTracks({
    search: query,
    limit: String(RESULT_LIMIT),
    offset: String(offset),
    type: "single albumtrack",
    include: "licenses",
    audiodlformat: "mp32",
    imagesize: "300",
  });
  const tracks = items.map(safeTrack).filter((track): track is JamendoTrack => track !== null);
  return { tracks, hasMore: items.length === RESULT_LIMIT };
}

export async function getJamendoDownloadUrl(trackId: string): Promise<string> {
  if (!/^\d{1,12}$/.test(trackId)) throw new JamendoError("Invalid track ID.", 400);

  const [item] = await requestTracks({
    id: trackId,
    limit: "1",
    include: "licenses",
    audiodlformat: "mp32",
  });
  if (!item || String(item.id ?? "") !== trackId) throw new JamendoError("Track not found in Jamendo.", 404);
  if (item.audiodownload_allowed !== true) {
    throw new JamendoError("The artist has not enabled downloads for this track.", 403);
  }

  const downloadUrl = safeHttpsUrl(item.audiodownload);
  if (!downloadUrl) throw new JamendoError("Jamendo did not provide an authorized download URL.", 403);

  const parsed = new URL(downloadUrl);
  const allowedHost = parsed.hostname === "storage.jamendo.com" || /^[a-z0-9-]+\.storage\.jamendo\.com$/.test(parsed.hostname);
  if (parsed.username || parsed.password || parsed.port || !allowedHost || !parsed.pathname.startsWith(`/download/track/${trackId}/`)) {
    throw new JamendoError("Jamendo returned an unexpected download location.", 502);
  }
  return parsed.toString();
}

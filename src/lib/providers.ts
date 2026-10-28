export const SUPPORTED_BITRATES = [64, 96, 128, 192, 256, 320] as const;

export type SupportedBitrate = (typeof SUPPORTED_BITRATES)[number];
export type ProviderId = "youtube" | "spotify" | "soundcloud";
export type LinkKind = "playlist" | "track" | "video" | "unknown";

export type ProviderInspection = {
  provider: ProviderId;
  canonicalUrl: string;
  kind: LinkKind;
  metadataIntegrationConfigured: boolean;
  audioDownloadEnabled: false;
};

const PROVIDER_HOSTS: Record<ProviderId, string[]> = {
  youtube: ["youtube.com", "www.youtube.com", "music.youtube.com", "youtu.be"],
  spotify: ["open.spotify.com"],
  soundcloud: ["soundcloud.com", "www.soundcloud.com", "m.soundcloud.com"],
};

export function parseSupportedProviderUrl(input: string): ProviderInspection | null {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  let provider: ProviderId | undefined;

  for (const [id, hosts] of Object.entries(PROVIDER_HOSTS) as [ProviderId, string[]][]) {
    if (hosts.includes(hostname)) {
      provider = id;
      break;
    }
  }

  if (!provider) return null;

  let kind: LinkKind = "unknown";
  const path = url.pathname.toLowerCase();

  if (provider === "spotify") {
    if (/^\/playlist\//.test(path)) kind = "playlist";
    else if (/^\/track\//.test(path)) kind = "track";
    else if (/^\/album\//.test(path)) kind = "playlist";
    else if (/^\/artist\//.test(path)) kind = "playlist";
  } else if (provider === "soundcloud") {
    // SoundCloud's public URLs can represent tracks, playlists, or profiles.
    if (/\/sets\//.test(path)) kind = "playlist";
    else if (path.split("/").filter(Boolean).length >= 2) kind = "track";
    else kind = "unknown";
  } else {
    if (hostname === "youtu.be") {
      kind = url.pathname.length > 1 ? "video" : "unknown";
    } else if (url.searchParams.has("list")) {
      kind = "playlist";
    } else if (url.searchParams.has("v") || /^\/(shorts|live)\//.test(path)) {
      kind = "video";
    } else {
      kind = "unknown";
    }
  }

  // Only exact known hostnames are accepted. This function does not fetch URLs.
  url.hash = "";

  return {
    provider,
    canonicalUrl: url.toString(),
    kind,
    metadataIntegrationConfigured: false,
    audioDownloadEnabled: false,
  };
}

export function providerDisplayName(provider: ProviderId): string {
  switch (provider) {
    case "youtube":
      return "YouTube / YouTube Music";
    case "spotify":
      return "Spotify";
    case "soundcloud":
      return "SoundCloud";
  }
}

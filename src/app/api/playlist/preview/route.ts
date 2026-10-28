import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({
  url: z.string().trim().url().max(2048),
  qualityKbps: z.union([
    z.literal(64), z.literal(96), z.literal(128),
    z.literal(192), z.literal(256), z.literal(320),
  ]),
});

const allowedHosts = [
  "youtube.com", "www.youtube.com", "music.youtube.com", "youtu.be",
  "open.spotify.com", "soundcloud.com", "www.soundcloud.com",
];

function isAllowedHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return allowedHosts.some((allowed) => host === allowed || host.endsWith("." + allowed));
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Please submit a valid JSON request." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Enter a valid playlist URL and choose a supported bitrate." },
      { status: 400 },
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(parsed.data.url);
  } catch {
    return NextResponse.json({ message: "That URL is not valid." }, { status: 400 });
  }

  if (parsedUrl.protocol !== "https:" || !isAllowedHost(parsedUrl.hostname)) {
    return NextResponse.json(
      { message: "For now, use an HTTPS link from YouTube, YouTube Music, Spotify, or SoundCloud." },
      { status: 400 },
    );
  }

  // Provider adapters and authorized audio sources are added in a later milestone.
  // Do not fetch or download third-party media until an approved provider flow exists.
  return NextResponse.json(
    {
      status: "provider-not-configured",
      qualityKbps: parsed.data.qualityKbps,
      message: "Link format looks good. Playlist provider integration is the next milestone; downloads are not enabled yet.",
    },
    { status: 501 },
  );
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { parseSupportedProviderUrl, providerDisplayName, SUPPORTED_BITRATES } from "@/lib/providers";

export const runtime = "nodejs";

const requestSchema = z.object({
  url: z.string().trim().url().max(2048),
  qualityKbps: z.union([
    z.literal(64), z.literal(96), z.literal(128),
    z.literal(192), z.literal(256), z.literal(320),
  ]),
});

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Please submit a valid JSON request." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success || !SUPPORTED_BITRATES.includes(parsed.data.qualityKbps)) {
    return NextResponse.json(
      { message: "Enter a valid supported playlist URL and choose a supported bitrate." },
      { status: 400 },
    );
  }

  const inspection = parseSupportedProviderUrl(parsed.data.url);
  if (!inspection) {
    return NextResponse.json(
      { message: "Unsupported URL. Use an HTTPS link from YouTube, YouTube Music, Spotify, or SoundCloud." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    status: "provider-detected",
    provider: inspection.provider,
    providerName: providerDisplayName(inspection.provider),
    linkKind: inspection.kind,
    qualityKbps: parsed.data.qualityKbps,
    metadataIntegrationConfigured: inspection.metadataIntegrationConfigured,
    audioDownloadEnabled: inspection.audioDownloadEnabled,
    message: `Recognized ${providerDisplayName(inspection.provider)}. Provider metadata access is the next step; downloads are not enabled yet.`,
  });
}

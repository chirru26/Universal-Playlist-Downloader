import { NextResponse } from "next/server";
import { z } from "zod";
import { parseSupportedProviderUrl, providerDisplayName } from "@/lib/providers";

export const runtime = "nodejs";

const bodySchema = z.object({
  url: z.string().trim().url().max(2048),
});

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Please submit a valid JSON request." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Enter a valid HTTPS link from a supported provider." }, { status: 400 });
  }

  const inspection = parseSupportedProviderUrl(parsed.data.url);
  if (!inspection) {
    return NextResponse.json(
      { message: "Unsupported URL. Use a direct HTTPS link from YouTube, YouTube Music, Spotify, or SoundCloud." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    status: "provider-detected",
    provider: inspection.provider,
    providerName: providerDisplayName(inspection.provider),
    linkKind: inspection.kind,
    canonicalUrl: inspection.canonicalUrl,
    metadataIntegrationConfigured: inspection.metadataIntegrationConfigured,
    audioDownloadEnabled: inspection.audioDownloadEnabled,
    message: "Provider detected. Metadata integration is not configured yet, and downloading is not enabled.",
  });
}

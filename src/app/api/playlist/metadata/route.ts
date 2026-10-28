import { NextResponse } from "next/server";
import { z } from "zod";
import { parseSupportedProviderUrl } from "@/lib/providers";
import { getPlaylistMetadata, ProviderError } from "@/lib/providers/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    return NextResponse.json({ message: "Enter a valid HTTPS playlist URL." }, { status: 400 });
  }

  const inspection = parseSupportedProviderUrl(parsed.data.url);
  if (!inspection) {
    return NextResponse.json({ message: "Unsupported provider URL." }, { status: 400 });
  }

  try {
    const metadata = await getPlaylistMetadata(new URL(inspection.canonicalUrl));
    return NextResponse.json({
      status: "metadata-loaded",
      provider: metadata.provider,
      title: metadata.title,
      tracks: metadata.tracks,
      nextPageToken: metadata.nextPageToken ?? null,
      totalTracks: metadata.totalTracks ?? metadata.tracks.length,
      // Metadata access is not permission to download the underlying audio.
      audioDownloadEnabled: false,
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      return NextResponse.json(
        { status: "metadata-unavailable", code: error.code, message: error.message },
        { status: error.httpStatus },
      );
    }
    return NextResponse.json(
      { status: "metadata-unavailable", message: "Could not retrieve metadata right now. Please retry later." },
      { status: 502 },
    );
  }
}

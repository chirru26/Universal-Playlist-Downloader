import { NextResponse } from "next/server";
import { getJamendoDownloadUrl, JamendoError } from "@/lib/jamendo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ trackId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { trackId } = await context.params;
  try {
    // Re-check the artist's current download permission on every download request.
    const downloadUrl = await getJamendoDownloadUrl(trackId);
    return NextResponse.redirect(downloadUrl, {
      status: 302,
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    if (error instanceof JamendoError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ message: "The track could not be downloaded from Jamendo." }, { status: 502 });
  }
}

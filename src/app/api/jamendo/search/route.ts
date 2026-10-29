import { NextResponse } from "next/server";
import { JamendoError, searchJamendoTracks } from "@/lib/jamendo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const offsetValue = Number(url.searchParams.get("offset") ?? "0");

  if (query.length < 2 || query.length > 120) {
    return NextResponse.json({ message: "Enter a song, artist, or genre (2–120 characters)." }, { status: 400 });
  }
  if (!Number.isSafeInteger(offsetValue) || offsetValue < 0 || offsetValue > 100000) {
    return NextResponse.json({ message: "Invalid search page." }, { status: 400 });
  }

  try {
    const result = await searchJamendoTracks(query, offsetValue);
    return NextResponse.json({ ...result, offset: offsetValue, limit: 20, nextOffset: offsetValue + (result.hasMore ? 20 : result.tracks.length) });
  } catch (error) {
    if (error instanceof JamendoError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ message: "Jamendo search is temporarily unavailable." }, { status: 502 });
  }
}

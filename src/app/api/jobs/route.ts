import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { createOwnerToken, hashOwnerToken, readOwnerToken, setOwnerCookie } from "@/lib/job-owner";
import { parseSupportedProviderUrl, SUPPORTED_BITRATES } from "@/lib/providers";
import DownloadJob from "@/models/DownloadJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createJobSchema = z.object({
  url: z.string().trim().url().max(2048),
  qualityKbps: z.number().int().refine(
    (value) => SUPPORTED_BITRATES.includes(value as (typeof SUPPORTED_BITRATES)[number]),
    "Choose a supported bitrate.",
  ),
});

function safeJob(job: {
  _id: unknown;
  sourceUrl: string;
  provider: string;
  qualityKbps: number;
  status: string;
  progressPercent: number;
  tracks?: unknown[];
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: String(job._id),
    sourceUrl: job.sourceUrl,
    provider: job.provider,
    qualityKbps: job.qualityKbps,
    status: job.status,
    progressPercent: job.progressPercent,
    trackCount: job.tracks?.length ?? 0,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export async function GET(request: Request) {
  const token = readOwnerToken(request);
  if (!token) {
    return NextResponse.json({ jobs: [] });
  }

  try {
    await connectToDatabase();
    const jobs = await DownloadJob.find({ ownerTokenHash: hashOwnerToken(token) })
      .sort({ createdAt: -1 })
      .limit(20)
      .select("_id sourceUrl provider qualityKbps status progressPercent tracks createdAt updatedAt")
      .lean();

    return NextResponse.json({ jobs: jobs.map((job) => safeJob(job)) });
  } catch {
    return NextResponse.json(
      { message: "Job history is temporarily unavailable. Check the database configuration." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Please submit a valid JSON request." }, { status: 400 });
  }

  const parsed = createJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Enter a valid provider URL and choose a supported bitrate." },
      { status: 400 },
    );
  }

  const inspection = parseSupportedProviderUrl(parsed.data.url);
  if (!inspection || inspection.kind !== "playlist") {
    return NextResponse.json(
      { message: "Use a supported playlist or album URL. Individual tracks are not job inputs yet." },
      { status: 400 },
    );
  }

  const existingToken = readOwnerToken(request);
  const ownerToken = existingToken ?? createOwnerToken();
  const ownerTokenHash = hashOwnerToken(ownerToken);

  try {
    await connectToDatabase();

    const activeCount = await DownloadJob.countDocuments({
      ownerTokenHash,
      status: { $in: ["queued", "processing"] },
    });
    if (activeCount >= 5) {
      return NextResponse.json(
        { message: "You already have 5 queued jobs. Please wait before creating another." },
        { status: 429 },
      );
    }

    const job = await DownloadJob.create({
      ownerTokenHash,
      sourceUrl: inspection.canonicalUrl,
      provider: inspection.provider,
      qualityKbps: parsed.data.qualityKbps,
      status: "queued",
      progressPercent: 0,
      tracks: [],
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const response = NextResponse.json(
      {
        job: safeJob(job.toObject()),
        processingEnabled: false,
        message: "Job saved to your anonymous history. Background processing and audio downloads are not enabled yet.",
      },
      { status: 201 },
    );

    if (!existingToken) setOwnerCookie(response, ownerToken);
    return response;
  } catch {
    return NextResponse.json(
      { message: "Could not save this job. Check the database configuration and try again." },
      { status: 503 },
    );
  }
}

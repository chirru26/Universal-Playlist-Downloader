import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { hashOwnerToken, readOwnerToken } from "@/lib/job-owner";
import DownloadJob from "@/models/DownloadJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const token = readOwnerToken(request);
  if (!token) return NextResponse.json({ message: "Download not found." }, { status: 404 });

  const { jobId } = await context.params;
  if (!/^[a-f0-9]{24}$/i.test(jobId)) return NextResponse.json({ message: "Download not found." }, { status: 404 });

  const storageDir = process.env.AUTHORIZED_UPLOAD_DIR;
  if (!storageDir) return NextResponse.json({ message: "Private output storage is not configured." }, { status: 503 });

  try {
    await connectToDatabase();
    const job = await DownloadJob.findOne({
      _id: jobId,
      ownerTokenHash: hashOwnerToken(token),
      sourceType: "authorized-upload",
      status: "completed",
    }).select("+outputKey originalFilename qualityKbps").lean();

    if (!job?.outputKey || !/^[a-f0-9]{48}\.mp3$/.test(job.outputKey)) {
      return NextResponse.json({ message: "Download not found or not ready yet." }, { status: 404 });
    }

    const root = path.resolve(storageDir);
    const filePath = path.resolve(root, job.outputKey);
    if (path.dirname(filePath) !== root) return NextResponse.json({ message: "Download not found." }, { status: 404 });

    const fileInfo = await stat(filePath);
    if (!fileInfo.isFile()) return NextResponse.json({ message: "Download not found." }, { status: 404 });

    const baseName = path.basename(job.originalFilename || "audio", path.extname(job.originalFilename || ""));
    const safeName = (baseName.replace(/[^a-zA-Z0-9 _.-]/g, "_").trim().slice(0, 180) || "audio") + ".mp3";
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(fileInfo.size),
        "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ message: "Could not retrieve this download. Check database and private storage connectivity." }, { status: 503 });
  }
}

import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { createOwnerToken, hashOwnerToken, readOwnerToken, setOwnerCookie } from "@/lib/job-owner";
import { SUPPORTED_BITRATES } from "@/lib/providers";
import DownloadJob from "@/models/DownloadJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const EXTENSIONS = new Set([".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac"]);

function detectAudioExtension(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes.toString("ascii", 0, 3) === "ID3") return ".mp3";
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return ".mp3";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE") return ".wav";
  if (bytes.length >= 4 && bytes.toString("ascii", 0, 4) === "fLaC") return ".flac";
  if (bytes.length >= 4 && bytes.toString("ascii", 0, 4) === "OggS") return ".ogg";
  if (bytes.length >= 8 && bytes.toString("ascii", 4, 8) === "ftyp") return ".m4a";
  if (bytes.length >= 7 && bytes.toString("ascii", 0, 7) === "ADIF") return ".aac";
  return null;
}

export async function POST(request: Request) {
  const storageDir = process.env.AUTHORIZED_UPLOAD_DIR;
  if (!storageDir) {
    return NextResponse.json(
      { message: "Authorized uploads are not configured. Set AUTHORIZED_UPLOAD_DIR to a private shared directory." },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ message: "Submit a valid multipart file upload." }, { status: 400 });
  }

  const file = form.get("file");
  const qualityValue = Number(form.get("qualityKbps"));
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Choose an audio file you own or are authorized to process." }, { status: 400 });
  }
  if (!Number.isInteger(qualityValue) || !SUPPORTED_BITRATES.includes(qualityValue as (typeof SUPPORTED_BITRATES)[number])) {
    return NextResponse.json({ message: "Choose a supported output bitrate." }, { status: 400 });
  }
  if (file.size < 1 || file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ message: "Audio files must be between 1 byte and 25 MB." }, { status: 413 });
  }

  const originalName = path.basename(file.name || "audio-upload").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255) || "audio-upload";
  const requestedExtension = path.extname(originalName).toLowerCase();
  if (!EXTENSIONS.has(requestedExtension)) {
    return NextResponse.json({ message: "Supported file extensions: MP3, WAV, FLAC, OGG, M4A, and AAC." }, { status: 415 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const detectedExtension = detectAudioExtension(bytes);
  if (!detectedExtension || (requestedExtension !== detectedExtension && !(requestedExtension === ".aac" && detectedExtension === ".mp3"))) {
    return NextResponse.json({ message: "The file contents do not match a supported audio format." }, { status: 415 });
  }

  const existingToken = readOwnerToken(request);
  const ownerToken = existingToken ?? createOwnerToken();
  const ownerTokenHash = hashOwnerToken(ownerToken);
  const uploadKey = `${randomBytes(24).toString("hex")}${detectedExtension}`;
  const absolutePath = path.join(path.resolve(storageDir), uploadKey);

  try {
    await connectToDatabase();
    const activeCount = await DownloadJob.countDocuments({
      ownerTokenHash,
      status: { $in: ["queued", "processing"] },
    });
    if (activeCount >= 5) {
      return NextResponse.json({ message: "You already have 5 queued jobs. Please wait before creating another." }, { status: 429 });
    }

    await mkdir(path.resolve(storageDir), { recursive: true, mode: 0o700 });
    await writeFile(absolutePath, bytes, { flag: "wx", mode: 0o600 });
    try {
      const job = await DownloadJob.create({
        ownerTokenHash,
        sourceUrl: "authorized-upload://audio-file",
        sourceType: "authorized-upload",
        uploadKey,
        originalFilename: originalName,
        provider: "direct",
        qualityKbps: qualityValue,
        status: "queued",
        progressPercent: 0,
        tracks: [],
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const response = NextResponse.json({
        job: {
          id: String(job._id),
          originalFilename: originalName,
          provider: "direct",
          qualityKbps: qualityValue,
          status: job.status,
          progressPercent: job.progressPercent,
          createdAt: job.createdAt,
        },
        message: "Upload accepted and queued. Once the background worker finishes conversion, use the Download MP3 link in Recent jobs.",
      }, { status: 201 });
      if (!existingToken) setOwnerCookie(response, ownerToken);
      return response;
    } catch (error) {
      await unlink(absolutePath).catch(() => undefined);
      throw error;
    }
  } catch {
    return NextResponse.json({ message: "Could not save the upload. Check MongoDB and private shared-storage configuration." }, { status: 503 });
  }
}

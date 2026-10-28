import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import DownloadJob from "@/models/DownloadJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEASE_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 3;

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim") }),
  z.object({ action: z.literal("heartbeat"), jobId: z.string().regex(/^[a-f0-9]{24}$/), leaseToken: z.string().regex(/^[a-f0-9]{64}$/), progressPercent: z.number().int().min(0).max(99).optional() }),
  z.object({ action: z.literal("complete"), jobId: z.string().regex(/^[a-f0-9]{24}$/), leaseToken: z.string().regex(/^[a-f0-9]{64}$/), outputKey: z.string().regex(/^[a-f0-9]{48}\.mp3$/) }),
  z.object({ action: z.literal("fail"), jobId: z.string().regex(/^[a-f0-9]{24}$/), leaseToken: z.string().regex(/^[a-f0-9]{64}$/), errorCode: z.string().trim().min(1).max(80).regex(/^[A-Z0-9_]+$/) }),
]);

function authorized(request: Request): boolean {
  const configuredSecret = process.env.WORKER_API_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!configuredSecret || supplied.length !== configuredSecret.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(configuredSecret));
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ message: "Unauthorized worker request." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Submit a valid JSON request." }, { status: 400 });
  }

  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid worker action payload." }, { status: 400 });
  }

  try {
    await connectToDatabase();

    if (parsed.data.action === "claim") {
      const now = new Date();
      const leaseToken = randomBytes(32).toString("hex");
      const job = await DownloadJob.findOneAndUpdate(
        {
          sourceType: "authorized-upload",
          attempts: { $lt: MAX_ATTEMPTS },
          $or: [
            { status: "queued" },
            { status: "processing", leaseExpiresAt: { $lte: now } },
            { status: "processing", leaseExpiresAt: { $exists: false } },
          ],
        },
        {
          $set: {
            status: "processing",
            leaseTokenHash: hash(leaseToken),
            leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
            errorCode: undefined,
          },
          $inc: { attempts: 1 },
        },
        { sort: { createdAt: 1 }, new: true, runValidators: true },
      ).select("+leaseTokenHash +uploadKey").lean();

      if (!job) {
        return NextResponse.json({ job: null, message: "No eligible jobs are waiting." });
      }

      return NextResponse.json({
        job: {
          id: String(job._id),
          sourceType: job.sourceType,
          uploadKey: job.uploadKey,
          originalFilename: job.originalFilename,
          provider: job.provider,
          qualityKbps: job.qualityKbps,
          attempt: job.attempts,
          leaseExpiresAt: job.leaseExpiresAt,
        },
        leaseToken,
        message: "Job claimed. The worker must only process media it is authorized to access.",
      });
    }

    const { jobId, leaseToken } = parsed.data;
    const current = await DownloadJob.findOne({
      _id: jobId,
      status: "processing",
      leaseTokenHash: hash(leaseToken),
      leaseExpiresAt: { $gt: new Date() },
    }).select("_id attempts");

    if (!current) {
      return NextResponse.json({ message: "Job lease is invalid or expired." }, { status: 409 });
    }

    if (parsed.data.action === "heartbeat") {
      const updated = await DownloadJob.updateOne(
        { _id: current._id, status: "processing", leaseTokenHash: hash(leaseToken) },
        { $set: { leaseExpiresAt: new Date(Date.now() + LEASE_MS), ...(parsed.data.action === "heartbeat" && parsed.data.progressPercent !== undefined ? { progressPercent: parsed.data.progressPercent } : {}) } },
      );
      if (!updated.modifiedCount) {
        return NextResponse.json({ message: "Job lease could not be renewed." }, { status: 409 });
      }
      return NextResponse.json({ renewed: true, leaseMs: LEASE_MS });
    }

    if (parsed.data.action === "complete") {
      const completed = await DownloadJob.updateOne(
        { _id: current._id, status: "processing", leaseTokenHash: hash(leaseToken), leaseExpiresAt: { $gt: new Date() } },
        { $set: { status: "completed", progressPercent: 100, outputKey: parsed.data.outputKey }, $unset: { leaseTokenHash: "", leaseExpiresAt: "", errorCode: "" } },
      );
      if (!completed.modifiedCount) return NextResponse.json({ message: "Job lease was lost before completion." }, { status: 409 });
      return NextResponse.json({ status: "completed", progressPercent: 100 });
    }

    const shouldRetry = current.attempts < MAX_ATTEMPTS;
    await DownloadJob.updateOne(
      { _id: current._id, status: "processing", leaseTokenHash: hash(leaseToken) },
      {
        $set: {
          status: shouldRetry ? "queued" : "failed",
          errorCode: parsed.data.errorCode,
          leaseExpiresAt: undefined,
          leaseTokenHash: undefined,
        },
      },
    );
    return NextResponse.json({
      status: shouldRetry ? "queued" : "failed",
      attemptsRemaining: Math.max(0, MAX_ATTEMPTS - current.attempts),
    });
  } catch {
    return NextResponse.json({ message: "Worker queue is unavailable. Check MongoDB connectivity." }, { status: 503 });
  }
}

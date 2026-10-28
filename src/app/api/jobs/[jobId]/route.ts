import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { hashOwnerToken, readOwnerToken } from "@/lib/job-owner";
import DownloadJob from "@/models/DownloadJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const ownerToken = readOwnerToken(request);
  if (!ownerToken) {
    return NextResponse.json({ message: "Job not found." }, { status: 404 });
  }

  const { jobId } = await context.params;
  if (!/^[a-f0-9]{24}$/i.test(jobId)) {
    return NextResponse.json({ message: "Job not found." }, { status: 404 });
  }

  try {
    await connectToDatabase();
    const ownerTokenHash = hashOwnerToken(ownerToken);
    const cancelled = await DownloadJob.findOneAndUpdate(
      {
        _id: jobId,
        ownerTokenHash,
        status: { $in: ["queued", "processing"] },
      },
      {
        $set: { status: "cancelled", errorCode: "CANCELLED" },
        $unset: { leaseTokenHash: "", leaseExpiresAt: "" },
      },
      { new: true },
    )
      .select("_id status")
      .lean();

    if (cancelled) {
      return NextResponse.json({ job: { id: String(cancelled._id), status: cancelled.status } });
    }

    const existing = await DownloadJob.findOne({ _id: jobId, ownerTokenHash })
      .select("_id status")
      .lean();

    if (!existing) {
      return NextResponse.json({ message: "Job not found." }, { status: 404 });
    }

    return NextResponse.json(
      { message: "This job has already finished and cannot be cancelled.", status: existing.status },
      { status: 409 },
    );
  } catch {
    return NextResponse.json({ message: "Could not cancel this job. Check database connectivity." }, { status: 503 });
  }
}

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.MONGODB_URI) {
    return NextResponse.json(
      { status: "degraded", database: "not_configured" },
      { status: 503 },
    );
  }

  try {
    await connectToDatabase();
    return NextResponse.json({
      status: "ok",
      database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    });
  } catch {
    return NextResponse.json(
      { status: "degraded", database: "unavailable" },
      { status: 503 },
    );
  }
}

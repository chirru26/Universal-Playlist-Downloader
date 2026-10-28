import { createHash, randomBytes } from "node:crypto";
import type { NextResponse } from "next/server";

export const OWNER_COOKIE_NAME = "upd_owner";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function readOwnerToken(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const pair = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${OWNER_COOKIE_NAME}=`));
  if (!pair) return null;
  const token = pair.slice(OWNER_COOKIE_NAME.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export function hashOwnerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createOwnerToken(): string {
  return randomBytes(32).toString("hex");
}

export function setOwnerCookie(response: NextResponse, token: string): void {
  response.cookies.set(OWNER_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

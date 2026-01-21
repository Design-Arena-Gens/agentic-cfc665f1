import { NextResponse } from "next/server";
import { renameParticipant, saveUser } from "@/lib/server-state";

export const runtime = "nodejs";

const sanitizeName = (value: unknown): string => {
  if (typeof value !== "string") return "Anonymous";
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 48) : "Anonymous";
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const uid = typeof body.uid === "string" ? body.uid : null;
  if (!uid) {
    return NextResponse.json(
      { error: "uid must be provided" },
      { status: 400 },
    );
  }
  const user = saveUser(uid, sanitizeName(body.name));
  return NextResponse.json({ user });
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => ({}));
  const uid = typeof body.uid === "string" ? body.uid : null;
  if (!uid) {
    return NextResponse.json(
      { error: "uid must be provided" },
      { status: 400 },
    );
  }
  const user = renameParticipant(uid, sanitizeName(body.name));
  return NextResponse.json({ user });
}

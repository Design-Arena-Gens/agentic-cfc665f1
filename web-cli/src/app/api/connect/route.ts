import { NextResponse } from "next/server";
import { ensureConversation } from "@/lib/server-state";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const fromUid = typeof body.fromUid === "string" ? body.fromUid : null;
  const toUid = typeof body.toUid === "string" ? body.toUid : null;
  if (!fromUid || !toUid) {
    return NextResponse.json(
      { error: "fromUid and toUid are required" },
      { status: 400 },
    );
  }
  try {
    const conversation = ensureConversation(fromUid, toUid);
    return NextResponse.json({ conversation });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}

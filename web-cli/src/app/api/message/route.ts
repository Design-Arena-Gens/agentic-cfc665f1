import { NextResponse } from "next/server";
import { appendMessage, getUser } from "@/lib/server-state";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const conversationId =
    typeof body.conversationId === "string" ? body.conversationId : null;
  const fromUid = typeof body.fromUid === "string" ? body.fromUid : null;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!conversationId || !fromUid || text.length === 0) {
    return NextResponse.json(
      { error: "conversationId, fromUid, and non-empty text are required" },
      { status: 400 },
    );
  }
  const user = getUser(fromUid);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  try {
    const message = appendMessage(conversationId, user, text.slice(0, 2000));
    return NextResponse.json({ message });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}

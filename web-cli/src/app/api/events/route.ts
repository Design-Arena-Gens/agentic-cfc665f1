import {
  listConversationsForUser,
  subscribeToUser,
  unsubscribeFromUser,
} from "@/lib/server-state";
import type { ServerEvent } from "@/lib/protocol";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 0;

const encoder = new TextEncoder();

const toEventChunk = (event: ServerEvent): Uint8Array => {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  return encoder.encode(payload);
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get("uid");
  if (!uid) {
    return NextResponse.json({ error: "uid is required" }, { status: 400 });
  }

  let cleanupRef: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const subscriber = {
        uid,
        push: (event: ServerEvent) => {
          controller.enqueue(toEventChunk(event));
        },
      };

      const cleanup = () => {
        unsubscribeFromUser(uid, subscriber);
        clearInterval(keepAlive);
        try {
          controller.close();
        } catch {
          // no-op
        }
        cleanupRef = null;
      };
      cleanupRef = cleanup;

      subscribeToUser(uid, subscriber);
      controller.enqueue(toEventChunk({ type: "hello", uid }));
      const conversations = listConversationsForUser(uid);
      for (const conversation of conversations) {
        controller.enqueue(toEventChunk({ type: "conversation", payload: conversation }));
      }

      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 15000);

      request.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      cleanupRef?.();
      cleanupRef = null;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

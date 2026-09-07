import { subscribe, type SentinelEvent } from "@/lib/sentinel/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Server-sent events: the dashboard's live feed of verdicts and fills. */
export async function GET() {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: SentinelEvent | { type: "ping" }) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          // Client went away mid-write.
        }
      };

      send({ type: "ping" });
      unsubscribe = subscribe(send);
      heartbeat = setInterval(() => send({ type: "ping" }), 15_000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

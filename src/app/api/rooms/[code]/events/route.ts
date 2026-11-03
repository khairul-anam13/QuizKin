import { getRoom, isHost, playerFor, subscribe } from "@/lib/server/rooms";
import type { RoomEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const room = getRoom((await params).code);
  const url = new URL(req.url);
  const host = url.searchParams.get("host");
  const player = room && playerFor(room, url.searchParams.get("pid"), url.searchParams.get("token"));

  // A dead room or unknown seat gets a single "gone" event so the client stops retrying.
  if (!room || (host ? !isHost(room, host) : !player)) {
    const reason = room ? "kicked" : "closed";
    return sse(`data: ${JSON.stringify({ type: "gone", reason } satisfies RoomEvent)}\n\n`);
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const unsubscribe = subscribe(
        room,
        host
          ? { role: "host", send: (e) => write(`data: ${JSON.stringify(e)}\n\n`) }
          : { role: "player", pid: player!.id, send: (e) => write(`data: ${JSON.stringify(e)}\n\n`) },
      );
      // Comment lines keep proxies from closing an idle connection.
      const ping = setInterval(() => write(": ping\n\n"), 20_000);
      cleanup = () => {
        clearInterval(ping);
        unsubscribe();
        cleanup = () => {};
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });

  return sse(stream);
}

function sse(body: BodyInit) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

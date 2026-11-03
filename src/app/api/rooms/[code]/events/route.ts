import { canWatch, watch } from "@/lib/server/rooms";
import type { RoomEvent } from "@/lib/types";

export const dynamic = "force-dynamic";
// Serverless functions have a time limit, so each stream ends itself before it and
// tells the client to reconnect right away.
export const maxDuration = 300;
const STREAM_MS = 240_000;

type Ctx = { params: Promise<{ code: string }> };

const frame = (e: RoomEvent) => `data: ${JSON.stringify(e)}\n\n`;

export async function GET(req: Request, { params }: Ctx) {
  const { code } = await params;
  const url = new URL(req.url);
  const host = url.searchParams.get("host");
  const pid = url.searchParams.get("pid");
  const status = await canWatch(code, { host, pid, token: url.searchParams.get("token") });

  // A dead room or unknown seat gets a single "gone" event so the client stops retrying.
  if (status !== "ok") return sse(frame({ type: "gone", reason: status }));

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
      const end = () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      };
      const send = (e: RoomEvent) => {
        write(frame(e));
        if (e.type === "gone") end();
      };
      const unwatch = watch(code, host ? { role: "host", send } : { role: "player", pid: pid!, send });
      // Comment lines keep proxies from closing an idle connection.
      const ping = setInterval(() => write(": ping\n\n"), 20_000);
      const renew = setTimeout(() => {
        write(frame({ type: "renew" }));
        end();
      }, STREAM_MS);
      cleanup = () => {
        clearInterval(ping);
        clearTimeout(renew);
        unwatch();
        cleanup = () => {};
      };
      req.signal.addEventListener("abort", end);
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

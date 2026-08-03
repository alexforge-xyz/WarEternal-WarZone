import { getLiveBus } from "@/lib/live-server";
import type { LiveEvent } from "@/lib/live-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PING_MS = 25_000;

function encodeSse(event: LiveEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Server-Sent Events hub. One long-lived response per open map (and later
 * chat) tab. Map bodies are not pushed here — only version bumps; clients
 * fetch `/api/map` when the version advances.
 */
export async function GET(request: Request): Promise<Response> {
  const bus = getLiveBus();
  const encoder = new TextEncoder();

  let cleanup: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: LiveEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeSse(event)));
        } catch {
          // Client gone mid-write.
          cleanup?.();
        }
      };

      send(bus.hello());

      const unsub = bus.subscribe(send);
      const ping = setInterval(() => {
        send({ type: "ping", t: Math.floor(Date.now() / 1000) });
      }, PING_MS);

      cleanup = () => {
        clearInterval(ping);
        unsub();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      request.signal.addEventListener("abort", () => cleanup?.(), {
        once: true,
      });
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering (Caddy/nginx) so events flush immediately.
      "X-Accel-Buffering": "no",
    },
  });
}

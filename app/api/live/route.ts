import { getRole } from "@/lib/auth";
import { getLiveBus } from "@/lib/live-server";
import { isOfficerEvent, type LiveEvent } from "@/lib/live-events";
import { canPlan } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PING_MS = 25_000;

/**
 * The role is resolved once, when the stream opens — a long-lived response has
 * no request context left to re-read the cookie from. So an officer-level
 * stream is retired on a timer and the reconnect re-authorises it: a demoted
 * account keeps hearing the room for minutes at worst, never for days.
 */
const MAX_OFFICER_STREAM_MS = 15 * 60_000;

function encodeSse(event: LiveEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Server-Sent Events hub. One long-lived response per open tab, shared by the
 * map and the war room (see `components/live-connection.ts`). Map bodies are
 * not pushed here — only version bumps; clients fetch `/api/map` when the
 * version advances. Chat lines travel whole, and only to officers.
 */
export async function GET(request: Request): Promise<Response> {
  const bus = getLiveBus();
  const encoder = new TextEncoder();
  // Read before the stream starts: `cookies()` is only available while the
  // request is still being handled.
  const officer = canPlan(await getRole());

  let cleanup: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: LiveEvent) => {
        if (!officer && isOfficerEvent(event)) return;
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
      const expiry = officer
        ? setTimeout(() => cleanup?.(), MAX_OFFICER_STREAM_MS)
        : null;

      cleanup = () => {
        clearInterval(ping);
        if (expiry) clearTimeout(expiry);
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

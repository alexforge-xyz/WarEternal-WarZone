import { getMessagesAfter, getRecentMessages } from "@/db/queries";
import { getRole } from "@/lib/auth";
import { canPlan } from "@/lib/roles";
import type { ChatMessage } from "@/lib/live-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Chat catch-up. The room is pushed over SSE; this is what a tab calls after a
 * reconnect to fill the gap it slept through — `?after=<last id it holds>`.
 * Without `after` it answers with the tail, which is also what a cold open
 * would need if the page ever stops server-rendering the history.
 */
export async function GET(request: Request): Promise<Response> {
  if (!canPlan(await getRole())) {
    return Response.json({ error: "denied" }, { status: 403 });
  }

  const raw = new URL(request.url).searchParams.get("after");
  const after = raw === null ? null : Number(raw);
  const rows =
    after !== null && Number.isInteger(after) && after >= 0
      ? await getMessagesAfter(after)
      : await getRecentMessages();

  const messages: ChatMessage[] = rows.map((m) => ({
    id: m.id,
    nick: m.nick,
    body: m.body,
    nodeId: m.nodeId,
    at: m.at,
  }));

  return Response.json({ messages }, { headers: { "Cache-Control": "no-store" } });
}

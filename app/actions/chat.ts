"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { messages, nodes } from "@/db/schema";
import { getUser } from "@/lib/auth";
import type { ChatMessage } from "@/lib/live-events";
import { notifyChat, notifyTyping } from "@/lib/live-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { canPlan } from "@/lib/roles";
import { nowSeconds } from "@/lib/staleness";
import type { ActionState } from "./nodes";

/**
 * The war room. Unlike the map actions this one takes the author from the
 * session rather than a self-declared nickname: the room is closed, and a line
 * of planning is only worth anything if it is clear who committed to it.
 */

/** Long enough for a plan, short enough that nobody pastes a wall into it. */
const MAX_BODY = 600;

/** Per account, per hour. Generous for a raid night, a wall against a loop. */
const MAX_PER_HOUR = 400;

/**
 * Typing pulses while composing. Client already throttles; this caps a looped
 * tab. Stops (`active: false`) are not counted — they are cheap and must go
 * through so the indicator does not stick after send.
 */
const MAX_TYPING_PER_HOUR = 1_200;

/** The stored line comes back so the sender's own tab renders it immediately. */
export type SendState = ActionState & { sent?: ChatMessage };

export async function sendMessage(
  body: string,
  nodeId: number | null,
): Promise<SendState> {
  const me = await getUser();
  if (!me || !canPlan(me.role)) return { ok: false, error: "auth.denied" };

  const text = (body ?? "").trim().slice(0, MAX_BODY);
  if (!text) return { ok: false, error: "chat.blank" };

  if (!checkRateLimit(`chat:${me.id}`, MAX_PER_HOUR)) {
    return { ok: false, error: "chat.tooFast" };
  }

  // A pinned node that no longer exists drops the pin instead of the message:
  // the sentence is still worth reading after an admin deletes the node.
  let pin: number | null = null;
  if (nodeId !== null && Number.isInteger(nodeId)) {
    const [node] = await db
      .select({ id: nodes.id })
      .from(nodes)
      .where(eq(nodes.id, nodeId))
      .limit(1);
    pin = node?.id ?? null;
  }

  const [row] = await db
    .insert(messages)
    .values({
      userId: me.id,
      nick: me.nick,
      body: text,
      nodeId: pin,
      at: nowSeconds(),
    })
    .returning();

  const sent: ChatMessage = {
    id: row.id,
    nick: row.nick,
    body: row.body,
    nodeId: row.nodeId,
    at: row.at,
  };

  // No `revalidatePath`: the room is a live surface, and re-rendering the RSC
  // tree under an open composer would cost the officer their half-typed line.
  // Push is best-effort: the row is already committed. A dead bus must not turn
  // a successful send into an error toast — other tabs catch up via /api/chat.
  try {
    // Sending ends the "is typing" state for everyone watching.
    notifyTyping(me.id, me.nick, false);
    notifyChat(sent);
  } catch {
    /* live bus glitch (HMR shape drift, etc.) */
  }
  return { ok: true, sent };
}

/**
 * Ephemeral "I am typing" / "I stopped". Not stored — only pushed over SSE so
 * other open war rooms can show a line under the composer.
 */
export async function reportTyping(active: boolean): Promise<void> {
  const me = await getUser();
  if (!me || !canPlan(me.role)) return;

  if (active) {
    if (!checkRateLimit(`chat-typing:${me.id}`, MAX_TYPING_PER_HOUR)) return;
  }

  try {
    notifyTyping(me.id, me.nick, Boolean(active));
  } catch {
    /* bus glitch — indicator just stays quiet */
  }
}

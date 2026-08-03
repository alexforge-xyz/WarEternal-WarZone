import { redirect } from "next/navigation";
import {
  getMapData,
  getPlanSnapshot,
  getRecentMessages,
} from "@/db/queries";
import { getUser } from "@/lib/auth";
import { canPlan } from "@/lib/roles";
import { nowSeconds } from "@/lib/staleness";
import { WarRoomScreen } from "@/components/war-room-screen";
import type { ChatMessage } from "@/lib/live-events";

export const dynamic = "force-dynamic";

/**
 * The war room — chat next to the board, shared expansion trails, capture stats.
 *
 * Officer and up. Helpers keep the map current, which is a different job, and
 * the room is where commitments are made; a guest never sees it exists.
 */
export default async function Page() {
  const me = await getUser();
  if (!me) redirect("/login");
  if (!canPlan(me.role)) redirect("/");

  const [{ nodes, edges }, history, plan] = await Promise.all([
    getMapData(),
    getRecentMessages(),
    getPlanSnapshot(),
  ]);

  const messages: ChatMessage[] = history.map((m) => ({
    id: m.id,
    nick: m.nick,
    body: m.body,
    nodeId: m.nodeId,
    at: m.at,
  }));

  return (
    <WarRoomScreen
      nodes={nodes}
      edges={edges}
      messages={messages}
      plan={plan}
      serverNow={nowSeconds()}
      selfUserId={me.id}
    />
  );
}

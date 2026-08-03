import { getPlanSnapshot } from "@/db/queries";
import { getRole } from "@/lib/auth";
import { canPlan } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Shared expansion plan snapshot for war-room tabs (officer+). */
export async function GET(): Promise<Response> {
  if (!canPlan(await getRole())) {
    return Response.json({ error: "denied" }, { status: 403 });
  }
  const plan = await getPlanSnapshot();
  return Response.json(plan, {
    headers: { "Cache-Control": "no-store" },
  });
}

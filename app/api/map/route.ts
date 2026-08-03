import { getMapData } from "@/db/queries";
import { getLiveBus } from "@/lib/live-server";
import { nowSeconds } from "@/lib/staleness";
import type { MapSnapshot } from "@/lib/live-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lightweight map snapshot for live clients. Public read — same visibility as
 * `/map`. Keep this cheap: SQLite select only, no HTML shell.
 */
export async function GET(): Promise<Response> {
  const bus = getLiveBus();
  const { nodes, edges } = await getMapData();
  const body: MapSnapshot = {
    boot: bus.boot,
    version: bus.getVersion(),
    serverNow: nowSeconds(),
    nodes,
    edges,
  };
  return Response.json(body, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

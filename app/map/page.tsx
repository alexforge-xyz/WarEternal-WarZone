import { getMapData } from "@/db/queries";
import { MapScreen } from "@/components/map-screen";
import { nowSeconds } from "@/lib/staleness";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { nodes, edges } = await getMapData();
  // Countdowns are corrected against this so a drifting phone clock does not
  // put two officers on different shield timers.
  return <MapScreen nodes={nodes} edges={edges} serverNow={nowSeconds()} />;
}

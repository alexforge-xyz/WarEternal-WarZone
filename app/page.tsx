import { getMapData } from "@/db/queries";
import { NodesScreen } from "@/components/nodes-screen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { nodes, edges } = await getMapData();

  // How many roads each node has — surfaces what is still left to link.
  const linkCounts: Record<number, number> = {};
  for (const e of edges) {
    linkCounts[e.aId] = (linkCounts[e.aId] ?? 0) + 1;
    linkCounts[e.bId] = (linkCounts[e.bId] ?? 0) + 1;
  }

  return <NodesScreen nodes={nodes} linkCounts={linkCounts} />;
}

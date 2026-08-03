import { getNodes } from "@/db/queries";
import { StatsScreen } from "@/components/stats-screen";

export const dynamic = "force-dynamic";

/** Public: no role needed, this is the page everyone is allowed to read. */
export default async function Page() {
  const nodes = await getNodes();
  return <StatsScreen nodes={nodes} />;
}

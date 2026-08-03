import { getMapData } from "@/db/queries";
import { LinkEditor } from "@/components/link-editor";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { nodes, edges } = await getMapData();
  return <LinkEditor nodes={nodes} edges={edges} />;
}

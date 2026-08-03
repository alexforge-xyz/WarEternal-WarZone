import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { invites } from "@/db/schema";
import { JoinForm } from "@/components/join-form";
import { InviteProblem } from "@/components/invite-problem";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [invite] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.token, token), isNull(invites.usedAt)))
    .limit(1);

  if (!invite) return <InviteProblem reason="auth.badInvite" />;
  if (invite.expiresAt < Math.floor(Date.now() / 1000)) {
    return <InviteProblem reason="auth.expiredInvite" />;
  }

  return (
    <JoinForm
      token={token}
      role={invite.role}
      invitedBy={invite.createdBy}
    />
  );
}

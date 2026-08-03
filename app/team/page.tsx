import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { asc, desc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, invites, users } from "@/db/schema";
import { getUser, invitableRoles } from "@/lib/auth";
import { TeamScreen } from "@/components/team-screen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await getUser();
  // Helpers have no business here; guests get sent to sign in.
  if (!me) redirect("/login");
  if (me.role === "helper") redirect("/");

  const [userRows, inviteRows, log, h] = await Promise.all([
    db.select().from(users).orderBy(asc(users.role), asc(users.nick)),
    db
      .select()
      .from(invites)
      .where(isNull(invites.usedAt))
      .orderBy(desc(invites.createdAt)),
    db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(60),
    headers(),
  ]);

  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";

  return (
    <TeamScreen
      me={me}
      users={userRows}
      invites={inviteRows}
      log={log}
      invitable={invitableRoles(me.role)}
      origin={`${proto}://${host}`}
      now={Math.floor(Date.now() / 1000)}
    />
  );
}

"use client";

import { createContext, useContext } from "react";
import { canEdit, canMonitor, canPlan, type Role } from "@/lib/roles";

type Ctx = {
  role: Role;
  canMonitor: boolean;
  canPlan: boolean;
  canEdit: boolean;
};

const RoleCtx = createContext<Ctx>({
  role: "guest",
  canMonitor: false,
  canPlan: false,
  canEdit: false,
});

export function RoleProvider({
  role,
  children,
}: {
  role: Role;
  children: React.ReactNode;
}) {
  return (
    <RoleCtx.Provider
      value={{
        role,
        canMonitor: canMonitor(role),
        canPlan: canPlan(role),
        canEdit: canEdit(role),
      }}
    >
      {children}
    </RoleCtx.Provider>
  );
}

/**
 * Drives what the UI offers. It is not the security boundary — every mutating
 * server action re-checks the role on the server.
 */
export function useRole(): Ctx {
  return useContext(RoleCtx);
}

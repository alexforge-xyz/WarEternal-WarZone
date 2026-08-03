/**
 * Access levels. Deliberately not scoped per kingdom: the map is built for K6
 * and K6 has to be able to record what every other kingdom holds.
 *
 *   guest    — sees everything, changes nothing (public link)
 *   helper   — monitors the map: ownership, shields, confirmations
 *   officer  — helper + planning tools
 *   admin    — officer + editing nodes and roads (the static map data)
 */
export const ROLES = ["guest", "helper", "officer", "admin"] as const;
export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = {
  guest: 0,
  helper: 1,
  officer: 2,
  admin: 3,
};

export function atLeast(role: Role, needed: Role): boolean {
  return RANK[role] >= RANK[needed];
}

/** Update ownership, shields and confirmations. */
export function canMonitor(role: Role): boolean {
  return atLeast(role, "helper");
}

/** Planning tools: routes, capture simulation. */
export function canPlan(role: Role): boolean {
  return atLeast(role, "officer");
}

/** Edit the static map: nodes and roads. */
export function canEdit(role: Role): boolean {
  return atLeast(role, "admin");
}

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

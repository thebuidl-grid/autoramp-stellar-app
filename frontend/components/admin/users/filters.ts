import type { AdminUser } from "@/lib/api";

export type UserStatusFilter = "all" | "active" | "suspended";
export type UserRoleFilter = "all" | "admin" | "user";

const isAdmin = (u: Pick<AdminUser, "role">) => String(u.role ?? "").toLowerCase() === "admin";

/** Applies the status and role filters on the rows we have. The server is asked too; this keeps the list right if it ignores one. */
export function applyUserFilters<T extends Pick<AdminUser, "role" | "suspended">>(users: T[], status: UserStatusFilter, role: UserRoleFilter): T[] {
  return users
    .filter((u) => (status === "active" ? !u.suspended : status === "suspended" ? !!u.suspended : true))
    .filter((u) => (role === "admin" ? isAdmin(u) : role === "user" ? !isAdmin(u) : true));
}

/** True when the server sent rows that do not match the role we asked for, i.e. it ignored the filter. Its page counts are then wrong. */
export function serverIgnoredRole(users: Array<Pick<AdminUser, "role">>, role: UserRoleFilter): boolean {
  if (role === "all") return false;
  return users.some((u) => (role === "admin" ? !isAdmin(u) : isAdmin(u)));
}

export const userStatusKey = (u: Pick<AdminUser, "suspended">) => (u.suspended ? "SUSPENDED" : "ACTIVE");

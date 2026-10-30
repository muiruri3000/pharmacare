import { useAuth } from "@/lib/auth/AuthProvider";
import type { UserRole } from "@/lib/types";

export type Action = "view" | "create" | "edit" | "delete";

/** Resources only an admin may reach at all. */
const ADMIN_ONLY_RESOURCES = ["users", "tenant-settings"] as const;

/** Resources a sales user cannot see (inventory management, purchasing edits). */
const SALES_HIDDEN_RESOURCES = ["purchase-orders", "suppliers", "stock-movements"] as const;

/** Resources a technician cannot see (financial/checkout). */
const TECHNICIAN_HIDDEN_RESOURCES = ["sales", "users"] as const;

export function normalizeRole(role?: UserRole | null): "admin" | "sales" | "technician" | "none" {
  const r = String(role ?? "").toLowerCase();
  if (r === "admin") return "admin";
  if (r === "sales") return "sales";
  if (r === "technician") return "technician";
  return "none";
}

export function useRole() {
  const { user } = useAuth();
  const role = normalizeRole(user?.role);
  return {
    role,
    isAdmin: role === "admin",
    isSales: role === "sales",
    isTechnician: role === "technician",
    tenantId: user?.tenant_id ?? null,
    tenantType: user?.tenant_type ?? null,
  };
}

/**
 * Permission matrix (mirrors backend/core/permissions.py):
 * - admin      → everything within the tenant, including delete + user management.
 * - sales      → POS: create/view sales & customers, read-only inventory, no purchasing/users.
 * - technician → inventory & dispensing: manage products/batches/stock/prescriptions,
 *                no sales/financial access, no user management.
 */
export function can(
  role: ReturnType<typeof normalizeRole>,
  action: Action,
  resource: string,
): boolean {
  if (role === "admin") return true;

  if ((ADMIN_ONLY_RESOURCES as readonly string[]).includes(resource)) return false;

  if (role === "sales") {
    if ((SALES_HIDDEN_RESOURCES as readonly string[]).includes(resource)) return false;
    if (resource === "products" || resource === "batches") return action === "view";
    if (resource === "prescriptions") return action === "view" || action === "create";
    return action !== "delete";
  }

  if (role === "technician") {
    if ((TECHNICIAN_HIDDEN_RESOURCES as readonly string[]).includes(resource)) return false;
    if (resource === "purchase-orders" || resource === "suppliers") return action !== "delete";
    return action !== "delete";
  }

  return false;
}

export function usePermissions() {
  const { role, ...rest } = useRole();
  return {
    role,
    ...rest,
    can: (action: Action, resource: string) => can(role, action, resource),
  };
}

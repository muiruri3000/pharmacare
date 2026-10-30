import { createFileRoute, Navigate, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { PageLoader } from "@/components/common/PageLoader";
import { useAuth } from "@/lib/auth/AuthProvider";
import { normalizeRole } from "@/lib/auth/permissions";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

/** Paths only an admin may open. */
const ADMIN_ONLY = ["/admin", "/reports"];
/** Paths a sales user may not open (inventory management, purchasing). */
const SALES_BLOCKED = ["/suppliers", "/purchase-orders", "/stock-movements"];
/** Paths a technician may not open (POS / checkout). */
const TECHNICIAN_BLOCKED = ["/sales"];

function AuthenticatedLayout() {
  const { isAuthenticated, isHydrated, user } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!isHydrated) return <PageLoader label="Loading session…" />;
  if (!isAuthenticated) {
    const redirect =
      typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
    return <Navigate to="/login" search={{ redirect }} />;
  }

  const role = normalizeRole(user?.role);
  const matches = (list: string[]) => list.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (role !== "admin" && matches(ADMIN_ONLY)) return <Navigate to="/" />;
  if (role === "sales" && matches(SALES_BLOCKED)) return <Navigate to="/" />;
  if (role === "technician" && matches(TECHNICIAN_BLOCKED)) return <Navigate to="/" />;

  return <AppShell />;
}

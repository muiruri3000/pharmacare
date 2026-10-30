import { ReactNode } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { AppSidebar } from "./AppSidebar";
import {
  ShieldCheck,
  Building2,
  Store,
  Boxes,
  Activity,
  Flame,
  Stethoscope,
  Truck,
  Sparkles,
} from "lucide-react";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { tenant, user } = useAuth();
  const isRetail = tenant?.tenant_type === "retail";

  return (
    <div
      data-tenant={tenant?.tenant_type || "retail"}
      className="flex h-screen w-full overflow-hidden bg-background font-sans antialiased text-foreground selection:bg-primary/20 selection:text-primary"
    >
      {/* Sidebar with themed dark tone */}
      <AppSidebar />

      {/* Main Workspace Area */}
      <div className="flex flex-1 flex-col overflow-hidden bg-background/95">
        {/* Contextual Pharmacy Banner (No blinding stark white, tinted with theme colors) */}
        <header
          className={`h-14 border-b px-6 flex items-center justify-between shrink-0 shadow-xs backdrop-blur-md ${
            isRetail
              ? "bg-emerald-950/10 border-emerald-900/15 text-emerald-950 dark:text-emerald-100"
              : "bg-slate-900/10 border-slate-800/15 text-slate-900 dark:text-slate-100"
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-lg shadow-inner ${
                isRetail
                  ? "bg-emerald-600 text-white ring-2 ring-emerald-500/30"
                  : "bg-blue-600 text-white ring-2 ring-blue-500/30"
              }`}
            >
              {isRetail ? (
                <Store className="h-4 w-4" />
              ) : (
                <Truck className="h-4 w-4" />
              )}
            </span>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold tracking-tight text-sm">
                  {tenant?.name || "PharmaCare Operational Hub"}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-wider ${
                    isRetail
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                      : "bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800"
                  }`}
                >
                  {isRetail ? (
                    <>
                      <Stethoscope className="h-3 w-3" /> Retail Dispensary
                    </>
                  ) : (
                    <>
                      <Boxes className="h-3 w-3" /> Wholesale Depot
                    </>
                  )}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <span>Domain:</span>
                <span className="font-mono text-foreground/80">{tenant?.subdomain || "local"}</span>
                <span>•</span>
                <span>Tier:</span>
                <span className="font-medium text-foreground/90 capitalize">
                  {isRetail ? "Clinical OTC & Prescriptions" : "Bulk Supply & Logistics"}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live FEFO Status Pill */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-secondary/80 border border-border text-foreground/90 shadow-2xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[11px] font-mono tracking-tight text-foreground/80">FEFO Engine Active</span>
            </div>

            {/* User role indicator */}
            <div className="flex items-center gap-2 pl-2 border-l border-border/80">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                <span className="capitalize">{user?.role?.replace("_", " ") || "Staff"}</span>
              </span>
              <span className="text-xs text-muted-foreground font-mono hidden md:inline">
                {user?.username}
              </span>
            </div>
          </div>
        </header>

        {/* Scrollable Workspace */}
        <main className="flex-1 overflow-y-auto p-6 bg-background/50">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

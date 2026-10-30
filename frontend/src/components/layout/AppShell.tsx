import * as React from "react";
import { Outlet } from "@tanstack/react-router";
import { Pill, Boxes, ShieldCheck, Activity } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useRole } from "@/lib/auth/permissions";

export function AppShell() {
  const { user } = useAuth();
  const { tenantType, role } = useRole();
  const isWholesale = tenantType === "wholesale";

  return (
    <div data-tenant={tenantType ?? "retail"}>
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background text-foreground">
          <div className="print:hidden">
            <AppSidebar />
          </div>
          <div className="flex-1 flex flex-col min-w-0">
            <header className="h-14 flex items-center gap-3 border-b border-border bg-card/60 backdrop-blur sticky top-0 z-10 px-3 md:px-4 print:hidden">
              <SidebarTrigger />

              <div className="flex items-center gap-2 pl-1">
                <Badge
                  variant="outline"
                  className={
                    isWholesale
                      ? "gap-1.5 py-1 px-2.5 text-xs font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30"
                      : "gap-1.5 py-1 px-2.5 text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                  }
                >
                  {isWholesale ? <Boxes className="h-3.5 w-3.5" /> : <Pill className="h-3.5 w-3.5" />}
                  <span>{isWholesale ? "Wholesale Depot" : "Retail Dispensary"}</span>
                </Badge>

                {user?.tenant_name ? (
                  <span className="text-xs md:text-sm font-medium text-foreground/80 truncate max-w-[180px] md:max-w-[320px]">
                    {user.tenant_name}
                  </span>
                ) : null}
              </div>

              <div className="flex-1" />

              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted/60 text-[11px] font-mono text-muted-foreground border border-border/40">
                  <Activity className="h-3 w-3 text-primary animate-pulse" />
                  <span>FEFO Engine Active</span>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-card border border-border/60 rounded-md px-2.5 py-1 shadow-2xs">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  <span className="capitalize font-medium text-foreground">{role ?? "Staff"}</span>
                  <span className="hidden md:inline text-muted-foreground">({user?.username})</span>
                </div>
              </div>
            </header>

            <main className="flex-1 p-4 md:p-6 max-w-[1600px] w-full mx-auto print:p-0 print:max-w-none">
              <Outlet />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </div>
  );
}

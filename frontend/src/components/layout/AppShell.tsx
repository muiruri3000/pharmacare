import { Outlet } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/lib/auth/AuthProvider";

export function AppShell() {
  const { user } = useAuth();
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <div className="print:hidden">
          <AppSidebar />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-3 border-b border-border bg-card/40 backdrop-blur sticky top-0 z-10 px-3 print:hidden">
            <SidebarTrigger />
            <div className="flex-1" />
            <div className="text-sm text-muted-foreground">
              {user ? `Signed in as ${user.username}` : null}
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 max-w-[1600px] w-full mx-auto print:p-0 print:max-w-none">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

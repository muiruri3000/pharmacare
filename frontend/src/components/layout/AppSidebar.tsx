import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Pill,
  Boxes,
  PackageSearch,
  ClipboardList,
  ShoppingCart,
  Users,
  Truck,
  FileText,
  UserCog,
  BarChart3,
  History,
  Settings,
  LogOut,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useRole } from "@/lib/auth/permissions";

type NavItem = { title: string; url: string; icon: typeof LayoutDashboard };
type NavGroup = { label: string; items: NavItem[] };

const overviewGroup: NavGroup = {
  label: "Overview",
  items: [{ title: "Dashboard", url: "/", icon: LayoutDashboard }],
};

const inventoryGroup: NavGroup = {
  label: "Inventory",
  items: [
    { title: "Products", url: "/products", icon: Pill },
    { title: "Batches & expiry", url: "/batches", icon: Boxes },
    { title: "Stock movements", url: "/stock-movements", icon: PackageSearch },
  ],
};

const salesGroup: NavGroup = {
  label: "Sales",
  items: [
    { title: "Point of sale", url: "/sales", icon: ShoppingCart },
    { title: "Customers", url: "/customers", icon: Users },
  ],
};

const prescriptionsGroup: NavGroup = {
  label: "Dispensing",
  items: [{ title: "Prescriptions", url: "/prescriptions", icon: ClipboardList }],
};

const purchasingGroup: NavGroup = {
  label: "Purchasing",
  items: [
    { title: "Suppliers", url: "/suppliers", icon: Truck },
    { title: "Purchase orders", url: "/purchase-orders", icon: FileText },
  ],
};

const adminGroup: NavGroup = {
  label: "Admin",
  items: [
    { title: "Reports", url: "/reports", icon: BarChart3 },
    { title: "Users", url: "/admin/users", icon: UserCog },
    { title: "Activity log", url: "/admin/activity-log", icon: History },
  ],
};

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { logout, user } = useAuth();
  const { isMobile, setOpenMobile } = useSidebar();
  const { isAdmin, isSales, isTechnician, tenantType } = useRole();

  // Nav is role-aware; the backend still enforces every restriction
  // (core/permissions.py) regardless of what the sidebar shows.
  const groups: NavGroup[] = [
    overviewGroup,
    ...(isTechnician || isAdmin ? [inventoryGroup] : [{ ...inventoryGroup, items: [inventoryGroup.items[0]] }]),
    ...(isSales || isAdmin ? [salesGroup] : []),
    prescriptionsGroup,
    ...(isSales ? [] : [purchasingGroup]),
    ...(isAdmin ? [adminGroup] : []),
  ];

  const isActive = (url: string) =>
    url === "/" ? pathname === "/" : pathname === url || pathname.startsWith(url + "/");

  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="h-8 w-8 rounded-md bg-sidebar-primary/20 grid place-items-center glow">
            <Pill className="h-4 w-4 text-sidebar-primary" />
          </div>
          <div className="leading-tight group-data-[collapsible=icon]:hidden">
            <div className="text-sm font-semibold">PharmaCare</div>
            <div className="text-[11px] text-sidebar-foreground/70 capitalize">
              {tenantType ?? "Pharmacy"} · {user?.tenant_name ?? ""}
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <Link to={item.url} className="flex items-center gap-2" onClick={handleNavClick}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/account")}>
              <Link to="/account" className="flex items-center gap-2" onClick={handleNavClick}>
                <Settings className="h-4 w-4" />
                <span>Account</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => {
                handleNavClick();
                logout();
              }}
            >
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

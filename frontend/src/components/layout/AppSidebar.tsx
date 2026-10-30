import * as React from "react";
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
  Building2,
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

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { logout, user } = useAuth();
  const { isMobile, setOpenMobile } = useSidebar();
  const { isAdmin, isSales, isTechnician, tenantType } = useRole();

  const isWholesale = tenantType === "wholesale";

  const overviewGroup: NavGroup = {
    label: "Operations",
    items: [{ title: isWholesale ? "Logistics Dashboard" : "Dispensary Overview", url: "/", icon: LayoutDashboard }],
  };

  const inventoryGroup: NavGroup = {
    label: "Inventory & FEFO",
    items: [
      { title: isWholesale ? "Catalog & Bulk Units" : "Medicines & Products", url: "/products", icon: Pill },
      { title: isWholesale ? "Lots & Pallet Expiry" : "Batches & Expiry (FEFO)", url: "/batches", icon: Boxes },
      { title: isWholesale ? "Stock Movement Ledger" : "Stock Movements", url: "/stock-movements", icon: PackageSearch },
    ],
  };

  const salesGroup: NavGroup = {
    label: isWholesale ? "B2B Sales & Orders" : "Point of Sale (POS)",
    items: [
      { title: isWholesale ? "B2B Order Desk" : "Dispensary POS Counter", url: "/sales", icon: ShoppingCart },
      { title: isWholesale ? "Client Accounts" : "Patients & Customers", url: "/customers", icon: Users },
    ],
  };

  const prescriptionsGroup: NavGroup = {
    label: "Pharmacy Dispensing",
    items: [
      {
        title: isWholesale ? "Controlled Dispensing" : "Prescription Queue",
        url: "/prescriptions",
        icon: ClipboardList,
      },
    ],
  };

  const purchasingGroup: NavGroup = {
    label: "Procurement",
    items: [
      { title: isWholesale ? "Pharmaceutical Vendors" : "Drug Suppliers", url: "/suppliers", icon: Truck },
      { title: isWholesale ? "Inbound Shipments (POs)" : "Purchase Orders", url: "/purchase-orders", icon: FileText },
    ],
  };

  const adminGroup: NavGroup = {
    label: "Management & Audit",
    items: [
      { title: "Financial & Expiry Reports", url: "/reports", icon: BarChart3 },
      { title: "Staff & User Roles", url: "/admin/users", icon: UserCog },
      { title: "Audit & Activity Log", url: "/admin/activity-log", icon: History },
    ],
  };

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
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="h-9 w-9 rounded-lg bg-sidebar-primary/20 border border-sidebar-border grid place-items-center glow shrink-0">
            {isWholesale ? (
              <Building2 className="h-5 w-5 text-sidebar-primary" />
            ) : (
              <Pill className="h-5 w-5 text-sidebar-primary" />
            )}
          </div>
          <div className="leading-tight group-data-[collapsible=icon]:hidden min-w-0">
            <div className="text-sm font-semibold tracking-tight text-sidebar-foreground truncate">
              PharmaCare
            </div>
            <div className="text-[11px] text-sidebar-foreground/70 capitalize truncate">
              {isWholesale ? "Wholesale Hub" : "Retail Pharmacy"} · {user?.tenant_name ?? "Store"}
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                      <Link to={item.url} className="flex items-center gap-2.5" onClick={handleNavClick}>
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.title}</span>
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
            <SidebarMenuButton asChild isActive={isActive("/account")} tooltip="Account Settings">
              <Link to="/account" className="flex items-center gap-2.5" onClick={handleNavClick}>
                <Settings className="h-4 w-4" />
                <span>Account</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Sign out"
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

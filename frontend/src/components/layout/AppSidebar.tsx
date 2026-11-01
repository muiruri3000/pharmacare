import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  LayoutDashboard,
  ShoppingCart,
  Pill,
  FileText,
  Boxes,
  Users,
  Building2,
  TrendingUp,
  History,
  LogOut,
  Sparkles,
  ArrowRightLeft,
  Truck,
  Shield,
  Stethoscope,
  ScanBarcode,
  PackageCheck,
  ClipboardList,
} from "lucide-react";

export function AppSidebar() {
  const { user, tenant, logout } = useAuth();
  const router = useRouterState();
  const currentPath = router.location.pathname;

  const isRetail = tenant?.tenant_type === "retail";
  const role = user?.role;

  // Custom navigation tailored to pharmacy workflows
  const navItems = [
    {
      label: "Overview",
      items: [
        {
          name: isRetail ? "Dispensary Hub" : "Warehouse Hub",
          path: "/",
          icon: LayoutDashboard,
          roles: ["admin", "sales", "technician"],
        },
      ],
    },
    {
      label: isRetail ? "Dispensary Operations" : "Order Logistics",
      items: [
        {
          name: isRetail ? "POS Counter & Sales" : "B2B Order Desk",
          path: "/sales",
          icon: isRetail ? ScanBarcode : ShoppingCart,
          roles: ["admin", "sales", "technician"],
        },
        {
          name: isRetail ? "Prescription Queue" : "Controlled Dispensing",
          path: "/prescriptions",
          icon: Stethoscope,
          roles: ["admin", "sales", "technician"],
        },
        {
          name: isRetail ? "Patients & Customers" : "Client Accounts",
          path: "/customers",
          icon: Users,
          roles: ["admin", "sales", "technician"],
        },
      ],
    },
    {
      label: "Stock & Controlled Supply",
      items: [
        {
          name: isRetail ? "Medicine Catalog" : "Wholesale Catalog",
          path: "/products",
          icon: Pill,
          roles: ["admin", "sales", "technician"],
        },
        {
          name: isRetail ? "Batches & Expiry (FEFO)" : "Lots & Pallet Expiry",
          path: "/batches",
          icon: Boxes,
          roles: ["admin", "sales", "technician"],
        },
        {
          name: "Stock Movements",
          path: "/movements",
          icon: ArrowRightLeft,
          roles: ["admin", "technician"],
        },
      ],
    },
    {
      label: "Procurement & Vendors",
      items: [
        {
          name: isRetail ? "Distributor Orders" : "Manufacturer Inbound",
          path: "/purchasing",
          icon: Truck,
          roles: ["admin", "sales", "technician"],
        },
        {
          name: "Suppliers & Vendors",
          path: "/suppliers",
          icon: Building2,
          roles: ["admin", "technician"],
        },
      ],
    },
    {
      label: "Governance & Audits",
      items: [
        {
          name: "Sales & Stock Analytics",
          path: "/reports",
          icon: TrendingUp,
          roles: ["admin"],
        },
        {
          name: "Activity Audit Log",
          path: "/admin/activity-log",
          icon: History,
          roles: ["admin"],
        },
        {
          name: "Staff Permissions",
          path: "/admin/users",
          icon: Shield,
          roles: ["admin"],
        },
      ],
    },
  ];

  return (
    <aside className="w-64 flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border shrink-0 select-none shadow-xl">
      {/* Brand Header */}
      <div className="h-14 flex items-center gap-3 px-5 border-b border-sidebar-border bg-sidebar-accent/30">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg shadow-sm font-bold text-white ${
            isRetail ? "bg-emerald-600" : "bg-blue-600"
          }`}
        >
          <span className="text-base font-serif italic">Rx</span>
        </div>
        <div>
          <span className="font-bold tracking-tight text-sm text-sidebar-foreground">
            PharmaCare
          </span>
          <span className="block text-[10px] text-sidebar-foreground/60 uppercase font-mono tracking-wider">
            {isRetail ? "Clinical POS" : "Depot ERP"}
          </span>
        </div>
      </div>

      {/* Navigation Groups */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {navItems.map((group) => {
          const visibleItems = group.items.filter((item) =>
            role ? item.roles.includes(role) : false
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.label} className="space-y-1">
              <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentPath === item.path;

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                        isActive
                          ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-xs"
                          : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${isActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/70"}`} />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer / User Profile */}
      <div className="p-3 border-t border-sidebar-border bg-sidebar-accent/20">
        <div className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-sidebar-accent/50 transition-colors">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="h-7 w-7 rounded-full bg-sidebar-primary/20 text-sidebar-primary flex items-center justify-center font-bold text-xs uppercase border border-sidebar-primary/40">
              {user?.username?.[0] || "U"}
            </div>
            <div className="truncate">
              <p className="text-xs font-medium truncate text-sidebar-foreground">
                {user?.username}
              </p>
              <p className="text-[10px] text-sidebar-foreground/60 capitalize font-mono">
                {user?.role}
              </p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            title="Sign out"
            className="p-1.5 text-sidebar-foreground/60 hover:text-red-400 hover:bg-sidebar-accent rounded-md transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

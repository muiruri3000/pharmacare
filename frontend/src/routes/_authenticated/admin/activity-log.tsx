import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ShoppingCart, Package, Truck, ClipboardList, UserCog, Ban, PackageCheck, Pill,
} from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable } from "@/components/data-table/DataTable";
import { formatDateTime } from "@/lib/format";
import { activityLogApi } from "@/lib/api/resources";
import type { ActivityLogEntry } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/admin/activity-log")({
  component: ActivityLogPage,
});

const ICONS: Record<string, typeof ShoppingCart> = {
  sale: ShoppingCart,
  product: Package,
  batch: Package,
  purchase_order: Truck,
  prescription: ClipboardList,
  user: UserCog,
};

function iconFor(action: string) {
  const prefix = action.split(".")[0];
  if (action.includes("voided")) return Ban;
  if (action.includes("received")) return PackageCheck;
  if (action.includes("dispensed")) return Pill;
  return ICONS[prefix] ?? ClipboardList;
}

function ActivityLogPage() {
  const [search, setSearch] = React.useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["activity-log", { search }],
    queryFn: () => activityLogApi.list({ search: search || undefined, ordering: "-created_at", page_size: 200 }),
  });

  return (
    <>
      <PageHeader title="Activity log" description="A record of what happened — who did what, and when." />
      <DataTable<ActivityLogEntry>
        rows={data}
        isLoading={isLoading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search activity…"
        columns={[
          { key: "icon", header: "", render: (e) => {
              const Icon = iconFor(e.action);
              return (
                <div className="h-8 w-8 rounded-md bg-muted grid place-items-center">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
              );
            } },
          { key: "description", header: "Event", render: (e) => (
              <div>
                <div className="font-medium">{e.description}</div>
                <div className="text-xs text-muted-foreground">{e.action}</div>
              </div>
          ) },
          { key: "user_name", header: "By", accessor: (e) => e.user_name ?? "System" },
          { key: "created_at", header: "When", accessor: (e) => formatDateTime(e.created_at) },
        ]}
        emptyTitle="No activity yet"
        emptyDescription="Business events — sales, receiving stock, dispensing — will show up here as they happen."
      />
    </>
  );
}

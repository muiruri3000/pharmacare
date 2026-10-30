import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Pill, AlertTriangle, CalendarClock, ShoppingCart } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/cards/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { MoneyCell } from "@/components/common/MoneyCell";
import { formatDate } from "@/lib/format";
import { useRole } from "@/lib/auth/permissions";
import { productsApi, salesApi } from "@/lib/api/resources";
import type { Sale } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardPage,
});

function isToday(iso?: string) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function DashboardPage() {
  const { tenantType, isSales } = useRole();

  const { data: products = [] } = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => productsApi.list({ page_size: 500 }),
  });

  const { data: expiring = [] } = useQuery({
    queryKey: ["products", "expiring-soon"],
    queryFn: () => productsApi.expiringSoon(30),
  });

  const { data: sales = [] } = useQuery({
    queryKey: ["sales", "recent"],
    queryFn: () => salesApi.list({ ordering: "-created_at", page_size: 20 }),
  });

  const lowStockCount = products.filter((p) => p.is_low_stock).length;
  const todaySales = sales.filter((s) => isToday(s.created_at) && s.status === "completed");
  const todayTotal = todaySales.reduce((sum, s) => sum + Number(s.total ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Overview of your ${tenantType === "wholesale" ? "wholesale" : "retail"} pharmacy.`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Active products" value={products.filter((p) => p.is_active).length} icon={<Pill className="h-4 w-4" />} />
        <StatCard
          label="Low stock"
          value={lowStockCount}
          hint={lowStockCount > 0 ? "Below reorder level" : "All good"}
          icon={<AlertTriangle className="h-4 w-4" />}
          accent={lowStockCount > 0}
        />
        <StatCard label="Batches expiring ≤30d" value={expiring.length} icon={<CalendarClock className="h-4 w-4" />} />
        {!isSales ? null : null}
        <StatCard label="Today's sales" value={<MoneyCell value={todayTotal} />} hint={`${todaySales.length} sale(s)`} icon={<ShoppingCart className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="card-gradient border-border shadow-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent sales</CardTitle>
            <Button variant="ghost" size="sm" asChild><Link to="/sales">View all</Link></Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {sales.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales yet.</p>
            ) : (
              sales.slice(0, 8).map((s: Sale) => (
                <div key={s.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                  <div>
                    <span className="font-medium">#{s.id}</span>{" "}
                    <span className="text-muted-foreground">{s.customer_name ?? "Walk-in"} · {formatDate(s.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={s.status} />
                    <MoneyCell value={s.total} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="card-gradient border-border shadow-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Expiring soon</CardTitle>
            <Button variant="ghost" size="sm" asChild><Link to="/batches">View all</Link></Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {expiring.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing expiring in the next 30 days.</p>
            ) : (
              expiring.slice(0, 8).map((b) => (
                <div key={b.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                  <div>
                    <span className="font-medium">{b.product_name}</span>{" "}
                    <span className="text-muted-foreground">Batch {b.batch_number} · Qty {b.quantity}</span>
                  </div>
                  <span className="text-warning">{formatDate(b.expiry_date)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

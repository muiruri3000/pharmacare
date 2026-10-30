import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { DollarSign, Package, AlertTriangle, TrendingUp } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/cards/StatCard";
import { ChartCard } from "@/components/cards/ChartCard";
import { MoneyCell } from "@/components/common/MoneyCell";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { reportsApi } from "@/lib/api/resources";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

const PIE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function ReportsPage() {
  const [period, setPeriod] = React.useState<"day" | "week" | "month">("day");
  const [days, setDays] = React.useState(30);

  const dateRange = React.useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }, [days]);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["reports", "sales-summary", period, dateRange],
    queryFn: () => reportsApi.salesSummary({ period, ...dateRange }),
  });

  const { data: byPayment, isLoading: paymentLoading } = useQuery({
    queryKey: ["reports", "sales-by-payment-method", dateRange],
    queryFn: () => reportsApi.salesByPaymentMethod(dateRange),
  });

  const { data: topProducts, isLoading: topLoading } = useQuery({
    queryKey: ["reports", "top-products", dateRange],
    queryFn: () => reportsApi.topProducts({ ...dateRange, limit: 8 }),
  });

  const { data: valuation, isLoading: valuationLoading } = useQuery({
    queryKey: ["reports", "inventory-valuation"],
    queryFn: () => reportsApi.inventoryValuation(),
  });

  const chartData = (summary?.results ?? []).map((r) => ({
    period: formatDate(r.period),
    total: Number(r.total),
  }));
  const totalRevenue = (summary?.results ?? []).reduce((sum, r) => sum + Number(r.total), 0);
  const totalSales = (summary?.results ?? []).reduce((sum, r) => sum + r.sale_count, 0);

  const paymentData = (byPayment?.results ?? []).map((r) => ({
    name: r.payment_method,
    value: Number(r.total),
  }));

  return (
    <>
      <PageHeader
        title="Reports"
        description="Sales trends, top products, and current inventory valuation."
        actions={
          <div className="flex items-center gap-2">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Daily</SelectItem>
                <SelectItem value="week">Weekly</SelectItem>
                <SelectItem value="month">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Revenue (period)" value={<MoneyCell value={totalRevenue} />} icon={<DollarSign className="h-4 w-4" />} />
        <StatCard label="Sales (period)" value={totalSales} icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard
          label="Inventory value (cost)"
          value={valuationLoading ? "…" : <MoneyCell value={valuation?.total_cost_value ?? 0} />}
          icon={<Package className="h-4 w-4" />}
        />
        <StatCard
          label="Expired stock (cost)"
          value={valuationLoading ? "…" : <MoneyCell value={valuation?.expired_stock_cost_value ?? 0} />}
          hint={Number(valuation?.expired_stock_cost_value ?? 0) > 0 ? "Needs write-off" : "None"}
          icon={<AlertTriangle className="h-4 w-4" />}
          accent={Number(valuation?.expired_stock_cost_value ?? 0) > 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2">
          <ChartCard title="Sales trend" description={summaryLoading ? "Loading…" : `${dateRange.start} to ${dateRange.end}`}>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="total" stroke="var(--primary)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
        <ChartCard title="By payment method" description={paymentLoading ? "Loading…" : undefined}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={paymentData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {paymentData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3 mt-2 justify-center">
            {paymentData.map((p, i) => (
              <div key={p.name} className="flex items-center gap-1.5 text-xs text-muted-foreground capitalize">
                <span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                {p.name}
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Top products by revenue" description={topLoading ? "Loading…" : undefined}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={(topProducts?.results ?? []).map((p) => ({ name: p.sku, revenue: Number(p.revenue) }))} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={70} stroke="var(--muted-foreground)" />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="revenue" fill="var(--accent)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Inventory value by category" description={valuationLoading ? "Loading…" : undefined}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Cost value</TableHead>
                <TableHead className="text-right">Retail value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(valuation?.by_category ?? []).map((c) => (
                <TableRow key={c.category}>
                  <TableCell>{c.category}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{c.quantity}</TableCell>
                  <TableCell className="text-right"><MoneyCell value={c.cost_value} /></TableCell>
                  <TableCell className="text-right"><MoneyCell value={c.retail_value} /></TableCell>
                </TableRow>
              ))}
              {!valuationLoading && (valuation?.by_category ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No stock on hand.</TableCell></TableRow>
              ) : null}
            </TableBody>
          </Table>
        </ChartCard>
      </div>
    </>
  );
}

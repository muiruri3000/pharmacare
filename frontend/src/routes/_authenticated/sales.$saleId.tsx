import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageLoader } from "@/components/common/PageLoader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { MoneyCell, formatMoney } from "@/components/common/MoneyCell";
import { formatDateTime } from "@/lib/format";
import { useAuth } from "@/lib/auth/AuthProvider";
import { salesApi } from "@/lib/api/resources";

export const Route = createFileRoute("/_authenticated/sales/$saleId")({
  component: ReceiptPage,
});

function ReceiptPage() {
  const { saleId } = Route.useParams();
  const { user } = useAuth();

  const { data: sale, isLoading } = useQuery({
    queryKey: ["sales", saleId],
    queryFn: () => salesApi.get(saleId),
  });

  if (isLoading) return <PageLoader label="Loading receipt…" />;
  if (!sale) return <p className="text-sm text-muted-foreground">Sale not found.</p>;

  return (
    <div className="max-w-lg mx-auto">
      {/* Screen-only controls — hidden entirely when printing via the print:hidden class */}
      <div className="flex items-center justify-between mb-4 print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/sales">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to sales
          </Link>
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1" /> Print
        </Button>
      </div>

      <Card className="card-gradient border-border shadow-card print:shadow-none print:border-0">
        <CardContent className="p-6 print:p-0">
          <div className="text-center mb-6">
            <p className="text-lg font-semibold">{user?.tenant_name ?? "PharmaCare"}</p>
            <p className="text-xs text-muted-foreground capitalize">{user?.tenant_type ?? ""} pharmacy</p>
          </div>

          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Receipt</span>
            <span className="font-medium">#{sale.id}</span>
          </div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Date</span>
            <span>{formatDateTime(sale.created_at)}</span>
          </div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Cashier</span>
            <span>{sale.sold_by_name ?? "—"}</span>
          </div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Customer</span>
            <span>{sale.customer_name ?? "Walk-in"}</span>
          </div>
          {sale.payments && sale.payments.length > 1 ? (
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Payment</span>
                <span className="font-medium">Split Payment</span>
              </div>
              <div className="pl-2 space-y-0.5 text-xs text-muted-foreground">
                {sale.payments.map((p, idx) => (
                  <div key={idx} className="flex justify-between font-mono">
                    <span className="capitalize">• {p.payment_method}:</span>
                    <span>{formatMoney(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex justify-between text-sm mb-4">
              <span className="text-muted-foreground">Payment</span>
              <span className="capitalize">{sale.payment_method}</span>
            </div>
          )}

          <div className="border-t border-dashed border-border my-3" />

          <div className="space-y-2 mb-4">
            {sale.items.map((item, i) => (
              <div key={item.id ?? i} className="flex justify-between text-sm">
                <div>
                  <div>{item.product_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.quantity} × {formatMoney(item.unit_price ?? 0)}
                  </div>
                </div>
                <MoneyCell value={item.subtotal ?? (Number(item.unit_price ?? 0) * item.quantity)} />
              </div>
            ))}
          </div>

          <div className="border-t border-dashed border-border my-3" />

          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Subtotal</span>
            <MoneyCell value={sale.subtotal ?? 0} />
          </div>
          {Number(sale.discount) > 0 ? (
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Discount</span>
              <span>-<MoneyCell value={sale.discount} /></span>
            </div>
          ) : null}
          {Number(sale.tax) > 0 ? (
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Tax</span>
              <MoneyCell value={sale.tax} />
            </div>
          ) : null}
          <div className="flex justify-between text-base font-semibold mt-2">
            <span>Total</span>
            <MoneyCell value={sale.total ?? 0} />
          </div>

          <div className="flex justify-center mt-4">
            <StatusBadge status={sale.status} />
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">Thank you — get well soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}

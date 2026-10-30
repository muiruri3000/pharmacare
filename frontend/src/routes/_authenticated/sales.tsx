import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  ShoppingCart,
  Ban,
  Receipt,
  Barcode,
  CreditCard,
  Banknote,
  Smartphone,
  Wallet,
  Building2,
  Pill,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/PageHeader";
import { usePermissions, useRole } from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/data-table/DataTable";
import { FormDialog, Field } from "@/components/forms/FormDialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { MoneyCell, formatMoney } from "@/components/common/MoneyCell";
import { EntitySelect } from "@/components/forms/EntitySelect";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatDate } from "@/lib/format";
import { salesApi, customersApi, productsApi } from "@/lib/api/resources";
import { ApiError } from "@/lib/api/client";
import type { Sale, PaymentMethod, ID, Product } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/sales")({
  component: SalesPage,
});

interface LineItem {
  key: string;
  product: ID | "";
  productName?: string;
  unitPrice?: number;
  quantity: number;
}

function newLine(): LineItem {
  return { key: Math.random().toString(36).slice(2), product: "", quantity: 1 };
}

function SalesPage() {
  const perms = usePermissions();
  const { tenantType, isAdmin } = useRole();
  const isWholesale = tenantType === "wholesale";
  const canCreate = perms.can("create", "sales");
  const canVoid = isAdmin;
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [toVoid, setToVoid] = React.useState<Sale | null>(null);
  const [customer, setCustomer] = React.useState<ID | "">("");
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>("cash");
  const [discount, setDiscount] = React.useState(0);
  const [lines, setLines] = React.useState<LineItem[]>([newLine()]);
  const [barcodeInput, setBarcodeInput] = React.useState("");
  const [scanning, setScanning] = React.useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ["sales", { search }],
    queryFn: () => salesApi.list({ search: search || undefined, ordering: "-created_at", page_size: 200 }),
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => productsApi.list({ page_size: 500 }),
  });

  const priceFor = (p: Product) => (isWholesale ? p.wholesale_price : p.retail_price);

  const save = useMutation({
    mutationFn: () =>
      salesApi.create({
        customer: customer || null,
        payment_method: paymentMethod,
        discount,
        tax: 0,
        items: lines
          .filter((l) => l.product)
          .map((l) => ({ product: l.product as ID, quantity: l.quantity })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(isWholesale ? "Wholesale order generated" : "Dispensary sale completed");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sale failed — check stock availability"),
  });

  const voidMutation = useMutation({
    mutationFn: (id: ID) => salesApi.void(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Sale voided — stock restored to batches");
      setToVoid(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Void failed"),
  });

  const openCreate = () => {
    setCustomer("");
    setPaymentMethod("cash");
    setDiscount(0);
    setLines([newLine()]);
    setBarcodeInput("");
    setDialogOpen(true);
  };

  const setLine = (key: string, patch: Partial<LineItem>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const handleBarcodeScan = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;
    setScanning(true);
    try {
      const product = await productsApi.lookupBarcode(code);
      setLines((prev) => {
        const existing = prev.find((l) => String(l.product) === String(product.id));
        if (existing) {
          return prev.map((l) =>
            l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l
          );
        }
        const blank = prev.find((l) => !l.product);
        const newEntry: LineItem = {
          key: blank ? blank.key : Math.random().toString(36).slice(2),
          product: product.id,
          productName: product.name,
          unitPrice: priceFor(product),
          quantity: 1,
        };
        return blank ? prev.map((l) => (l.key === blank.key ? newEntry : l)) : [...prev, newEntry];
      });
      toast.success(`Scanned: ${product.name}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        toast.error(`No medicine found for barcode / SKU "${code}"`);
      } else {
        toast.error(err instanceof Error ? err.message : "Barcode lookup failed");
      }
    } finally {
      setBarcodeInput("");
      setScanning(false);
    }
  };

  const subtotal = lines.reduce((sum, l) => sum + (l.unitPrice ?? 0) * l.quantity, 0);
  const total = Math.max(0, subtotal - discount);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lines.some((l) => l.product)) {
      toast.error("Please add at least one line item to the order");
      return;
    }
    save.mutate();
  };

  // Operational metrics
  const completedSales = React.useMemo(() => data.filter((s) => s.status === "completed"), [data]);
  const totalRevenue = React.useMemo(() => completedSales.reduce((acc, s) => acc + (s.total || 0), 0), [completedSales]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={isWholesale ? "B2B Order & Logistics Desk" : "Dispensary POS Counter"}
        description={
          isWholesale
            ? "Create wholesale client orders at trade pricing. Stock is automatically deducted from earliest-expiring lots (FEFO)."
            : "Ring up prescription and OTC medications at retail pricing with automatic FEFO batch allocation."
        }
        actions={
          canCreate ? (
            <Button onClick={openCreate} className="gap-1.5 shadow-2xs font-medium">
              <ShoppingCart className="h-4 w-4" />
              <span>{isWholesale ? "New Wholesale Order" : "Ring Up Sale"}</span>
            </Button>
          ) : undefined
        }
      />

      {/* Operational register cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border/70 shadow-2xs">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Settled Orders</p>
              <p className="text-xl font-bold font-mono tracking-tight">{completedSales.length}</p>
            </div>
            <Receipt className="h-5 w-5 text-muted-foreground/60" />
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-2xs">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Recorded Volume</p>
              <p className="text-xl font-bold font-mono tracking-tight text-primary">
                {formatMoney(totalRevenue)}
              </p>
            </div>
            <Wallet className="h-5 w-5 text-primary/70" />
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-2xs">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Active Price Tier</p>
              <div className="mt-1 flex items-center gap-1.5">
                <Badge variant={isWholesale ? "secondary" : "outline"} className="text-xs font-semibold capitalize">
                  {isWholesale ? "Wholesale Trade" : "Retail Patient RRP"}
                </Badge>
              </div>
            </div>
            {isWholesale ? <Building2 className="h-5 w-5 text-muted-foreground/60" /> : <Pill className="h-5 w-5 text-muted-foreground/60" />}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-2xs">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">FEFO Inventory Mode</p>
              <div className="mt-1 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Automated</span>
              </div>
            </div>
            <Sparkles className="h-5 w-5 text-emerald-600" />
          </CardContent>
        </Card>
      </div>

      <DataTable<Sale>
        rows={data}
        isLoading={isLoading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={isWholesale ? "Search by client or order #…" : "Search sales by customer or #…"}
        columns={[
          {
            key: "id",
            header: isWholesale ? "Order #" : "Receipt #",
            render: (s) => (
              <Link
                to="/sales/$saleId"
                params={{ saleId: String(s.id) }}
                className="text-primary hover:underline font-mono font-medium"
              >
                #{s.id}
              </Link>
            ),
          },
          { key: "created_at", header: "Timestamp", accessor: (s) => formatDate(s.created_at) },
          {
            key: "customer",
            header: isWholesale ? "Client Account" : "Patient / Customer",
            render: (s) => (
              <div className="flex items-center gap-1.5">
                <span className="font-medium">{s.customer_name ?? (isWholesale ? "General Account" : "Walk-in Patient")}</span>
                {!s.customer_name && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground py-0 px-1 font-mono">
                    Walk-in
                  </Badge>
                )}
              </div>
            ),
          },
          { key: "sold_by", header: isWholesale ? "Dispatcher" : "Cashier", accessor: (s) => s.sold_by_name ?? "—" },
          {
            key: "payment_method",
            header: "Payment",
            render: (s) => (
              <Badge variant="outline" className="capitalize text-xs font-mono font-normal">
                {s.payment_method}
              </Badge>
            ),
          },
          { key: "status", header: "Status", render: (s) => <StatusBadge status={s.status} /> },
          { key: "total", header: "Total", className: "text-right font-mono font-semibold", render: (s) => <MoneyCell value={s.total} /> },
        ]}
        actions={[
          {
            label: "Print receipt / invoice",
            icon: <Receipt className="h-4 w-4" />,
            onSelect: (s) => navigate({ to: "/sales/$saleId", params: { saleId: String(s.id) } }),
          },
          ...(canVoid
            ? [
                {
                  label: "Void transaction",
                  icon: <Ban className="h-4 w-4" />,
                  destructive: true,
                  onSelect: (s: Sale) => s.status !== "void" && setToVoid(s),
                },
              ]
            : []),
        ]}
        emptyTitle="No transactions recorded"
        emptyDescription={isWholesale ? "Create your first B2B order to record sales." : "Ring up your first dispensary sale."}
      />

      {/* POS / Order Entry Modal */}
      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={isWholesale ? "New Wholesale B2B Order" : "Dispensary POS Register"}
        description="Line items will be allocated automatically from earliest-expiring batches (FEFO)."
        onSubmit={onSubmit}
        isPending={save.isPending}
        submitLabel={isWholesale ? "Confirm & Dispatch Order" : "Complete & Print Receipt"}
        size="lg"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={isWholesale ? "Client Account" : "Patient / Customer (optional)"}>
            <EntitySelect
              value={customer}
              onChange={(id) => setCustomer(id)}
              queryKey={["customers", "all"]}
              fetcher={() => customersApi.list({ page_size: 500 })}
              getLabel={(c) => c.name}
              placeholder={isWholesale ? "Select client account" : "Walk-in Patient"}
            />
          </Field>
          <Field label="Settlement Method">
            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">
                  <span className="flex items-center gap-2">
                    <Banknote className="h-4 w-4 text-emerald-600" /> Cash
                  </span>
                </SelectItem>
                <SelectItem value="mpesa">
                  <span className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-green-600" /> M-Pesa
                  </span>
                </SelectItem>
                <SelectItem value="card">
                  <span className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-blue-600" /> Credit / Debit Card
                  </span>
                </SelectItem>
                <SelectItem value="credit">
                  <span className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-amber-600" /> Client Credit Line
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        {/* Barcode scanner wedge input */}
        <Field
          label="Barcode Scanner / SKU Entry"
          hint="Scan with USB/Bluetooth barcode reader or type medicine SKU and hit Enter."
        >
          <div className="relative">
            <Barcode className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={handleBarcodeScan}
              placeholder="Scan medicine barcode or enter SKU…"
              className="pl-8 font-mono text-sm"
              disabled={scanning}
              autoFocus
            />
          </div>
        </Field>

        {/* Item table */}
        <div className="space-y-2 border border-border/80 rounded-lg p-3 bg-muted/20">
          <div className="flex items-center justify-between pb-1 border-b border-border/60">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Prescription & Product Items ({lines.filter((l) => l.product).length})
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setLines((p) => [...p, newLine()])}
            >
              <Plus className="h-3 w-3 mr-1" /> Add Medicine
            </Button>
          </div>

          <div className="space-y-2 pt-1 max-h-[280px] overflow-y-auto pr-1">
            {lines.map((line, idx) => (
              <div key={line.key} className="flex items-center gap-2 bg-card p-2 rounded-md border border-border/60">
                <span className="text-xs font-mono text-muted-foreground w-4 text-center">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <EntitySelect
                    value={line.product}
                    onChange={(id) => {
                      const p = products.find((pr) => String(pr.id) === String(id));
                      setLine(line.key, { product: id, unitPrice: p ? priceFor(p) : undefined, productName: p?.name });
                    }}
                    queryKey={["products", "all"]}
                    fetcher={() => productsApi.list({ page_size: 500 })}
                    getLabel={(p) => `${p.name} · ${formatMoney(priceFor(p))}`}
                    placeholder="Select medicine or supply"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Qty:</span>
                  <Input
                    type="number"
                    min={1}
                    className="w-18 h-9 text-center font-mono"
                    value={line.quantity}
                    onChange={(e) => setLine(line.key, { quantity: Math.max(1, Number(e.target.value)) })}
                  />
                </div>
                <span className="w-24 text-right text-sm font-mono font-semibold tabular-nums text-foreground">
                  {formatMoney((line.unitPrice ?? 0) * line.quantity)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeLine(line.key)}
                  disabled={lines.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Calculation footer */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <Field label="Discount" htmlFor="discount">
            <Input
              id="discount"
              type="number"
              min={0}
              step="0.01"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
              placeholder="0.00"
              className="font-mono"
            />
          </Field>
          <div className="flex flex-col justify-center items-end bg-card p-3 rounded-lg border border-border/80">
            <p className="text-xs text-muted-foreground font-mono">Gross Subtotal: {formatMoney(subtotal)}</p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Total Due:</span>
              <span className="text-2xl font-bold font-mono tracking-tight text-primary">
                {formatMoney(total)}
              </span>
            </div>
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={!!toVoid}
        onOpenChange={(v) => !v && setToVoid(null)}
        title={`Void transaction #${toVoid?.id}?`}
        description="The sale will be marked as void and stock quantities will be restored back to their originating FEFO batches."
        confirmLabel="Confirm Void"
        destructive
        onConfirm={() => toVoid && voidMutation.mutate(toVoid.id)}
      />
    </div>
  );
}

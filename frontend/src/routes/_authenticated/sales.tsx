import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ShoppingCart, Ban, Receipt, Barcode } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/PageHeader";
import { usePermissions, useRole } from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  const priceFor = (p: Product) => Number(tenantType === "wholesale" ? p.wholesale_price : p.retail_price);

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
      toast.success("Sale completed");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sale failed — check stock availability"),
  });

  const voidMutation = useMutation({
    mutationFn: (id: ID) => salesApi.void(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Sale voided — stock restored");
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
      toast.success(`Added ${product.name}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        toast.error(`No product found for "${code}"`);
      } else {
        toast.error(err instanceof Error ? err.message : "Scan lookup failed");
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
      toast.error("Add at least one product");
      return;
    }
    save.mutate();
  };

  return (
    <>
      <PageHeader
        title="Point of sale"
        description={`Ring up a sale at ${tenantType === "wholesale" ? "wholesale" : "retail"} pricing. Stock is drawn from the earliest-expiring batch automatically.`}
        actions={canCreate ? <Button onClick={openCreate}><ShoppingCart className="h-4 w-4 mr-1" /> New Sale</Button> : undefined}
      />

      <DataTable<Sale>
        rows={data}
        isLoading={isLoading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search sales…"
        columns={[
          { key: "id", header: "Sale #", render: (s) => (
              <Link to="/sales/$saleId" params={{ saleId: String(s.id) }} className="text-primary hover:underline font-medium">
                #{s.id}
              </Link>
          ) },
          { key: "created_at", header: "Date", accessor: (s) => formatDate(s.created_at) },
          { key: "customer", header: "Customer", accessor: (s) => s.customer_name ?? "Walk-in" },
          { key: "sold_by", header: "Cashier", accessor: (s) => s.sold_by_name ?? "—" },
          { key: "payment_method", header: "Payment", render: (s) => <span className="capitalize">{s.payment_method}</span> },
          { key: "status", header: "Status", render: (s) => <StatusBadge status={s.status} /> },
          { key: "total", header: "Total", className: "text-right", render: (s) => <MoneyCell value={s.total} /> },
        ]}
        actions={[
          {
            label: "View receipt",
            icon: <Receipt className="h-4 w-4" />,
            onSelect: (s) => navigate({ to: "/sales/$saleId", params: { saleId: String(s.id) } }),
          },
          ...(canVoid
            ? [
                {
                  label: "Void sale",
                  icon: <Ban className="h-4 w-4" />,
                  destructive: true,
                  onSelect: (s: Sale) => s.status !== "void" && setToVoid(s),
                },
              ]
            : []),
        ]}
        emptyTitle="No sales yet"
      />

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="New sale"
        onSubmit={onSubmit}
        isPending={save.isPending}
        submitLabel="Complete sale"
        size="lg"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Customer (optional)">
            <EntitySelect
              value={customer}
              onChange={(id) => setCustomer(id)}
              queryKey={["customers", "all"]}
              fetcher={() => customersApi.list({ page_size: 500 })}
              getLabel={(c) => c.name}
              placeholder="Walk-in"
            />
          </Field>
          <Field label="Payment method">
            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="mpesa">M-Pesa</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="credit">Credit</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="Scan barcode" hint="Works with a USB/Bluetooth scanner (types + Enter) or type an SKU and press Enter.">
          <div className="relative">
            <Barcode className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={handleBarcodeScan}
              placeholder="Scan or type a barcode / SKU…"
              className="pl-8"
              disabled={scanning}
              autoFocus
            />
          </div>
        </Field>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Items</label>
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((p) => [...p, newLine()])}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add item
            </Button>
          </div>
          <div className="space-y-2">
            {lines.map((line) => (
              <div key={line.key} className="flex items-center gap-2">
                <div className="flex-1">
                  <EntitySelect
                    value={line.product}
                    onChange={(id) => {
                      const p = products.find((pr) => String(pr.id) === String(id));
                      setLine(line.key, { product: id, unitPrice: p ? priceFor(p) : undefined, productName: p?.name });
                    }}
                    queryKey={["products", "all"]}
                    fetcher={() => productsApi.list({ page_size: 500 })}
                    getLabel={(p) => `${p.name} · ${formatMoney(priceFor(p))}`}
                    placeholder="Select product"
                  />
                </div>
                <Input
                  type="number"
                  min={1}
                  className="w-20"
                  value={line.quantity}
                  onChange={(e) => setLine(line.key, { quantity: Number(e.target.value) })}
                />
                <span className="w-24 text-right text-sm font-mono tabular-nums text-muted-foreground">
                  {formatMoney((line.unitPrice ?? 0) * line.quantity)}
                </span>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(line.key)} disabled={lines.length === 1}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Discount" htmlFor="discount">
            <Input id="discount" type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
          </Field>
          <div className="flex flex-col justify-end text-right">
            <p className="text-xs text-muted-foreground">Subtotal: {formatMoney(subtotal)}</p>
            <p className="text-lg font-semibold">{formatMoney(total)}</p>
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={!!toVoid}
        onOpenChange={(v) => !v && setToVoid(null)}
        title={`Void sale #${toVoid?.id}?`}
        description="Stock will be restored to the batches it was drawn from."
        confirmLabel="Void sale"
        destructive
        onConfirm={() => toVoid && voidMutation.mutate(toVoid.id)}
      />
    </>
  );
}

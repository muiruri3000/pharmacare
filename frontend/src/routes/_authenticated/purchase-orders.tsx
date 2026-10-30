import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, PackageCheck } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/PageHeader";
import { usePermissions } from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/data-table/DataTable";
import { FormDialog, Field } from "@/components/forms/FormDialog";
import { EntitySelect } from "@/components/forms/EntitySelect";
import { StatusBadge } from "@/components/common/StatusBadge";
import { MoneyCell, formatMoney } from "@/components/common/MoneyCell";
import { formatDate } from "@/lib/format";
import { purchaseOrdersApi, suppliersApi, productsApi } from "@/lib/api/resources";
import type { PurchaseOrder, ID } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/purchase-orders")({
  component: PurchaseOrdersPage,
});

interface LineItem {
  key: string;
  product: ID | "";
  quantity: number;
  unit_cost: number;
}
function newLine(): LineItem {
  return { key: Math.random().toString(36).slice(2), product: "", quantity: 1, unit_cost: 0 };
}

function PurchaseOrdersPage() {
  const perms = usePermissions();
  const canCreate = perms.can("create", "purchase-orders");
  const canReceive = perms.can("edit", "purchase-orders");
  const qc = useQueryClient();

  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [receiveTarget, setReceiveTarget] = React.useState<PurchaseOrder | null>(null);
  const [receiveDates, setReceiveDates] = React.useState<Record<string, { batch_number: string; expiry_date: string }>>({});
  const [supplier, setSupplier] = React.useState<ID | "">("");
  const [expectedDate, setExpectedDate] = React.useState("");
  const [lines, setLines] = React.useState<LineItem[]>([newLine()]);

  const { data = [], isLoading } = useQuery({
    queryKey: ["purchase-orders", { search }],
    queryFn: () => purchaseOrdersApi.list({ search: search || undefined, ordering: "-created_at", page_size: 200 }),
  });

  const save = useMutation({
    mutationFn: () =>
      purchaseOrdersApi.create({
        supplier: supplier as ID,
        expected_date: expectedDate || null,
        items: lines.filter((l) => l.product).map((l) => ({ product: l.product as ID, quantity: l.quantity, unit_cost: l.unit_cost })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Purchase order created");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const receive = useMutation({
    mutationFn: (po: PurchaseOrder) =>
      purchaseOrdersApi.receive(
        po.id,
        po.items.map((item) => ({
          item_id: item.id as ID,
          batch_number: receiveDates[String(item.id)]?.batch_number || `PO${po.id}-${item.id}`,
          expiry_date: receiveDates[String(item.id)]?.expiry_date,
        })),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["batches"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Order received — batches created");
      setReceiveTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Receive failed"),
  });

  const openCreate = () => { setSupplier(""); setExpectedDate(""); setLines([newLine()]); setDialogOpen(true); };
  const setLine = (key: string, patch: Partial<LineItem>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const total = lines.reduce((sum, l) => sum + l.quantity * l.unit_cost, 0);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplier) { toast.error("Select a supplier"); return; }
    if (!lines.some((l) => l.product)) { toast.error("Add at least one item"); return; }
    save.mutate();
  };

  const openReceive = (po: PurchaseOrder) => {
    const defaults: typeof receiveDates = {};
    for (const item of po.items) {
      defaults[String(item.id)] = { batch_number: `PO${po.id}-${item.id}`, expiry_date: "" };
    }
    setReceiveDates(defaults);
    setReceiveTarget(po);
  };

  return (
    <>
      <PageHeader
        title="Purchase orders"
        description="Order stock from suppliers. Receiving an order creates a batch per line item."
        actions={canCreate ? <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> New Order</Button> : undefined}
      />

      <DataTable<PurchaseOrder>
        rows={data}
        isLoading={isLoading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search orders…"
        columns={[
          { key: "id", header: "PO #", accessor: (p) => `#${p.id}` },
          { key: "supplier", header: "Supplier", accessor: (p) => p.supplier_name },
          { key: "created_at", header: "Created", accessor: (p) => formatDate(p.created_at) },
          { key: "expected_date", header: "Expected", accessor: (p) => formatDate(p.expected_date) },
          { key: "status", header: "Status", render: (p) => <StatusBadge status={p.status} /> },
          { key: "total", header: "Total", className: "text-right", render: (p) => <MoneyCell value={p.total} /> },
        ]}
        actions={
          canReceive
            ? [{ label: "Receive", icon: <PackageCheck className="h-4 w-4" />, onSelect: (p) => p.status !== "received" && openReceive(p) }]
            : undefined
        }
        emptyTitle="No purchase orders yet"
      />

      <FormDialog open={dialogOpen} onOpenChange={setDialogOpen} title="New purchase order" onSubmit={onSubmit} isPending={save.isPending} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Supplier">
            <EntitySelect
              value={supplier}
              onChange={setSupplier}
              queryKey={["suppliers", "all"]}
              fetcher={() => suppliersApi.list({ page_size: 500 })}
              getLabel={(s) => s.name}
              placeholder="Select supplier"
            />
          </Field>
          <Field label="Expected date (optional)" htmlFor="expected_date">
            <Input id="expected_date" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </Field>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Items</label>
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((p) => [...p, newLine()])}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add item
            </Button>
          </div>
          {lines.map((line) => (
            <div key={line.key} className="grid grid-cols-[1fr_70px_100px_auto] gap-2 items-center">
              <EntitySelect
                value={line.product}
                onChange={(id) => setLine(line.key, { product: id })}
                queryKey={["products", "all"]}
                fetcher={() => productsApi.list({ page_size: 500 })}
                getLabel={(p) => p.name}
                placeholder="Select product"
              />
              <Input type="number" min={1} value={line.quantity} onChange={(e) => setLine(line.key, { quantity: Number(e.target.value) })} />
              <Input type="number" min={0} step="0.01" placeholder="Unit cost" value={line.unit_cost} onChange={(e) => setLine(line.key, { unit_cost: Number(e.target.value) })} />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(line.key)} disabled={lines.length === 1}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <p className="text-right text-sm text-muted-foreground">Order total: <span className="font-medium text-foreground">{formatMoney(total)}</span></p>
        </div>
      </FormDialog>

      <FormDialog
        open={!!receiveTarget}
        onOpenChange={(v) => !v && setReceiveTarget(null)}
        title={`Receive PO #${receiveTarget?.id}`}
        description="Give each line item a batch number and expiry date."
        onSubmit={(e) => { e.preventDefault(); receiveTarget && receive.mutate(receiveTarget); }}
        isPending={receive.isPending}
        submitLabel="Receive order"
      >
        {receiveTarget?.items.map((item) => (
          <div key={item.id} className="grid grid-cols-[1fr_1fr_1fr] gap-2 items-end border-b border-border pb-2">
            <div className="text-sm">{item.product_name}<span className="block text-xs text-muted-foreground">Qty {item.quantity}</span></div>
            <Field label="Batch #">
              <Input
                value={receiveDates[String(item.id)]?.batch_number ?? ""}
                onChange={(e) => setReceiveDates((p) => ({ ...p, [String(item.id)]: { ...p[String(item.id)], batch_number: e.target.value } }))}
              />
            </Field>
            <Field label="Expiry date">
              <Input
                type="date"
                value={receiveDates[String(item.id)]?.expiry_date ?? ""}
                onChange={(e) => setReceiveDates((p) => ({ ...p, [String(item.id)]: { ...p[String(item.id)], expiry_date: e.target.value } }))}
              />
            </Field>
          </div>
        ))}
      </FormDialog>
    </>
  );
}

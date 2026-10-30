import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/PageHeader";
import { usePermissions } from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/data-table/DataTable";
import { FormDialog, Field } from "@/components/forms/FormDialog";
import { MoneyCell } from "@/components/common/MoneyCell";
import { EntitySelect } from "@/components/forms/EntitySelect";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatDate } from "@/lib/format";
import { batchesApi, productsApi, suppliersApi } from "@/lib/api/resources";
import type { Batch } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/batches")({
  component: BatchesPage,
});

const schema = z.object({
  product: z.union([z.string(), z.number()]).refine((v) => !!v, "Required"),
  batch_number: z.string().trim().min(1, "Required"),
  expiry_date: z.string().min(1, "Required"),
  quantity: z.coerce.number().int().min(1, "Must be at least 1"),
  cost_price: z.coerce.number().min(0),
  supplier: z.union([z.string(), z.number()]).optional().nullable(),
});
type FormValues = z.infer<typeof schema>;

function daysUntil(dateStr: string) {
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function BatchesPage() {
  const perms = usePermissions();
  const canCreate = perms.can("create", "batches");
  const qc = useQueryClient();

  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [values, setValues] = React.useState<Partial<FormValues>>({ quantity: 1, cost_price: 0 });
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormValues, string>>>({});

  const { data = [], isLoading } = useQuery({
    queryKey: ["batches", { search }],
    queryFn: () => batchesApi.list({ search: search || undefined, ordering: "expiry_date", page_size: 500 }),
  });

  const save = useMutation({
    mutationFn: (v: FormValues) => batchesApi.create({ ...v, supplier: v.supplier || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["batches"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Batch received — stock updated");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const openCreate = () => {
    setValues({ quantity: 1, cost_price: 0 });
    setErrors({});
    setDialogOpen(true);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const ferr: typeof errors = {};
      for (const i of parsed.error.issues) ferr[i.path[0] as keyof FormValues] = i.message;
      setErrors(ferr);
      return;
    }
    save.mutate(parsed.data);
  };

  return (
    <>
      <PageHeader
        title="Batches & expiry"
        description="Every received lot, with its expiry date. Sales and dispensing draw the earliest-expiring batch first (FEFO)."
        actions={
          canCreate ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Receive Batch
            </Button>
          ) : undefined
        }
      />

      <DataTable<Batch>
        rows={data}
        isLoading={isLoading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search batches…"
        columns={[
          { key: "product", header: "Product", accessor: (b) => b.product_name },
          { key: "batch_number", header: "Batch #", accessor: (b) => b.batch_number },
          { key: "expiry_date", header: "Expiry", render: (b) => {
              const d = daysUntil(b.expiry_date);
              return (
                <div className="flex items-center gap-2">
                  <span>{formatDate(b.expiry_date)}</span>
                  {d < 0 ? <StatusBadge status="expired" /> : d <= 30 ? <StatusBadge status="pending" /> : null}
                </div>
              );
            } },
          { key: "quantity", header: "Qty remaining", className: "text-right", accessor: (b) => b.quantity },
          { key: "cost_price", header: "Cost/unit", className: "text-right", render: (b) => <MoneyCell value={b.cost_price} /> },
          { key: "supplier", header: "Supplier", accessor: (b) => b.supplier_name ?? "—" },
          { key: "received_date", header: "Received", accessor: (b) => formatDate(b.received_date) },
        ]}
        emptyTitle="No batches yet"
        emptyDescription="Receive a batch to add stock for a product."
      />

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Receive batch"
        description="Creates a stock-in movement automatically."
        onSubmit={onSubmit}
        isPending={save.isPending}
        submitLabel="Receive"
      >
        <Field label="Product" error={errors.product as string | undefined}>
          <EntitySelect
            value={values.product ?? undefined}
            onChange={(id) => setValues({ ...values, product: id })}
            queryKey={["products", "all"]}
            fetcher={() => productsApi.list({ page_size: 500 })}
            getLabel={(p) => `${p.name} (${p.sku})`}
            placeholder="Select product"
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Batch number" htmlFor="batch_number" error={errors.batch_number}>
            <Input id="batch_number" value={values.batch_number ?? ""} onChange={(e) => setValues({ ...values, batch_number: e.target.value })} />
          </Field>
          <Field label="Expiry date" htmlFor="expiry_date" error={errors.expiry_date}>
            <Input id="expiry_date" type="date" value={values.expiry_date ?? ""} onChange={(e) => setValues({ ...values, expiry_date: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Quantity received" htmlFor="quantity" error={errors.quantity}>
            <Input id="quantity" type="number" min={1} value={values.quantity ?? 1} onChange={(e) => setValues({ ...values, quantity: Number(e.target.value) })} />
          </Field>
          <Field label="Cost price / unit" htmlFor="cost_price" error={errors.cost_price}>
            <Input id="cost_price" type="number" min={0} step="0.01" value={values.cost_price ?? 0} onChange={(e) => setValues({ ...values, cost_price: Number(e.target.value) })} />
          </Field>
        </div>
        <Field label="Supplier (optional)" error={errors.supplier as string | undefined}>
          <EntitySelect
            value={values.supplier ?? undefined}
            onChange={(id) => setValues({ ...values, supplier: id })}
            queryKey={["suppliers", "all"]}
            fetcher={() => suppliersApi.list({ page_size: 500 })}
            getLabel={(s) => s.name}
            placeholder="No supplier"
          />
        </Field>
      </FormDialog>
    </>
  );
}

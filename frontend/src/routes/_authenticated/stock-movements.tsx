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
import { Textarea } from "@/components/ui/textarea";
import { DataTable } from "@/components/data-table/DataTable";
import { FormDialog, Field } from "@/components/forms/FormDialog";
import { EntitySelect } from "@/components/forms/EntitySelect";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatDate } from "@/lib/format";
import { stockMovementsApi, productsApi, batchesApi } from "@/lib/api/resources";
import type { StockMovement, ID } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/stock-movements")({
  component: StockMovementsPage,
});

const schema = z.object({
  product: z.union([z.string(), z.number()]).refine((v) => !!v, "Required"),
  batch: z.union([z.string(), z.number()]).optional().nullable(),
  quantity: z.coerce.number().int().refine((v) => v !== 0, "Cannot be zero"),
  reason: z.string().trim().min(1, "Required"),
});
type FormValues = z.infer<typeof schema>;

function StockMovementsPage() {
  const perms = usePermissions();
  const canCreate = perms.can("create", "stock-movements");
  const qc = useQueryClient();

  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [values, setValues] = React.useState<Partial<FormValues>>({});
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormValues, string>>>({});

  const { data = [], isLoading } = useQuery({
    queryKey: ["stock-movements", { search }],
    queryFn: () => stockMovementsApi.list({ search: search || undefined, ordering: "-created_at", page_size: 200 }),
  });

  const save = useMutation({
    mutationFn: (v: FormValues) => stockMovementsApi.create({ ...v, batch: v.batch || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["batches"] });
      toast.success("Adjustment recorded");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

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
        title="Stock movements"
        description="Audit trail of every quantity change — receiving, sales, dispensing, and manual adjustments."
        actions={
          canCreate ? (
            <Button onClick={() => { setValues({}); setErrors({}); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Manual Adjustment
            </Button>
          ) : undefined
        }
      />

      <DataTable<StockMovement>
        rows={data}
        isLoading={isLoading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search movements…"
        columns={[
          { key: "created_at", header: "Date", accessor: (m) => formatDate(m.created_at) },
          { key: "product", header: "Product", accessor: (m) => m.product_name },
          { key: "type", header: "Type", render: (m) => <StatusBadge status={m.movement_type} /> },
          { key: "quantity", header: "Qty", className: "text-right font-mono tabular-nums", render: (m) => (
              <span className={m.quantity < 0 ? "text-destructive" : "text-success"}>
                {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
              </span>
          ) },
          { key: "reason", header: "Reason", accessor: (m) => m.reason || "—" },
          { key: "reference", header: "Reference", accessor: (m) => m.reference || "—" },
          { key: "created_by_name", header: "By", accessor: (m) => m.created_by_name ?? "—" },
        ]}
        emptyTitle="No stock movements yet"
      />

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Manual stock adjustment"
        description="Positive quantity requires a specific batch. Negative quantity without a batch draws down the earliest-expiring batches automatically."
        onSubmit={onSubmit}
        isPending={save.isPending}
        submitLabel="Record"
      >
        <Field label="Product" error={errors.product as string | undefined}>
          <EntitySelect
            value={values.product ?? undefined}
            onChange={(id) => setValues({ ...values, product: id, batch: undefined })}
            queryKey={["products", "all"]}
            fetcher={() => productsApi.list({ page_size: 500 })}
            getLabel={(p) => `${p.name} (${p.sku})`}
            placeholder="Select product"
          />
        </Field>
        <Field
          label="Batch (optional)"
          error={errors.batch as string | undefined}
          hint="Required to add stock. Optional to remove stock — leave blank to draw FEFO across all batches."
        >
          <EntitySelect
            value={values.batch ?? undefined}
            onChange={(id: ID) => setValues({ ...values, batch: id })}
            queryKey={["batches", "for-product", values.product]}
            fetcher={() => (values.product ? batchesApi.list({ product: values.product, page_size: 500 }) : Promise.resolve([]))}
            getLabel={(b) => `${b.batch_number} · exp ${b.expiry_date} · qty ${b.quantity}`}
            placeholder={values.product ? "No specific batch" : "Select a product first"}
            disabled={!values.product}
          />
        </Field>
        <Field label="Quantity (+/-)" htmlFor="quantity" error={errors.quantity} hint="e.g. -5 for breakage, +10 for a stock count correction.">
          <Input id="quantity" type="number" value={values.quantity ?? ""} onChange={(e) => setValues({ ...values, quantity: Number(e.target.value) })} />
        </Field>
        <Field label="Reason" htmlFor="reason" error={errors.reason}>
          <Textarea id="reason" rows={2} value={values.reason ?? ""} onChange={(e) => setValues({ ...values, reason: e.target.value })} />
        </Field>
      </FormDialog>
    </>
  );
}

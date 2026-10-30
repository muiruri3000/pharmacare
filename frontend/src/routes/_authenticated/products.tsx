import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, AlertTriangle } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/PageHeader";
import { usePermissions } from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/data-table/DataTable";
import { FormDialog, Field } from "@/components/forms/FormDialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { MoneyCell } from "@/components/common/MoneyCell";
import { EntitySelect } from "@/components/forms/EntitySelect";
import { StatusBadge } from "@/components/common/StatusBadge";
import { productsApi, categoriesApi } from "@/lib/api/resources";
import type { Product, ProductUnit } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsPage,
});

const UNITS: ProductUnit[] = ["tablet", "capsule", "bottle", "vial", "tube", "box", "pack", "strip", "unit"];

const schema = z.object({
  name: z.string().trim().min(1, "Required"),
  sku: z.string().trim().min(1, "Required"),
  barcode: z.string().trim().optional().or(z.literal("")),
  category: z.union([z.string(), z.number()]).optional().nullable(),
  manufacturer: z.string().trim().optional().or(z.literal("")),
  unit: z.string().min(1),
  requires_prescription: z.boolean().default(false),
  cost_price: z.coerce.number().min(0),
  wholesale_price: z.coerce.number().min(0),
  retail_price: z.coerce.number().min(0),
  reorder_level: z.coerce.number().min(0),
});
type FormValues = z.infer<typeof schema>;

const DEFAULTS: Partial<FormValues> = {
  unit: "unit", requires_prescription: false, cost_price: 0, wholesale_price: 0, retail_price: 0, reorder_level: 10,
};

function ProductsPage() {
  const perms = usePermissions();
  const canCreate = perms.can("create", "products");
  const canEdit = perms.can("edit", "products");
  const canDelete = perms.can("delete", "products");
  const qc = useQueryClient();

  const [search, setSearch] = React.useState("");
  const [lowStockOnly, setLowStockOnly] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Product | null>(null);
  const [toDelete, setToDelete] = React.useState<Product | null>(null);
  const [values, setValues] = React.useState<Partial<FormValues>>(DEFAULTS);
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormValues, string>>>({});

  const { data = [], isLoading } = useQuery({
    queryKey: ["products", { search, lowStockOnly }],
    queryFn: () =>
      productsApi.list({
        search: search || undefined,
        low_stock: lowStockOnly ? "true" : undefined,
        page_size: 500,
      }),
  });

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const body = { ...v, category: v.category || null };
      return editing ? productsApi.update(editing.id, body) : productsApi.create(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(editing ? "Product updated" : "Product created");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const remove = useMutation({
    mutationFn: (id: Product["id"]) => productsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product deactivated");
      setToDelete(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const openCreate = () => {
    setEditing(null);
    setValues(DEFAULTS);
    setErrors({});
    setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setValues({
      name: p.name, sku: p.sku, barcode: p.barcode ?? "", category: p.category ?? undefined, manufacturer: p.manufacturer ?? "",
      unit: p.unit, requires_prescription: p.requires_prescription,
      cost_price: Number(p.cost_price), wholesale_price: Number(p.wholesale_price),
      retail_price: Number(p.retail_price), reorder_level: p.reorder_level,
    });
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
        title="Products"
        description="The drug/product catalogue. Stock quantities come from batches."
        actions={
          canCreate ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Add Product
            </Button>
          ) : undefined
        }
      />

      <div className="flex items-center gap-2 mb-3">
        <Button
          variant={lowStockOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setLowStockOnly((v) => !v)}
        >
          <AlertTriangle className="h-3.5 w-3.5 mr-1.5" /> Low stock only
        </Button>
      </div>

      <DataTable<Product>
        rows={data}
        isLoading={isLoading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search products…"
        columns={[
          { key: "name", header: "Product", render: (p) => (
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-muted-foreground">{p.sku} · {p.category_name ?? "Uncategorised"}</div>
            </div>
          ) },
          { key: "unit", header: "Unit", accessor: (p) => p.unit },
          { key: "stock", header: "On hand", render: (p) => (
            <div className="flex items-center gap-2">
              <span className="font-mono tabular-nums">{p.quantity_on_hand ?? 0}</span>
              {p.is_low_stock ? <StatusBadge status="low_stock" /> : null}
            </div>
          ) },
          { key: "retail_price", header: "Retail", className: "text-right", render: (p) => <MoneyCell value={p.retail_price} /> },
          { key: "wholesale_price", header: "Wholesale", className: "text-right", render: (p) => <MoneyCell value={p.wholesale_price} /> },
          { key: "rx", header: "Rx", render: (p) => (p.requires_prescription ? <StatusBadge status="pending" /> : "—") },
          { key: "status", header: "Status", render: (p) => <StatusBadge status={p.is_active ? "active" : "cancelled"} /> },
        ]}
        onEdit={canEdit ? openEdit : undefined}
        onDelete={canDelete ? setToDelete : undefined}
        emptyTitle="No products yet"
        emptyDescription="Add your first product to start receiving stock."
      />

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit product" : "New product"}
        onSubmit={onSubmit}
        isPending={save.isPending}
        size="lg"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name" htmlFor="name" error={errors.name}>
            <Input id="name" value={values.name ?? ""} onChange={(e) => setValues({ ...values, name: e.target.value })} />
          </Field>
          <Field label="SKU" htmlFor="sku" error={errors.sku}>
            <Input id="sku" value={values.sku ?? ""} onChange={(e) => setValues({ ...values, sku: e.target.value })} />
          </Field>
          <Field label="Barcode (optional)" htmlFor="barcode" error={errors.barcode} hint="For scanner lookup at checkout.">
            <Input id="barcode" value={values.barcode ?? ""} onChange={(e) => setValues({ ...values, barcode: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Category (optional)" error={errors.category as string | undefined}>
            <EntitySelect
              value={values.category ?? undefined}
              onChange={(id) => setValues({ ...values, category: id })}
              queryKey={["categories"]}
              fetcher={() => categoriesApi.list()}
              getLabel={(c) => c.name}
              placeholder="No category"
            />
          </Field>
          <Field label="Unit" error={errors.unit}>
            <Select value={values.unit ?? "unit"} onValueChange={(v) => setValues({ ...values, unit: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => <SelectItem key={u} value={u} className="capitalize">{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Manufacturer (optional)" htmlFor="manufacturer" error={errors.manufacturer}>
          <Input id="manufacturer" value={values.manufacturer ?? ""} onChange={(e) => setValues({ ...values, manufacturer: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Cost price" htmlFor="cost_price" error={errors.cost_price}>
            <Input id="cost_price" type="number" min={0} step="0.01" value={values.cost_price ?? 0} onChange={(e) => setValues({ ...values, cost_price: Number(e.target.value) })} />
          </Field>
          <Field label="Wholesale price" htmlFor="wholesale_price" error={errors.wholesale_price}>
            <Input id="wholesale_price" type="number" min={0} step="0.01" value={values.wholesale_price ?? 0} onChange={(e) => setValues({ ...values, wholesale_price: Number(e.target.value) })} />
          </Field>
          <Field label="Retail price" htmlFor="retail_price" error={errors.retail_price}>
            <Input id="retail_price" type="number" min={0} step="0.01" value={values.retail_price ?? 0} onChange={(e) => setValues({ ...values, retail_price: Number(e.target.value) })} />
          </Field>
        </div>
        <Field label="Reorder level" htmlFor="reorder_level" error={errors.reorder_level} hint="Flagged as low-stock at or below this quantity.">
          <Input id="reorder_level" type="number" min={0} value={values.reorder_level ?? 10} onChange={(e) => setValues({ ...values, reorder_level: Number(e.target.value) })} />
        </Field>
        <div className="flex items-center gap-2">
          <Checkbox
            id="requires_prescription"
            checked={!!values.requires_prescription}
            onCheckedChange={(v) => setValues({ ...values, requires_prescription: !!v })}
          />
          <label htmlFor="requires_prescription" className="text-sm">Requires a prescription to dispense</label>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="Deactivate product?"
        description="It will be hidden from sales/dispensing but its history is preserved."
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </>
  );
}

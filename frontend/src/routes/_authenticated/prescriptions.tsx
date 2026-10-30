import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pill } from "lucide-react";
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
import { prescriptionsApi, customersApi, productsApi } from "@/lib/api/resources";
import type { Prescription, ID } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/prescriptions")({
  component: PrescriptionsPage,
});

interface LineItem {
  key: string;
  product: ID | "";
  quantity: number;
  dosage_instructions: string;
}
function newLine(): LineItem {
  return { key: Math.random().toString(36).slice(2), product: "", quantity: 1, dosage_instructions: "" };
}

function PrescriptionsPage() {
  const perms = usePermissions();
  const canCreate = perms.can("create", "prescriptions");
  const canDispense = perms.can("edit", "prescriptions");
  const qc = useQueryClient();

  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [customer, setCustomer] = React.useState<ID | "">("");
  const [prescribedBy, setPrescribedBy] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<LineItem[]>([newLine()]);

  const { data = [], isLoading } = useQuery({
    queryKey: ["prescriptions", { search }],
    queryFn: () => prescriptionsApi.list({ search: search || undefined, ordering: "-created_at", page_size: 200 }),
  });

  const save = useMutation({
    mutationFn: () =>
      prescriptionsApi.create({
        customer: customer || null,
        prescribed_by: prescribedBy,
        notes,
        items: lines
          .filter((l) => l.product)
          .map((l) => ({ product: l.product as ID, quantity: l.quantity, dosage_instructions: l.dosage_instructions })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prescriptions"] });
      toast.success("Prescription logged");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const dispense = useMutation({
    mutationFn: (id: ID) => prescriptionsApi.dispense(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prescriptions"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Prescription dispensed — stock updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Dispense failed — check stock availability"),
  });

  const openCreate = () => {
    setCustomer(""); setPrescribedBy(""); setNotes(""); setLines([newLine()]);
    setDialogOpen(true);
  };

  const setLine = (key: string, patch: Partial<LineItem>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prescribedBy.trim()) { toast.error("Prescribing doctor is required"); return; }
    if (!lines.some((l) => l.product)) { toast.error("Add at least one item"); return; }
    save.mutate();
  };

  return (
    <>
      <PageHeader
        title="Prescriptions"
        description="Log prescriptions at checkout; a technician dispenses them, which deducts stock (FEFO)."
        actions={canCreate ? <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Log Prescription</Button> : undefined}
      />

      <DataTable<Prescription>
        rows={data}
        isLoading={isLoading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search prescriptions…"
        columns={[
          { key: "id", header: "Rx #", accessor: (r) => `#${r.id}` },
          { key: "created_at", header: "Date", accessor: (r) => formatDate(r.created_at) },
          { key: "customer", header: "Customer", accessor: (r) => r.customer_name ?? "—" },
          { key: "prescribed_by", header: "Prescribed by", accessor: (r) => r.prescribed_by },
          { key: "items", header: "Items", accessor: (r) => r.items?.length ?? 0 },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
        ]}
        actions={
          canDispense
            ? [
                {
                  label: "Dispense",
                  icon: <Pill className="h-4 w-4" />,
                  onSelect: (r) => r.status === "pending" && dispense.mutate(r.id),
                },
              ]
            : undefined
        }
        emptyTitle="No prescriptions logged"
      />

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Log prescription"
        onSubmit={onSubmit}
        isPending={save.isPending}
        submitLabel="Log prescription"
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
          <Field label="Prescribed by (doctor/clinic)" htmlFor="prescribed_by">
            <Input id="prescribed_by" value={prescribedBy} onChange={(e) => setPrescribedBy(e.target.value)} />
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
            <div key={line.key} className="grid grid-cols-[1fr_70px_1fr_auto] gap-2 items-center">
              <EntitySelect
                value={line.product}
                onChange={(id) => setLine(line.key, { product: id })}
                queryKey={["products", "all"]}
                fetcher={() => productsApi.list({ page_size: 500 })}
                getLabel={(p) => p.name}
                placeholder="Select product"
              />
              <Input type="number" min={1} value={line.quantity} onChange={(e) => setLine(line.key, { quantity: Number(e.target.value) })} />
              <Input placeholder="Dosage instructions" value={line.dosage_instructions} onChange={(e) => setLine(line.key, { dosage_instructions: e.target.value })} />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(line.key)} disabled={lines.length === 1}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <Field label="Notes (optional)" htmlFor="notes">
          <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </FormDialog>
    </>
  );
}

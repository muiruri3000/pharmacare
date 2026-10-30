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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/data-table/DataTable";
import { FormDialog, Field } from "@/components/forms/FormDialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { MoneyCell } from "@/components/common/MoneyCell";
import { customersApi } from "@/lib/api/resources";
import type { Customer, CustomerType } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/customers")({
  component: CustomersPage,
});

const schema = z.object({
  name: z.string().trim().min(1, "Required"),
  phone: z.string().trim().optional().or(z.literal("")),
  email: z.string().trim().email("Invalid email").optional().or(z.literal("")),
  customer_type: z.enum(["walk_in", "wholesale_client"]),
  credit_limit: z.coerce.number().min(0).optional(),
});
type FormValues = z.infer<typeof schema>;

function CustomersPage() {
  const perms = usePermissions();
  const canCreate = perms.can("create", "customers");
  const canEdit = perms.can("edit", "customers");
  const canDelete = perms.can("delete", "customers");
  const qc = useQueryClient();

  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Customer | null>(null);
  const [toDelete, setToDelete] = React.useState<Customer | null>(null);
  const [values, setValues] = React.useState<Partial<FormValues>>({ customer_type: "walk_in", credit_limit: 0 });
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormValues, string>>>({});

  const { data = [], isLoading } = useQuery({
    queryKey: ["customers", { search }],
    queryFn: () => customersApi.list({ search: search || undefined, page_size: 500 }),
  });

  const save = useMutation({
    mutationFn: (v: FormValues) => (editing ? customersApi.update(editing.id, v) : customersApi.create(v)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success(editing ? "Customer updated" : "Customer added");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const remove = useMutation({
    mutationFn: (id: Customer["id"]) => customersApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer removed");
      setToDelete(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const openCreate = () => { setEditing(null); setValues({ customer_type: "walk_in", credit_limit: 0 }); setErrors({}); setDialogOpen(true); };
  const openEdit = (c: Customer) => {
    setEditing(c);
    setValues({ name: c.name, phone: c.phone ?? "", email: c.email ?? "", customer_type: c.customer_type, credit_limit: Number(c.credit_limit ?? 0) });
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
        title="Customers"
        description="Walk-in customers and wholesale accounts."
        actions={canCreate ? <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Add Customer</Button> : undefined}
      />
      <DataTable<Customer>
        rows={data}
        isLoading={isLoading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search customers…"
        columns={[
          { key: "name", header: "Name", accessor: (c) => c.name },
          { key: "customer_type", header: "Type", accessor: (c) => (c.customer_type === "wholesale_client" ? "Wholesale client" : "Walk-in") },
          { key: "phone", header: "Phone", accessor: (c) => c.phone || "—" },
          { key: "credit_limit", header: "Credit limit", className: "text-right", render: (c) => <MoneyCell value={c.credit_limit} /> },
        ]}
        onEdit={canEdit ? openEdit : undefined}
        onDelete={canDelete ? setToDelete : undefined}
        emptyTitle="No customers yet"
      />
      <FormDialog open={dialogOpen} onOpenChange={setDialogOpen} title={editing ? "Edit customer" : "New customer"} onSubmit={onSubmit} isPending={save.isPending}>
        <Field label="Name" htmlFor="name" error={errors.name}>
          <Input id="name" value={values.name ?? ""} onChange={(e) => setValues({ ...values, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Phone" htmlFor="phone" error={errors.phone}>
            <Input id="phone" value={values.phone ?? ""} onChange={(e) => setValues({ ...values, phone: e.target.value })} />
          </Field>
          <Field label="Type" error={errors.customer_type}>
            <Select value={values.customer_type ?? "walk_in"} onValueChange={(v) => setValues({ ...values, customer_type: v as CustomerType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="walk_in">Walk-in</SelectItem>
                <SelectItem value="wholesale_client">Wholesale client</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input id="email" type="email" value={values.email ?? ""} onChange={(e) => setValues({ ...values, email: e.target.value })} />
        </Field>
        <Field label="Credit limit" htmlFor="credit_limit" error={errors.credit_limit}>
          <Input id="credit_limit" type="number" min={0} step="0.01" value={values.credit_limit ?? 0} onChange={(e) => setValues({ ...values, credit_limit: Number(e.target.value) })} />
        </Field>
      </FormDialog>
      <ConfirmDialog
        open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}
        title="Remove customer?" confirmLabel="Remove" destructive
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </>
  );
}

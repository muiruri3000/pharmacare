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
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { suppliersApi } from "@/lib/api/resources";
import type { Supplier } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/suppliers")({
  component: SuppliersPage,
});

const schema = z.object({
  name: z.string().trim().min(1, "Required"),
  contact_person: z.string().trim().optional().or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
  email: z.string().trim().email("Invalid email").optional().or(z.literal("")),
  address: z.string().trim().optional().or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

function SuppliersPage() {
  const perms = usePermissions();
  const canCreate = perms.can("create", "suppliers");
  const canEdit = perms.can("edit", "suppliers");
  const canDelete = perms.can("delete", "suppliers");
  const qc = useQueryClient();

  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Supplier | null>(null);
  const [toDelete, setToDelete] = React.useState<Supplier | null>(null);
  const [values, setValues] = React.useState<Partial<FormValues>>({});
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormValues, string>>>({});

  const { data = [], isLoading } = useQuery({
    queryKey: ["suppliers", { search }],
    queryFn: () => suppliersApi.list({ search: search || undefined, page_size: 500 }),
  });

  const save = useMutation({
    mutationFn: (v: FormValues) => (editing ? suppliersApi.update(editing.id, v) : suppliersApi.create(v)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success(editing ? "Supplier updated" : "Supplier added");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const remove = useMutation({
    mutationFn: (id: Supplier["id"]) => suppliersApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Supplier deleted");
      setToDelete(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const openCreate = () => { setEditing(null); setValues({}); setErrors({}); setDialogOpen(true); };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setValues({ name: s.name, contact_person: s.contact_person ?? "", phone: s.phone ?? "", email: s.email ?? "", address: s.address ?? "" });
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
        title="Suppliers"
        description="Vendors you buy stock from."
        actions={canCreate ? <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Add Supplier</Button> : undefined}
      />
      <DataTable<Supplier>
        rows={data}
        isLoading={isLoading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search suppliers…"
        columns={[
          { key: "name", header: "Name", accessor: (s) => s.name },
          { key: "contact_person", header: "Contact", accessor: (s) => s.contact_person || "—" },
          { key: "phone", header: "Phone", accessor: (s) => s.phone || "—" },
          { key: "email", header: "Email", accessor: (s) => s.email || "—" },
        ]}
        onEdit={canEdit ? openEdit : undefined}
        onDelete={canDelete ? setToDelete : undefined}
        emptyTitle="No suppliers yet"
      />
      <FormDialog open={dialogOpen} onOpenChange={setDialogOpen} title={editing ? "Edit supplier" : "New supplier"} onSubmit={onSubmit} isPending={save.isPending}>
        <Field label="Name" htmlFor="name" error={errors.name}>
          <Input id="name" value={values.name ?? ""} onChange={(e) => setValues({ ...values, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Contact person" htmlFor="contact_person" error={errors.contact_person}>
            <Input id="contact_person" value={values.contact_person ?? ""} onChange={(e) => setValues({ ...values, contact_person: e.target.value })} />
          </Field>
          <Field label="Phone" htmlFor="phone" error={errors.phone}>
            <Input id="phone" value={values.phone ?? ""} onChange={(e) => setValues({ ...values, phone: e.target.value })} />
          </Field>
        </div>
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input id="email" type="email" value={values.email ?? ""} onChange={(e) => setValues({ ...values, email: e.target.value })} />
        </Field>
        <Field label="Address" htmlFor="address" error={errors.address}>
          <Input id="address" value={values.address ?? ""} onChange={(e) => setValues({ ...values, address: e.target.value })} />
        </Field>
      </FormDialog>
      <ConfirmDialog
        open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}
        title="Delete supplier?" confirmLabel="Delete" destructive
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </>
  );
}

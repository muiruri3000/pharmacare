import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/data-table/DataTable";
import { FormDialog, Field } from "@/components/forms/FormDialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { StatusBadge } from "@/components/common/StatusBadge";
import { usersApi } from "@/lib/api/resources";
import type { AppUser, UserRole } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: UsersPage,
});

const ROLES: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "sales", label: "Sales" },
  { value: "technician", label: "Pharmacy Technician" },
];

const createSchema = z.object({
  username: z.string().trim().min(1, "Required"),
  email: z.string().trim().email("Invalid email").optional().or(z.literal("")),
  first_name: z.string().trim().optional().or(z.literal("")),
  last_name: z.string().trim().optional().or(z.literal("")),
  role: z.enum(["admin", "sales", "technician"]),
  phone: z.string().trim().optional().or(z.literal("")),
  password: z.string().min(8, "At least 8 characters"),
});
const editSchema = createSchema.omit({ password: true }).extend({ password: z.string().optional() });
type FormValues = z.infer<typeof createSchema>;

function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AppUser | null>(null);
  const [toDelete, setToDelete] = React.useState<AppUser | null>(null);
  const [values, setValues] = React.useState<Partial<FormValues>>({ role: "sales" });
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormValues, string>>>({});

  const { data = [], isLoading } = useQuery({
    queryKey: ["users", { search }],
    queryFn: () => usersApi.list({ search: search || undefined, page_size: 500 }),
  });

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const { password, ...rest } = v;
      return editing ? usersApi.update(editing.id, rest) : usersApi.create(v);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(editing ? "User updated" : "User created");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const remove = useMutation({
    mutationFn: (id: AppUser["id"]) => usersApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("User deactivated");
      setToDelete(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const openCreate = () => { setEditing(null); setValues({ role: "sales" }); setErrors({}); setDialogOpen(true); };
  const openEdit = (u: AppUser) => {
    setEditing(u);
    setValues({ username: u.username, email: u.email ?? "", first_name: u.first_name ?? "", last_name: u.last_name ?? "", role: u.role as UserRole, phone: u.phone ?? "" });
    setErrors({});
    setDialogOpen(true);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const schema = editing ? editSchema : createSchema;
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const ferr: typeof errors = {};
      for (const i of parsed.error.issues) ferr[i.path[0] as keyof FormValues] = i.message;
      setErrors(ferr);
      return;
    }
    save.mutate(parsed.data as FormValues);
  };

  return (
    <>
      <PageHeader
        title="Users"
        description="Employee accounts for your pharmacy — admin, sales, and technician roles."
        actions={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Add User</Button>}
      />
      <DataTable<AppUser>
        rows={data}
        isLoading={isLoading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search users…"
        columns={[
          { key: "username", header: "Username", accessor: (u) => u.username },
          { key: "name", header: "Name", accessor: (u) => [u.first_name, u.last_name].filter(Boolean).join(" ") || "—" },
          { key: "role", header: "Role", render: (u) => <span className="capitalize">{u.role}</span> },
          { key: "phone", header: "Phone", accessor: (u) => u.phone || "—" },
          { key: "status", header: "Status", render: (u) => <StatusBadge status={u.is_active_employee === false ? "cancelled" : "active"} /> },
        ]}
        onEdit={openEdit}
        onDelete={setToDelete}
        emptyTitle="No users yet"
      />
      <FormDialog open={dialogOpen} onOpenChange={setDialogOpen} title={editing ? "Edit user" : "New user"} onSubmit={onSubmit} isPending={save.isPending}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Username" htmlFor="username" error={errors.username}>
            <Input id="username" value={values.username ?? ""} onChange={(e) => setValues({ ...values, username: e.target.value })} disabled={!!editing} />
          </Field>
          <Field label="Role" error={errors.role}>
            <Select value={values.role ?? "sales"} onValueChange={(v) => setValues({ ...values, role: v as UserRole })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="First name" htmlFor="first_name" error={errors.first_name}>
            <Input id="first_name" value={values.first_name ?? ""} onChange={(e) => setValues({ ...values, first_name: e.target.value })} />
          </Field>
          <Field label="Last name" htmlFor="last_name" error={errors.last_name}>
            <Input id="last_name" value={values.last_name ?? ""} onChange={(e) => setValues({ ...values, last_name: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Email" htmlFor="email" error={errors.email}>
            <Input id="email" type="email" value={values.email ?? ""} onChange={(e) => setValues({ ...values, email: e.target.value })} />
          </Field>
          <Field label="Phone" htmlFor="phone" error={errors.phone}>
            <Input id="phone" value={values.phone ?? ""} onChange={(e) => setValues({ ...values, phone: e.target.value })} />
          </Field>
        </div>
        {!editing ? (
          <Field label="Temporary password" htmlFor="password" error={errors.password} hint="At least 8 characters — share it securely with the employee.">
            <PasswordInput id="password" value={values.password ?? ""} onChange={(e) => setValues({ ...values, password: e.target.value })} />
          </Field>
        ) : null}
      </FormDialog>
      <ConfirmDialog
        open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}
        title="Deactivate user?" description="They will no longer be able to sign in; their history is preserved."
        confirmLabel="Deactivate" destructive
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </>
  );
}

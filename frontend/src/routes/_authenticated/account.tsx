import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Field } from "@/components/forms/FormDialog";
import { useAuth } from "@/lib/auth/AuthProvider";
import { authApi } from "@/lib/api/auth";

export const Route = createFileRoute("/_authenticated/account")({
  component: AccountPage,
});

function AccountPage() {
  const { user } = useAuth();
  const [oldPassword, setOldPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");

  const changePw = useMutation({
    mutationFn: () => authApi.changePassword(oldPassword, newPassword),
    onSuccess: () => {
      toast.success("Password updated");
      setOldPassword("");
      setNewPassword("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update password"),
  });

  return (
    <>
      <PageHeader title="Account" description="Your profile and login." />
      <div className="grid gap-6 max-w-xl">
        <Card className="card-gradient border-border shadow-card">
          <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Username</span><span>{user?.username}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Role</span><span className="capitalize">{user?.role}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Pharmacy</span><span>{user?.tenant_name ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="capitalize">{user?.tenant_type ?? "—"}</span></div>
          </CardContent>
        </Card>

        <Card className="card-gradient border-border shadow-card">
          <CardHeader><CardTitle className="text-base">Change password</CardTitle></CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => { e.preventDefault(); changePw.mutate(); }}
            >
              <Field label="Current password" htmlFor="old_password">
                <PasswordInput id="old_password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
              </Field>
              <Field label="New password" htmlFor="new_password">
                <PasswordInput id="new_password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </Field>
              <Button type="submit" disabled={changePw.isPending}>Update password</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

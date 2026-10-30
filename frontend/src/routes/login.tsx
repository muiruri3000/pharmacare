import * as React from "react";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { Pill, Loader2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/forms/FormDialog";
import { useAuth } from "@/lib/auth/AuthProvider";

export const Route = createFileRoute("/login")({
  validateSearch: (s) => ({ redirect: typeof s.redirect === "string" ? s.redirect : "/" }),
  component: LoginPage,
});

const schema = z.object({
  username: z.string().min(1, "Required"),
  password: z.string().min(1, "Required"),
});

function LoginPage() {
  const { login, isAuthenticated, isHydrated } = useAuth();
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [errors, setErrors] = React.useState<{ username?: string; password?: string }>({});
  const [submitting, setSubmitting] = React.useState(false);

  if (isHydrated && isAuthenticated) {
    return <Navigate to={redirect && redirect !== "/" ? redirect : "/"} />;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ username, password });
    if (!parsed.success) {
      const fieldErrors: typeof errors = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path[0] as "username" | "password"] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await login(parsed.data.username, parsed.data.password);
      toast.success("Signed in");
      const target = redirect && redirect !== "/" ? redirect : "/";
      navigate({ to: target });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-6 justify-center">
          <div className="h-10 w-10 rounded-lg bg-primary/20 grid place-items-center glow">
            <Pill className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xl font-semibold">PharmaCare</p>
            <p className="text-xs text-muted-foreground">Pharmacy management console</p>
          </div>
        </div>
        <Card className="card-gradient border-border shadow-card">
          <CardContent className="p-6">
            <h1 className="text-lg font-semibold mb-1">Sign in</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Use the credentials issued by your pharmacy administrator.
            </p>
            <form onSubmit={onSubmit} className="space-y-4">
              <Field label="Username" htmlFor="username" error={errors.username}>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                />
              </Field>
              <Field label="Password" htmlFor="password" error={errors.password}>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </Field>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  accent?: boolean;
}) {
  return (
    <Card className={cn("card-gradient border-border shadow-card", accent && "glow")}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold mt-2 font-mono tabular-nums truncate">{value}</p>
            {hint ? <p className="text-xs text-muted-foreground mt-1">{hint}</p> : null}
          </div>
          {icon ? (
            <div className="h-9 w-9 rounded-md bg-primary/15 text-primary grid place-items-center shrink-0">
              {icon}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

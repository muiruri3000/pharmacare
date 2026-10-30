import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const SUCCESS = new Set(["paid", "completed", "received", "dispensed", "active"]);
const WARNING = new Set(["partial", "pending", "draft", "ordered", "low_stock"]);
const DESTRUCTIVE = new Set(["overdue", "void", "cancelled", "expired", "insufficient"]);

const STYLES = {
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  destructive: "bg-destructive/15 text-destructive border-destructive/30",
  neutral: "bg-muted text-muted-foreground border-border",
};

function styleFor(status: string) {
  const key = status.toLowerCase();
  if (SUCCESS.has(key)) return STYLES.success;
  if (WARNING.has(key)) return STYLES.warning;
  if (DESTRUCTIVE.has(key)) return STYLES.destructive;
  return STYLES.neutral;
}

export function StatusBadge({ status }: { status?: string | null }) {
  const key = status ?? "—";
  return (
    <Badge variant="outline" className={cn("capitalize font-medium", styleFor(key))}>
      {key.replace(/_/g, " ")}
    </Badge>
  );
}

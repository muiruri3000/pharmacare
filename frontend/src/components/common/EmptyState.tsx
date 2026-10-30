import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({
  title = "Nothing here yet",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="border border-dashed border-border rounded-lg p-10 text-center">
      <div className="mx-auto h-10 w-10 rounded-full bg-muted grid place-items-center mb-3">
        <Inbox className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="font-medium">{title}</p>
      {description ? <p className="text-sm text-muted-foreground mt-1">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

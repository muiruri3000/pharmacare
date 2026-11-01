import * as React from "react";
import { AlertTriangle, Ban, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ExpiryBadgeProps {
  date: string | Date;
  className?: string;
  showDays?: boolean;
}

export function daysUntil(dateInput: string | Date): number {
  const target = new Date(dateInput).getTime();
  const now = Date.now();
  const diffMs = target - now;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function ExpiryBadge({ date, className, showDays = true }: ExpiryBadgeProps) {
  const days = daysUntil(date);
  const formattedDate = formatDate(date);

  if (days < 0) {
    return (
      <Badge
        variant="destructive"
        className={cn("gap-1 font-mono text-[11px] uppercase tracking-wide", className)}
      >
        <Ban className="h-3 w-3" />
        <span>Expired {showDays ? `(${Math.abs(days)}d ago)` : ""}</span>
      </Badge>
    );
  }

  if (days <= 30) {
    return (
      <Badge
        className={cn(
          "gap-1 font-mono text-[11px] bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20",
          className
        )}
      >
        <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
        <span>FEFO Alert {showDays ? `(${days}d left)` : ""}</span>
      </Badge>
    );
  }

  if (days <= 90) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "gap-1 font-mono text-[11px] text-yellow-700 dark:text-yellow-300 border-yellow-500/30 bg-yellow-500/10",
          className
        )}
      >
        <Clock className="h-3 w-3 text-yellow-600 dark:text-yellow-400" />
        <span>{formattedDate} {showDays ? `(${days}d)` : ""}</span>
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-mono text-[11px] text-emerald-700 dark:text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
        className
      )}
    >
      <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
      <span>{formattedDate}</span>
    </Badge>
  );
}

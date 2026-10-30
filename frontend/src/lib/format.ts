// Shared display formatters.

export function formatBillingMonth(value?: string | null): string {
  if (!value) return "—";
  // Accepts "YYYY-MM" or "YYYY-MM-DD"
  const m = /^(\d{4})-(\d{2})/.exec(value);
  if (!m) return value;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const d = new Date(Date.UTC(year, month, 1));
  return d.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

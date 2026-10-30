export function formatMoney(value: number | string | null | undefined, currency = "KES") {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (Number.isNaN(n)) return "—";
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function MoneyCell({
  value,
  currency,
  muted,
}: {
  value: number | string | null | undefined;
  currency?: string;
  muted?: boolean;
}) {
  return (
    <span className={`font-mono tabular-nums ${muted ? "text-muted-foreground" : ""}`}>
      {formatMoney(value, currency)}
    </span>
  );
}

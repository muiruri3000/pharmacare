import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ID } from "@/lib/types";

export function EntitySelect<T extends { id: ID }>({
  value,
  onChange,
  queryKey,
  fetcher,
  getLabel,
  placeholder = "Select…",
  disabled,
}: {
  value?: ID | "";
  onChange: (id: ID) => void;
  queryKey: readonly unknown[];
  fetcher: () => Promise<T[]>;
  getLabel: (item: T) => string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const { data = [], isLoading } = useQuery({ queryKey, queryFn: fetcher });
  return (
    <Select
      value={value !== undefined && value !== "" ? String(value) : undefined}
      onValueChange={(v) => onChange(v)}
      disabled={disabled || isLoading}
    >
      <SelectTrigger>
        <SelectValue placeholder={isLoading ? "Loading…" : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {data.map((item) => (
          <SelectItem key={String(item.id)} value={String(item.id)}>
            {getLabel(item)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

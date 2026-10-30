import * as React from "react";
import { Search, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  render?: (row: T) => React.ReactNode;
  accessor?: (row: T) => React.ReactNode;
}

export interface RowAction<T> {
  label: string;
  icon?: React.ReactNode;
  onSelect: (row: T) => void;
  destructive?: boolean;
}

export function DataTable<T extends { id: string | number }>({
  rows,
  columns,
  isLoading,
  searchPlaceholder = "Search…",
  search,
  onSearchChange,
  onEdit,
  onDelete,
  actions,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  rows: T[];
  columns: Column<T>[];
  isLoading?: boolean;
  searchPlaceholder?: string;
  search?: string;
  onSearchChange?: (v: string) => void;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  actions?: RowAction<T>[];
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
}) {
  const hasActions = !!onEdit || !!onDelete || (actions && actions.length > 0);

  return (
    <div className="space-y-3">
      {onSearchChange ? (
        <div className="relative max-w-sm">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9"
          />
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              {columns.map((c) => (
                <TableHead key={c.key} className={c.className}>
                  {c.header}
                </TableHead>
              ))}
              {hasActions ? <TableHead className="w-[60px]" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((c) => (
                    <TableCell key={c.key}>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  ))}
                  {hasActions ? <TableCell /> : null}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + (hasActions ? 1 : 0)}>
                  <EmptyState
                    title={emptyTitle ?? "No records"}
                    description={emptyDescription}
                    action={emptyAction}
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={String(row.id)}>
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.className}>
                      {c.render
                        ? c.render(row)
                        : c.accessor
                          ? c.accessor(row)
                          : (row as Record<string, React.ReactNode>)[c.key]}
                    </TableCell>
                  ))}
                  {hasActions ? (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {onEdit ? (
                            <DropdownMenuItem onSelect={() => onEdit(row)}>
                              <Pencil className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                          ) : null}
                          {actions?.map((a) => (
                            <DropdownMenuItem
                              key={a.label}
                              onSelect={() => a.onSelect(row)}
                              className={a.destructive ? "text-destructive" : ""}
                            >
                              {a.icon ? <span className="mr-2">{a.icon}</span> : null}
                              {a.label}
                            </DropdownMenuItem>
                          ))}
                          {onDelete ? (
                            <DropdownMenuItem
                              onSelect={() => onDelete(row)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

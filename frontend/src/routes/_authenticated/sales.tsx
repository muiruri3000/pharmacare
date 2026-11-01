import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  ShoppingCart,
  Ban,
  Receipt,
  Barcode,
  CreditCard,
  Banknote,
  Smartphone,
  Wallet,
  Building2,
  Pill,
  Sparkles,
  PauseCircle,
  RotateCcw,
  FileText,
  DollarSign,
  Lock,
  Unlock,
  Bookmark,
  CheckCircle2,
  AlertCircle,
  X,
  Split,
  Coins,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/PageHeader";
import { usePermissions, useRole } from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/data-table/DataTable";
import { FormDialog, Field } from "@/components/forms/FormDialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { MoneyCell, formatMoney } from "@/components/common/MoneyCell";
import { EntitySelect } from "@/components/forms/EntitySelect";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatDate } from "@/lib/format";
import { salesApi, customersApi, productsApi, prescriptionsApi, shiftsApi } from "@/lib/api/resources";
import { ApiError } from "@/lib/api/client";
import type { Sale, PaymentMethod, ID, Product, Prescription, CashierShift } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/sales")({
  component: SalesPage,
});

interface LineItem {
  key: string;
  product: ID | "";
  productName?: string;
  unitPrice?: number;
  quantity: number;
}

interface SplitPaymentItem {
  payment_method: PaymentMethod;
  amount: number;
}

interface ParkedTicket {
  id: string;
  name: string;
  timestamp: string;
  customer: ID | "";
  customerName?: string;
  paymentMethod: PaymentMethod;
  isSplitPayment: boolean;
  splitPayments: SplitPaymentItem[];
  discount: number;
  lines: LineItem[];
  linkedRxId?: ID | null;
  linkedRxLabel?: string;
  subtotal: number;
  total: number;
}

const PARKED_STORAGE_KEY = "pharmacare_parked_tickets_v1";

function loadParkedTickets(): ParkedTicket[] {
  try {
    const raw = sessionStorage.getItem(PARKED_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistParkedTickets(tickets: ParkedTicket[]) {
  try {
    sessionStorage.setItem(PARKED_STORAGE_KEY, JSON.stringify(tickets));
  } catch (err) {
    console.error("Failed to persist parked tickets", err);
  }
}

function newLine(): LineItem {
  return { key: Math.random().toString(36).slice(2), product: "", quantity: 1 };
}

function SalesPage() {
  const perms = usePermissions();
  const { tenantType, isAdmin } = useRole();
  const isWholesale = tenantType === "wholesale";
  const canCreate = perms.can("create", "sales");
  const canVoid = isAdmin;
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [toVoid, setToVoid] = React.useState<Sale | null>(null);

  // Cart form state
  const [customer, setCustomer] = React.useState<ID | "">("");
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>("cash");
  const [isSplitPayment, setIsSplitPayment] = React.useState(false);
  const [splitPayments, setSplitPayments] = React.useState<SplitPaymentItem[]>([
    { payment_method: "cash", amount: 0 },
    { payment_method: "mpesa", amount: 0 },
  ]);
  const [cashTendered, setCashTendered] = React.useState<number>(0);
  const [discount, setDiscount] = React.useState(0);
  const [lines, setLines] = React.useState<LineItem[]>([newLine()]);
  const [barcodeInput, setBarcodeInput] = React.useState("");
  const [scanning, setScanning] = React.useState(false);

  // Prescription pull state
  const [rxDialogOpen, setRxDialogOpen] = React.useState(false);
  const [linkedRx, setLinkedRx] = React.useState<Prescription | null>(null);

  // Park & Recall Carts state
  const [parkedTickets, setParkedTickets] = React.useState<ParkedTicket[]>(loadParkedTickets);

  // Shift & Drawer Management state
  const [openShiftModal, setOpenShiftModal] = React.useState(false);
  const [closeShiftModal, setCloseShiftModal] = React.useState(false);
  const [openingFloat, setOpeningFloat] = React.useState<number>(1000);
  const [closingCashCount, setClosingCashCount] = React.useState<number>(0);
  const [shiftNotes, setShiftNotes] = React.useState("");

  // Queries
  const { data = [], isLoading } = useQuery({
    queryKey: ["sales", { search }],
    queryFn: () => salesApi.list({ search: search || undefined, ordering: "-created_at", page_size: 200 }),
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => productsApi.list({ page_size: 500 }),
  });

  const { data: currentShift, refetch: refetchShift } = useQuery({
    queryKey: ["shifts", "current"],
    queryFn: () => shiftsApi.current(),
  });

  const { data: pullableRx = [] } = useQuery({
    queryKey: ["prescriptions", "pullable"],
    queryFn: () => prescriptionsApi.list({ ordering: "-created_at", page_size: 40 }),
    enabled: rxDialogOpen,
  });

  const priceFor = (p: Product) => (isWholesale ? Number(p.wholesale_price) : Number(p.retail_price));

  const subtotal = lines.reduce((sum, l) => sum + (l.unitPrice ?? 0) * l.quantity, 0);
  const total = Math.max(0, subtotal - discount);

  // Split payment calculations
  const totalSplitAllocated = splitPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const splitBalanceRemaining = total - totalSplitAllocated;

  // Cash change calculation
  const cashPortionDue = isSplitPayment
    ? splitPayments.find((p) => p.payment_method === "cash")?.amount || 0
    : paymentMethod === "cash"
      ? total
      : 0;

  const changeDue = Math.max(0, cashTendered - cashPortionDue);

  // Mutations
  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, any> = {
        customer: customer || null,
        discount,
        tax: 0,
        prescription: linkedRx ? linkedRx.id : null,
        items: lines
          .filter((l) => l.product)
          .map((l) => ({ product: l.product as ID, quantity: l.quantity })),
      };

      if (isSplitPayment) {
        payload.payment_method = "split";
        payload.payments = splitPayments.filter((p) => p.amount > 0);
      } else {
        payload.payment_method = paymentMethod;
      }

      return salesApi.create(payload as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["prescriptions"] });
      qc.invalidateQueries({ queryKey: ["shifts"] });
      toast.success(isWholesale ? "Wholesale order generated" : "Dispensary sale completed");
      setDialogOpen(false);
      resetCart();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sale failed — check stock availability"),
  });

  const voidMutation = useMutation({
    mutationFn: (id: ID) => salesApi.void(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["shifts"] });
      toast.success("Sale voided — stock restored to batches");
      setToVoid(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Void failed"),
  });

  const openShiftMutation = useMutation({
    mutationFn: () => shiftsApi.openShift(openingFloat, shiftNotes),
    onSuccess: () => {
      toast.success("Register drawer opened successfully");
      setOpenShiftModal(false);
      setShiftNotes("");
      refetchShift();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to open shift"),
  });

  const closeShiftMutation = useMutation({
    mutationFn: (shiftId: ID) => shiftsApi.closeShift(shiftId, closingCashCount, shiftNotes),
    onSuccess: (data) => {
      const diff = Number(data.cash_difference ?? 0);
      const diffLabel = diff === 0 ? "Exact balance" : diff > 0 ? `+${formatMoney(diff)} overage` : `-${formatMoney(Math.abs(diff))} shortage`;
      toast.success(`Drawer closed (${diffLabel}). Shift #${data.id} recorded.`);
      setCloseShiftModal(false);
      setShiftNotes("");
      refetchShift();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to close shift"),
  });

  // Cart operations
  const resetCart = () => {
    setCustomer("");
    setPaymentMethod("cash");
    setIsSplitPayment(false);
    setSplitPayments([
      { payment_method: "cash", amount: 0 },
      { payment_method: "mpesa", amount: 0 },
    ]);
    setCashTendered(0);
    setDiscount(0);
    setLines([newLine()]);
    setBarcodeInput("");
    setLinkedRx(null);
  };

  const openCreate = () => {
    resetCart();
    setDialogOpen(true);
  };

  const setLine = (key: string, patch: Partial<LineItem>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  // Barcode scanner
  const handleBarcodeScan = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;
    setScanning(true);
    try {
      const product = await productsApi.lookupBarcode(code);
      setLines((prev) => {
        const existing = prev.find((l) => String(l.product) === String(product.id));
        if (existing) {
          return prev.map((l) =>
            l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l
          );
        }
        const blank = prev.find((l) => !l.product);
        const newEntry: LineItem = {
          key: blank ? blank.key : Math.random().toString(36).slice(2),
          product: product.id,
          productName: product.name,
          unitPrice: priceFor(product),
          quantity: 1,
        };
        return blank ? prev.map((l) => (l.key === blank.key ? newEntry : l)) : [...prev, newEntry];
      });
      toast.success(`Scanned: ${product.name}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        toast.error(`No medicine found for barcode / SKU "${code}"`);
      } else {
        toast.error(err instanceof Error ? err.message : "Barcode lookup failed");
      }
    } finally {
      setBarcodeInput("");
      setScanning(false);
    }
  };

  // Park & Recall functionality
  const parkCurrentCart = () => {
    const validLines = lines.filter((l) => l.product);
    if (validLines.length === 0) {
      toast.error("Cannot park an empty cart — add at least one item first.");
      return;
    }
    if (parkedTickets.length >= 5) {
      toast.error("Maximum 5 parked tickets reached. Please recall or discard one first.");
      return;
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const ticketId = `ticket-${Date.now()}`;
    const custObj = customer ? products.find(() => true) : null; // label fallback
    const ticketName = linkedRx
      ? `Rx #${linkedRx.id}`
      : customer
        ? `Patient #${customer}`
        : `Counter #${parkedTickets.length + 1}`;

    const newTicket: ParkedTicket = {
      id: ticketId,
      name: `${ticketName} (${validLines.length} items)`,
      timestamp: timeStr,
      customer,
      paymentMethod,
      isSplitPayment,
      splitPayments,
      discount,
      lines: [...lines],
      linkedRxId: linkedRx?.id,
      linkedRxLabel: linkedRx ? `Rx #${linkedRx.id} · ${linkedRx.prescribed_by}` : undefined,
      subtotal,
      total,
    };

    const updated = [...parkedTickets, newTicket];
    setParkedTickets(updated);
    persistParkedTickets(updated);
    toast.success(`Cart parked as "${newTicket.name}" at ${timeStr}`);
    resetCart();
  };

  const recallTicket = (ticket: ParkedTicket) => {
    setCustomer(ticket.customer);
    setPaymentMethod(ticket.paymentMethod);
    setIsSplitPayment(ticket.isSplitPayment);
    setSplitPayments(ticket.splitPayments || [
      { payment_method: "cash", amount: 0 },
      { payment_method: "mpesa", amount: 0 },
    ]);
    setDiscount(ticket.discount);
    setLines(ticket.lines.length > 0 ? ticket.lines : [newLine()]);
    if (ticket.linkedRxId) {
      setLinkedRx({
        id: ticket.linkedRxId,
        prescribed_by: ticket.linkedRxLabel ?? "Prescribing Doctor",
      } as any);
    } else {
      setLinkedRx(null);
    }

    const remaining = parkedTickets.filter((t) => t.id !== ticket.id);
    setParkedTickets(remaining);
    persistParkedTickets(remaining);

    toast.success(`Recalled ticket "${ticket.name}"`);
    setDialogOpen(true);
  };

  const discardTicket = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const remaining = parkedTickets.filter((t) => t.id !== id);
    setParkedTickets(remaining);
    persistParkedTickets(remaining);
    toast.info("Parked ticket discarded");
  };

  // Prescription pull
  const importPrescription = (rx: Prescription) => {
    if (!rx.items || rx.items.length === 0) {
      toast.error("This prescription has no medicine items.");
      return;
    }

    setCustomer(rx.customer || "");
    setLinkedRx(rx);

    const importedLines: LineItem[] = rx.items.map((item) => {
      const prod = products.find((p) => String(p.id) === String(item.product));
      return {
        key: Math.random().toString(36).slice(2),
        product: item.product,
        productName: item.product_name || prod?.name,
        unitPrice: prod ? priceFor(prod) : 0,
        quantity: item.quantity,
      };
    });

    setLines(importedLines);
    setRxDialogOpen(false);
    toast.success(`Imported Prescription #${rx.id} (${rx.items.length} items) directly into cart`);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lines.some((l) => l.product)) {
      toast.error("Please add at least one line item to the order");
      return;
    }
    if (isSplitPayment && Math.abs(splitBalanceRemaining) > 0.05) {
      toast.error(
        `Split payments do not match total. Allocated ${formatMoney(totalSplitAllocated)} of ${formatMoney(total)}.`
      );
      return;
    }
    save.mutate();
  };

  // Operational metrics
  const completedSales = React.useMemo(() => data.filter((s) => s.status === "completed"), [data]);
  const totalRevenue = React.useMemo(() => completedSales.reduce((acc, s) => acc + (Number(s.total) || 0), 0), [completedSales]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={isWholesale ? "B2B Order & Logistics Desk" : "Dispensary POS Counter"}
        description={
          isWholesale
            ? "Create wholesale client orders at trade pricing. Stock is automatically deducted from earliest-expiring lots (FEFO)."
            : "Ring up prescription and OTC medications at retail pricing with automatic FEFO batch allocation."
        }
        actions={
          <div className="flex items-center gap-2">
            {currentShift ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setClosingCashCount(Number(currentShift.estimated_drawer_total ?? 0));
                  setCloseShiftModal(true);
                }}
                className="gap-1.5 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 text-xs"
              >
                <Unlock className="h-3.5 w-3.5" />
                <span>Close Shift / Z-Report</span>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpenShiftModal(true)}
                className="gap-1.5 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 text-xs"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Open Drawer Shift</span>
              </Button>
            )}

            {canCreate && (
              <Button onClick={openCreate} className="gap-1.5 shadow-2xs font-medium">
                <ShoppingCart className="h-4 w-4" />
                <span>{isWholesale ? "New Wholesale Order" : "Ring Up Sale"}</span>
              </Button>
            )}
          </div>
        }
      />

      {/* Cashier Shift Drawer Status Bar */}
      {currentShift ? (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-xs text-foreground">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              <Unlock className="h-4 w-4" />
            </div>
            <div>
              <span className="font-semibold text-emerald-700 dark:text-emerald-400 mr-2">
                Register Active (Shift #{currentShift.id})
              </span>
              <span className="text-muted-foreground">
                Cashier: <strong>{currentShift.cashier_name}</strong> · Opened {formatDate(currentShift.opened_at)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 font-mono">
            <div>
              <span className="text-muted-foreground mr-1">Float:</span>
              <span>{formatMoney(currentShift.opening_float)}</span>
            </div>
            <div>
              <span className="text-muted-foreground mr-1">Cash Sales:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                +{formatMoney(currentShift.current_cash_sales ?? 0)}
              </span>
            </div>
            <div className="border-l border-emerald-500/30 pl-4 font-semibold text-primary">
              <span className="text-muted-foreground mr-1">Expected Drawer:</span>
              <span>{formatMoney(currentShift.estimated_drawer_total ?? 0)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 text-xs text-foreground">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <span className="font-semibold text-amber-700 dark:text-amber-400 mr-2">Register Drawer Closed</span>
              <span className="text-muted-foreground">
                Start a cashier shift with an opening float to record drawer cash balances and end-of-day reconciliation.
              </span>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpenShiftModal(true)}
            className="text-xs h-7 border-amber-500/40 hover:bg-amber-500/10"
          >
            Open Register
          </Button>
        </div>
      )}

      {/* Parked Tickets Bar */}
      {parkedTickets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl border border-primary/20 bg-primary/5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-primary pl-1 mr-1">
            <PauseCircle className="h-4 w-4" />
            <span>Parked Counter Carts ({parkedTickets.length}/5):</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {parkedTickets.map((ticket) => (
              <div
                key={ticket.id}
                onClick={() => recallTicket(ticket)}
                className="group flex items-center gap-2 px-2.5 py-1 bg-card hover:bg-primary/10 border border-border/70 hover:border-primary/40 rounded-lg cursor-pointer transition-colors shadow-2xs text-xs"
              >
                <div className="flex flex-col">
                  <span className="font-medium text-foreground group-hover:text-primary">
                    {ticket.name}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {formatMoney(ticket.total)} · {ticket.timestamp}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => discardTicket(ticket.id, e)}
                  title="Discard ticket"
                  className="p-1 text-muted-foreground hover:text-destructive rounded-sm"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Operational register cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border/70 shadow-2xs">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Settled Orders</p>
              <p className="text-xl font-bold font-mono tracking-tight">{completedSales.length}</p>
            </div>
            <Receipt className="h-5 w-5 text-muted-foreground/60" />
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-2xs">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Recorded Volume</p>
              <p className="text-xl font-bold font-mono tracking-tight text-primary">
                {formatMoney(totalRevenue)}
              </p>
            </div>
            <Wallet className="h-5 w-5 text-primary/70" />
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-2xs">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Active Price Tier</p>
              <div className="mt-1 flex items-center gap-1.5">
                <Badge variant={isWholesale ? "secondary" : "outline"} className="text-xs font-semibold capitalize">
                  {isWholesale ? "Wholesale Trade" : "Retail Patient RRP"}
                </Badge>
              </div>
            </div>
            {isWholesale ? <Building2 className="h-5 w-5 text-muted-foreground/60" /> : <Pill className="h-5 w-5 text-muted-foreground/60" />}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-2xs">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">FEFO Inventory Mode</p>
              <div className="mt-1 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Automated</span>
              </div>
            </div>
            <Sparkles className="h-5 w-5 text-emerald-600" />
          </CardContent>
        </Card>
      </div>

      <DataTable<Sale>
        rows={data}
        isLoading={isLoading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={isWholesale ? "Search by client or order #…" : "Search sales by customer or #…"}
        columns={[
          {
            key: "id",
            header: isWholesale ? "Order #" : "Receipt #",
            render: (s) => (
              <Link
                to="/sales/$saleId"
                params={{ saleId: String(s.id) }}
                className="text-primary hover:underline font-mono font-medium"
              >
                #{s.id}
              </Link>
            ),
          },
          { key: "created_at", header: "Timestamp", accessor: (s) => formatDate(s.created_at) },
          {
            key: "customer",
            header: isWholesale ? "Client Account" : "Patient / Customer",
            render: (s) => (
              <div className="flex items-center gap-1.5">
                <span className="font-medium">{s.customer_name ?? (isWholesale ? "General Account" : "Walk-in Patient")}</span>
                {!s.customer_name && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground py-0 px-1 font-mono">
                    Walk-in
                  </Badge>
                )}
                {s.prescription && (
                  <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary py-0 px-1 font-mono">
                    Rx #{s.prescription}
                  </Badge>
                )}
              </div>
            ),
          },
          { key: "sold_by", header: isWholesale ? "Dispatcher" : "Cashier", accessor: (s) => s.sold_by_name ?? "—" },
          {
            key: "payment_method",
            header: "Payment",
            render: (s) => (
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="capitalize text-xs font-mono font-normal">
                  {s.payment_method}
                </Badge>
                {s.payments && s.payments.length > 1 && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    ({s.payments.length} parts)
                  </span>
                )}
              </div>
            ),
          },
          { key: "status", header: "Status", render: (s) => <StatusBadge status={s.status} /> },
          { key: "total", header: "Total", className: "text-right font-mono font-semibold", render: (s) => <MoneyCell value={s.total} /> },
        ]}
        actions={[
          {
            label: "Print receipt / invoice",
            icon: <Receipt className="h-4 w-4" />,
            onSelect: (s) => navigate({ to: "/sales/$saleId", params: { saleId: String(s.id) } }),
          },
          ...(canVoid
            ? [
                {
                  label: "Void transaction",
                  icon: <Ban className="h-4 w-4" />,
                  destructive: true,
                  onSelect: (s: Sale) => s.status !== "void" && setToVoid(s),
                },
              ]
            : []),
        ]}
        emptyTitle="No transactions recorded"
        emptyDescription={isWholesale ? "Create your first B2B order to record sales." : "Ring up your first dispensary sale."}
      />

      {/* POS / Order Entry Modal */}
      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={isWholesale ? "New Wholesale B2B Order" : "Dispensary POS Register"}
        description="Line items will be allocated automatically from earliest-expiring batches (FEFO)."
        onSubmit={onSubmit}
        isPending={save.isPending}
        submitLabel={isWholesale ? "Confirm & Dispatch Order" : "Complete & Print Receipt"}
        size="lg"
      >
        {/* Linked prescription notification if active */}
        {linkedRx && (
          <div className="flex items-center justify-between p-2.5 rounded-lg border border-primary/30 bg-primary/10 text-xs text-foreground">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span>
                Linked to <strong>Prescription #{linkedRx.id}</strong> (Prescribed by {linkedRx.prescribed_by})
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => setLinkedRx(null)}
            >
              Unlink
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={isWholesale ? "Client Account" : "Patient / Customer (optional)"}>
            <EntitySelect
              value={customer}
              onChange={(id) => setCustomer(id)}
              queryKey={["customers", "all"]}
              fetcher={() => customersApi.list({ page_size: 500 })}
              getLabel={(c) => c.name}
              placeholder={isWholesale ? "Select client account" : "Walk-in Patient"}
            />
          </Field>

          <Field label="Settlement Mode">
            <div className="flex gap-2">
              <Select
                value={isSplitPayment ? "split" : paymentMethod}
                onValueChange={(v) => {
                  if (v === "split") {
                    setIsSplitPayment(true);
                    setSplitPayments([
                      { payment_method: "cash", amount: Math.round(total / 2) },
                      { payment_method: "mpesa", amount: total - Math.round(total / 2) },
                    ]);
                  } else {
                    setIsSplitPayment(false);
                    setPaymentMethod(v as PaymentMethod);
                  }
                }}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">
                    <span className="flex items-center gap-2">
                      <Banknote className="h-4 w-4 text-emerald-600" /> Cash
                    </span>
                  </SelectItem>
                  <SelectItem value="mpesa">
                    <span className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-green-600" /> M-Pesa
                    </span>
                  </SelectItem>
                  <SelectItem value="card">
                    <span className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-blue-600" /> Credit / Debit Card
                    </span>
                  </SelectItem>
                  <SelectItem value="credit">
                    <span className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-amber-600" /> Client Credit Line
                    </span>
                  </SelectItem>
                  <SelectItem value="split">
                    <span className="flex items-center gap-2 font-medium text-primary">
                      <Split className="h-4 w-4" /> Split Tender (Multi-method)
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Field>
        </div>

        {/* Split Payments Breakdown UI */}
        {isSplitPayment && (
          <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-2 text-xs">
            <div className="flex items-center justify-between pb-1 border-b border-primary/10">
              <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                Split Tender Distribution
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono">
                  Allocated: <strong>{formatMoney(totalSplitAllocated)}</strong> / {formatMoney(total)}
                </span>
                {Math.abs(splitBalanceRemaining) > 0.05 ? (
                  <Badge variant="destructive" className="text-[10px]">
                    Remaining: {formatMoney(splitBalanceRemaining)}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] bg-emerald-500/20 text-emerald-700">
                    Balanced
                  </Badge>
                )}
              </div>
            </div>

            <div className="space-y-2 pt-1">
              {splitPayments.map((sp, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Select
                    value={sp.payment_method}
                    onValueChange={(val) =>
                      setSplitPayments((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, payment_method: val as PaymentMethod } : item))
                      )
                    }
                  >
                    <SelectTrigger className="w-40 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="mpesa">M-Pesa</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="credit">Credit Line</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    className="flex-1 h-8 font-mono text-xs"
                    value={sp.amount || ""}
                    onChange={(e) =>
                      setSplitPayments((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, amount: Number(e.target.value) } : item))
                      )
                    }
                    placeholder="0.00"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-muted-foreground hover:text-primary"
                    onClick={() => {
                      const otherTotal = splitPayments.reduce((s, p, i) => (i === idx ? s : s + Number(p.amount)), 0);
                      const rem = Math.max(0, total - otherTotal);
                      setSplitPayments((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, amount: rem } : item))
                      );
                    }}
                  >
                    Auto-Fill
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    disabled={splitPayments.length <= 1}
                    onClick={() => setSplitPayments((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs mt-1"
              disabled={splitPayments.length >= 4}
              onClick={() =>
                setSplitPayments((prev) => [
                  ...prev,
                  {
                    payment_method: "card",
                    amount: Math.max(0, splitBalanceRemaining),
                  },
                ])
              }
            >
              <Plus className="h-3 w-3 mr-1" /> Add Payment Line
            </Button>
          </div>
        )}

        {/* Cash Tendered & Change Calculator (if cash is involved) */}
        {cashPortionDue > 0 && (
          <div className="p-3 rounded-lg border border-border/80 bg-muted/30 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5 text-emerald-600" />
                <span>Cash Tendered & Change Calculator</span>
              </label>
              <span className="text-xs text-muted-foreground font-mono">
                Cash Due: <strong>{formatMoney(cashPortionDue)}</strong>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="w-36">
                <Input
                  type="number"
                  min={0}
                  step="1"
                  placeholder="0.00"
                  value={cashTendered || ""}
                  onChange={(e) => setCashTendered(Number(e.target.value))}
                  className="font-mono text-sm h-8"
                />
              </div>

              {/* Quick tender buttons */}
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs font-mono"
                  onClick={() => setCashTendered(cashPortionDue)}
                >
                  Exact ({cashPortionDue})
                </Button>
                {[500, 1000, 2000].map((amt) => (
                  <Button
                    key={amt}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-2 text-xs font-mono"
                    onClick={() => setCashTendered(amt)}
                  >
                    {amt}
                  </Button>
                ))}
                {[50, 100, 500].map((step) => (
                  <Button
                    key={`+${step}`}
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 px-1.5 text-xs font-mono text-muted-foreground"
                    onClick={() => setCashTendered((prev) => prev + step)}
                  >
                    +{step}
                  </Button>
                ))}
              </div>

              {/* Live Change Output */}
              <div className="flex-1 flex justify-end items-center gap-2">
                <span className="text-xs uppercase font-medium text-muted-foreground">Change Due:</span>
                <span
                  className={`font-mono text-base font-bold ${
                    cashTendered >= cashPortionDue ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600"
                  }`}
                >
                  {formatMoney(changeDue)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Barcode scanner wedge input */}
        <Field
          label="Barcode Scanner / SKU Entry"
          hint="Scan with USB/Bluetooth barcode reader or type medicine SKU and hit Enter."
        >
          <div className="relative">
            <Barcode className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={handleBarcodeScan}
              placeholder="Scan medicine barcode or enter SKU…"
              className="pl-8 font-mono text-sm"
              disabled={scanning}
              autoFocus
            />
          </div>
        </Field>

        {/* Item table with Prescription Pull & Park buttons */}
        <div className="space-y-2 border border-border/80 rounded-lg p-3 bg-muted/20">
          <div className="flex items-center justify-between pb-1 border-b border-border/60">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Prescription & Product Items ({lines.filter((l) => l.product).length})
            </label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => setRxDialogOpen(true)}
              >
                <FileText className="h-3.5 w-3.5" /> Pull Rx
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setLines((p) => [...p, newLine()])}
              >
                <Plus className="h-3 w-3 mr-1" /> Add Medicine
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={parkCurrentCart}
                title="Save this cart into session storage to ring up another customer"
              >
                <PauseCircle className="h-3.5 w-3.5 text-amber-600" /> Park Cart
              </Button>
            </div>
          </div>

          <div className="space-y-2 pt-1 max-h-[260px] overflow-y-auto pr-1">
            {lines.map((line, idx) => (
              <div key={line.key} className="flex items-center gap-2 bg-card p-2 rounded-md border border-border/60">
                <span className="text-xs font-mono text-muted-foreground w-4 text-center">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <EntitySelect
                    value={line.product}
                    onChange={(id) => {
                      const p = products.find((pr) => String(pr.id) === String(id));
                      setLine(line.key, { product: id, unitPrice: p ? priceFor(p) : undefined, productName: p?.name });
                    }}
                    queryKey={["products", "all"]}
                    fetcher={() => productsApi.list({ page_size: 500 })}
                    getLabel={(p) => `${p.name} · ${formatMoney(priceFor(p))}`}
                    placeholder="Select medicine or supply"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Qty:</span>
                  <Input
                    type="number"
                    min={1}
                    className="w-18 h-9 text-center font-mono"
                    value={line.quantity}
                    onChange={(e) => setLine(line.key, { quantity: Math.max(1, Number(e.target.value)) })}
                  />
                </div>
                <span className="w-24 text-right text-sm font-mono font-semibold tabular-nums text-foreground">
                  {formatMoney((line.unitPrice ?? 0) * line.quantity)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeLine(line.key)}
                  disabled={lines.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Calculation footer */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <Field label="Discount" htmlFor="discount">
            <Input
              id="discount"
              type="number"
              min={0}
              step="0.01"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
              placeholder="0.00"
              className="font-mono"
            />
          </Field>
          <div className="flex flex-col justify-center items-end bg-card p-3 rounded-lg border border-border/80">
            <p className="text-xs text-muted-foreground font-mono">Gross Subtotal: {formatMoney(subtotal)}</p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Total Due:</span>
              <span className="text-2xl font-bold font-mono tracking-tight text-primary">
                {formatMoney(total)}
              </span>
            </div>
          </div>
        </div>
      </FormDialog>

      {/* Prescription Pull Dialog */}
      <FormDialog
        open={rxDialogOpen}
        onOpenChange={setRxDialogOpen}
        title="Pull Prescription into POS"
        description="Select an active prescription to automatically import medicine items and patient details into the register."
        size="lg"
        submitLabel="Close"
        onSubmit={(e) => {
          e.preventDefault();
          setRxDialogOpen(false);
        }}
      >
        <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
          {pullableRx.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No prescriptions found. Log prescriptions from the Prescriptions module first.
            </div>
          ) : (
            pullableRx.map((rx) => (
              <div
                key={rx.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border/80 bg-card hover:border-primary/50 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">Rx #{rx.id}</span>
                    <Badge variant={rx.status === "dispensed" ? "secondary" : "outline"} className="text-[10px]">
                      {rx.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Patient: <strong>{rx.customer_name ?? "Walk-in"}</strong>
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Doctor: {rx.prescribed_by} · {formatDate(rx.created_at)}
                  </p>
                  <div className="text-xs font-mono text-primary/90">
                    {rx.items?.map((it) => `${it.product_name ?? "Item"} (×${it.quantity})`).join(", ")}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1 border-primary/30 hover:bg-primary/10 text-xs font-medium"
                  onClick={() => importPrescription(rx)}
                >
                  <Plus className="h-3.5 w-3.5" /> Import to Cart
                </Button>
              </div>
            ))
          )}
        </div>
      </FormDialog>

      {/* Open Shift Modal */}
      <FormDialog
        open={openShiftModal}
        onOpenChange={setOpenShiftModal}
        title="Open Register Shift"
        description="Record initial drawer float cash before ringing up counter transactions."
        onSubmit={(e) => {
          e.preventDefault();
          openShiftMutation.mutate();
        }}
        isPending={openShiftMutation.isPending}
        submitLabel="Open Register Drawer"
      >
        <Field label="Opening Float Cash (KES)" hint="Count the physical change in the drawer.">
          <Input
            type="number"
            min={0}
            step="1"
            value={openingFloat}
            onChange={(e) => setOpeningFloat(Number(e.target.value))}
            className="font-mono"
            required
          />
        </Field>
        <Field label="Shift Notes (Optional)">
          <Input
            value={shiftNotes}
            onChange={(e) => setShiftNotes(e.target.value)}
            placeholder="e.g. Morning counter till #1"
          />
        </Field>
      </FormDialog>

      {/* Close Shift / Z-Report Modal */}
      <FormDialog
        open={closeShiftModal}
        onOpenChange={setCloseShiftModal}
        title={`Close Drawer & Shift Reconciliation (#${currentShift?.id})`}
        description="Count physical cash in the drawer to reconcile against logged sales."
        onSubmit={(e) => {
          e.preventDefault();
          if (currentShift) closeShiftMutation.mutate(currentShift.id);
        }}
        isPending={closeShiftMutation.isPending}
        submitLabel="Confirm Close & Print Z-Report"
      >
        <div className="space-y-3 p-3 rounded-lg border border-border/80 bg-muted/20 text-xs font-mono">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Opening Float:</span>
            <span>{formatMoney(currentShift?.opening_float ?? 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cash Sales During Shift:</span>
            <span className="text-emerald-600 font-semibold">
              +{formatMoney(currentShift?.current_cash_sales ?? 0)}
            </span>
          </div>
          <div className="border-t border-border/60 pt-2 flex justify-between font-bold text-sm">
            <span>Expected Cash in Drawer:</span>
            <span className="text-primary">{formatMoney(currentShift?.estimated_drawer_total ?? 0)}</span>
          </div>
        </div>

        <Field label="Actual Counted Cash in Till (KES)" hint="Count all physical notes & coins in the drawer.">
          <Input
            type="number"
            min={0}
            step="0.01"
            value={closingCashCount}
            onChange={(e) => setClosingCashCount(Number(e.target.value))}
            className="font-mono text-base font-semibold"
            required
          />
        </Field>

        {/* Live discrepancy calculation */}
        {currentShift && (
          <div className="p-2.5 rounded-lg border flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">Reconciliation Variance:</span>
            {(() => {
              const diff = closingCashCount - Number(currentShift.estimated_drawer_total ?? 0);
              if (Math.abs(diff) < 0.05) {
                return (
                  <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                    Exact Balance (0.00)
                  </Badge>
                );
              }
              if (diff > 0) {
                return (
                  <Badge className="bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30">
                    Overage: +{formatMoney(diff)}
                  </Badge>
                );
              }
              return (
                <Badge variant="destructive">
                  Shortage: -{formatMoney(Math.abs(diff))}
                </Badge>
              );
            })()}
          </div>
        )}

        <Field label="Closing Notes & Reason for Variance (Optional)">
          <Input
            value={shiftNotes}
            onChange={(e) => setShiftNotes(e.target.value)}
            placeholder="e.g. Till balanced, bank deposit prepared"
          />
        </Field>
      </FormDialog>

      <ConfirmDialog
        open={!!toVoid}
        onOpenChange={(v) => !v && setToVoid(null)}
        title={`Void transaction #${toVoid?.id}?`}
        description="The sale will be marked as void and stock quantities will be restored back to their originating FEFO batches."
        confirmLabel="Confirm Void"
        destructive
        onConfirm={() => toVoid && voidMutation.mutate(toVoid.id)}
      />
    </div>
  );
}

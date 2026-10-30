// Generic CRUD factory + concrete resource modules.
// Paths match backend/*/urls.py exactly.

import { apiFetch } from "./client";
import type {
  ActivityLogEntry,
  AppUser,
  Batch,
  CashierShift,
  Category,
  Customer,
  ID,
  InventoryValuationResponse,
  Paginated,
  PaymentMethodBreakdown,
  Prescription,
  Product,
  PurchaseOrder,
  Sale,
  SalesSummaryResponse,
  StockMovement,
  Supplier,
  Tenant,
  TopProductRow,
} from "../types";

export interface ListParams {
  search?: string;
  page?: number;
  page_size?: number;
  ordering?: string;
  [key: string]: unknown;
}

function unwrapList<T>(data: Paginated<T> | T[]): T[] {
  if (Array.isArray(data)) return data;
  return data?.results ?? [];
}

/** Fetch every page of a (possibly paginated) list endpoint. */
export async function fetchAllPages<T>(
  path: string,
  params?: Record<string, unknown>,
): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = null;
  let page = 1;
  do {
    const data: Paginated<T> | T[] = next
      ? await apiFetch<Paginated<T> | T[]>(next)
      : await apiFetch<Paginated<T> | T[]>(path, { query: { ...params, page } });
    out.push(...unwrapList(data));
    next = Array.isArray(data) ? null : (data?.next ?? null);
    page += 1;
  } while (next && page < 50);
  return out;
}

export function createResource<T extends { id: ID }, C = Partial<T>, U = Partial<T>>(
  basePath: string,
) {
  const path = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return {
    path,
    async list(params?: ListParams): Promise<T[]> {
      const data = await apiFetch<Paginated<T> | T[]>(path, { query: params });
      return unwrapList(data);
    },
    async listRaw(params?: ListParams): Promise<Paginated<T> | T[]> {
      return apiFetch<Paginated<T> | T[]>(path, { query: params });
    },
    async get(id: ID): Promise<T> {
      return apiFetch<T>(`${path}${id}/`);
    },
    async create(body: C): Promise<T> {
      return apiFetch<T>(path, { method: "POST", body });
    },
    async update(id: ID, body: U): Promise<T> {
      return apiFetch<T>(`${path}${id}/`, { method: "PATCH", body });
    },
    async remove(id: ID): Promise<void> {
      await apiFetch<void>(`${path}${id}/`, { method: "DELETE" });
    },
  };
}

export const tenantsApi = createResource<Tenant>("/tenants");
export const usersApi = createResource<AppUser>("/users");

export const categoriesApi = createResource<Category>("/categories");

export const productsApi = {
  ...createResource<Product>("/products"),
  async expiringSoon(days = 30): Promise<Batch[]> {
    return apiFetch<Batch[]>("/products/expiring_soon/", { query: { days } });
  },
  async lookupBarcode(code: string): Promise<Product> {
    return apiFetch<Product>("/products/lookup_barcode/", { query: { code } });
  },
};

export const batchesApi = createResource<Batch>("/batches");

export const stockMovementsApi = {
  ...createResource<StockMovement>("/stock-movements"),
};

export const suppliersApi = createResource<Supplier>("/suppliers");

export const purchaseOrdersApi = {
  ...createResource<PurchaseOrder>("/purchase-orders"),
  async receive(id: ID, batches: Array<{ item_id: ID; batch_number: string; expiry_date: string }>) {
    return apiFetch<PurchaseOrder>(`/purchase-orders/${id}/receive/`, {
      method: "POST",
      body: { batches },
    });
  },
};

export const customersApi = createResource<Customer>("/customers");

export const salesApi = {
  ...createResource<Sale>("/sales"),
  async void(id: ID) {
    return apiFetch<Sale>(`/sales/${id}/void/`, { method: "POST" });
  },
};

export const prescriptionsApi = {
  ...createResource<Prescription>("/prescriptions"),
  async dispense(id: ID) {
    return apiFetch<Prescription>(`/prescriptions/${id}/dispense/`, { method: "POST" });
  },
};

export const shiftsApi = {
  ...createResource<CashierShift>("/shifts"),
  async current(): Promise<CashierShift | null> {
    return apiFetch<CashierShift | null>("/shifts/current/");
  },
  async openShift(opening_float: number, notes?: string): Promise<CashierShift> {
    return apiFetch<CashierShift>("/shifts/open_shift/", {
      method: "POST",
      body: { opening_float, notes },
    });
  },
  async closeShift(id: ID, closing_cash: number, notes?: string): Promise<CashierShift> {
    return apiFetch<CashierShift>(`/shifts/${id}/close_shift/`, {
      method: "POST",
      body: { closing_cash, notes },
    });
  },
};

export const activityLogApi = createResource<ActivityLogEntry>("/activity-log");

export interface ReportDateRangeParams {
  start?: string;
  end?: string;
}

export const reportsApi = {
  async salesSummary(params?: ReportDateRangeParams & { period?: "day" | "week" | "month" }) {
    return apiFetch<SalesSummaryResponse>("/reports/sales-summary/", { query: params });
  },
  async salesByPaymentMethod(params?: ReportDateRangeParams) {
    return apiFetch<{ start: string; end: string; results: PaymentMethodBreakdown[] }>(
      "/reports/sales-by-payment-method/", { query: params },
    );
  },
  async topProducts(params?: ReportDateRangeParams & { limit?: number; by?: "revenue" | "quantity" }) {
    return apiFetch<{ start: string; end: string; results: TopProductRow[] }>(
      "/reports/top-products/", { query: params },
    );
  },
  async inventoryValuation() {
    return apiFetch<InventoryValuationResponse>("/reports/inventory-valuation/");
  },
};

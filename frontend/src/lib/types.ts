// Entity types — match the Django REST serializers in backend/.

export type ID = number | string;

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type UserRole = "admin" | "sales" | "technician" | string;
export type TenantType = "wholesale" | "retail";

export interface AuthUser {
  id: ID;
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  is_staff?: boolean;
  is_superuser?: boolean;
  role?: UserRole;
  tenant_id?: ID | null;
  tenant_name?: string | null;
  tenant_type?: TenantType | null;
}

export interface Tenant {
  id: ID;
  name: string;
  slug: string;
  tenant_type: TenantType;
  tenant_type_display?: string;
  phone?: string;
  email?: string;
  address?: string;
  license_number?: string;
  license_expiry?: string | null;
  is_active?: boolean;
  created_at?: string;
}

export interface AppUser {
  id: ID;
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  role: UserRole;
  phone?: string;
  is_active_employee?: boolean;
  date_joined?: string;
  password?: string; // write-only, create form
}

export interface Category {
  id: ID;
  name: string;
  description?: string;
}

export type ProductUnit =
  | "tablet" | "capsule" | "bottle" | "vial" | "tube" | "box" | "pack" | "strip" | "unit";

export interface Product {
  id: ID;
  name: string;
  sku: string;
  barcode?: string;
  category: ID | null;
  category_name?: string | null;
  manufacturer?: string;
  unit: ProductUnit;
  requires_prescription: boolean;
  cost_price: number | string;
  wholesale_price: number | string;
  retail_price: number | string;
  reorder_level: number;
  is_active: boolean;
  quantity_on_hand?: number;
  is_low_stock?: boolean;
  created_at?: string;
}

export interface Batch {
  id: ID;
  product: ID;
  product_name?: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  cost_price: number | string;
  supplier: ID | null;
  supplier_name?: string | null;
  received_date?: string;
  is_expired?: boolean;
}

export type MovementType = "in" | "out" | "adjustment";

export interface StockMovement {
  id: ID;
  product: ID;
  product_name?: string;
  batch: ID | null;
  movement_type: MovementType;
  quantity: number;
  reason?: string;
  reference?: string;
  created_by?: ID | null;
  created_by_name?: string | null;
  created_at?: string;
}

export interface Supplier {
  id: ID;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  is_active?: boolean;
}

export type PurchaseOrderStatus = "draft" | "ordered" | "received" | "cancelled";

export interface PurchaseOrderItem {
  id?: ID;
  product: ID;
  product_name?: string;
  quantity: number;
  unit_cost: number | string;
}

export interface PurchaseOrder {
  id: ID;
  supplier: ID;
  supplier_name?: string;
  status: PurchaseOrderStatus;
  expected_date?: string | null;
  notes?: string;
  created_by?: ID | null;
  created_by_name?: string | null;
  created_at?: string;
  items: PurchaseOrderItem[];
  total?: number | string;
}

export type CustomerType = "walk_in" | "wholesale_client";

export interface Customer {
  id: ID;
  name: string;
  phone?: string;
  email?: string;
  customer_type: CustomerType;
  credit_limit?: number | string;
}

export type SaleStatus = "completed" | "void";
export type PaymentMethod = "cash" | "mpesa" | "card" | "credit";

export interface SaleItem {
  id?: ID;
  product: ID;
  product_name?: string;
  batch?: ID | null;
  quantity: number;
  unit_price?: number | string;
  subtotal?: number | string;
}

export interface Sale {
  id: ID;
  customer: ID | null;
  customer_name?: string | null;
  sold_by?: ID | null;
  sold_by_name?: string | null;
  status: SaleStatus;
  payment_method: PaymentMethod;
  discount: number | string;
  tax: number | string;
  prescription?: ID | null;
  created_at?: string;
  items: SaleItem[];
  subtotal?: number | string;
  total?: number | string;
}

export type PrescriptionStatus = "pending" | "dispensed" | "cancelled";

export interface PrescriptionItem {
  id?: ID;
  product: ID;
  product_name?: string;
  quantity: number;
  dosage_instructions?: string;
  dispensed?: boolean;
}

export interface Prescription {
  id: ID;
  customer: ID | null;
  customer_name?: string | null;
  prescribed_by: string;
  notes?: string;
  status: PrescriptionStatus;
  created_by?: ID | null;
  created_by_name?: string | null;
  dispensed_by?: ID | null;
  dispensed_by_name?: string | null;
  created_at?: string;
  items: PrescriptionItem[];
}

export interface ActivityLogEntry {
  id: ID;
  action: string;
  description: string;
  user: ID | null;
  user_name?: string | null;
  created_at: string;
}

export interface SalesSummaryPoint {
  period: string;
  sale_count: number;
  subtotal: number | string;
  discount: number | string;
  tax: number | string;
  total: number | string;
}

export interface SalesSummaryResponse {
  start: string;
  end: string;
  period: string;
  results: SalesSummaryPoint[];
}

export interface PaymentMethodBreakdown {
  payment_method: PaymentMethod;
  sale_count: number;
  total: number | string;
}

export interface TopProductRow {
  product_id: ID;
  product_name: string;
  sku: string;
  quantity_sold: number;
  revenue: number | string;
}

export interface CategoryValuation {
  category: string;
  quantity: number;
  cost_value: number | string;
  retail_value: number | string;
}

export interface InventoryValuationResponse {
  as_of: string;
  total_cost_value: number | string;
  total_retail_value: number | string;
  total_wholesale_value: number | string;
  expired_stock_cost_value: number | string;
  active_product_count: number;
  by_category: CategoryValuation[];
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  brand?: string | null;
  model?: string | null;
  category: string;
  unit: string;
  barcode?: string | null;
  alternate_names?: string | null;
  serial_tracking_enabled: boolean;
  is_active: boolean;
  low_stock_threshold?: number | null;
  created_at: string;
  updated_at: string;
  /** Owning store, if the product belongs to a single store. */
  store_id?: string | null;
  /** Total AVAILABLE stock quantity summed across all stores. */
  stock_quantity?: number | null;
}

export interface CreateProductInput {
  sku: string;
  name: string;
  brand?: string | null;
  model?: string | null;
  category: string;
  unit?: string;
  barcode?: string | null;
  alternate_names?: string | null;
  serial_tracking_enabled?: boolean;
  is_active?: boolean;
}

export interface UpdateProductInput {
  id: string;
  name: string;
  // Nullable: an explicit null clears the field on save. `undefined`
  // (key omitted) leaves the stored value untouched. This distinction is
  // what keeps a cleared Brand/Model/Barcode/Aliases from silently
  // resurrecting the old value on one runtime while clearing on another.
  brand?: string | null;
  model?: string | null;
  category: string;
  unit: string;
  barcode?: string | null;
  alternate_names?: string | null;
  serial_tracking_enabled: boolean;
}

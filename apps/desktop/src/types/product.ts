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
  created_at: string;
  updated_at: string;
}

export interface CreateProductInput {
  sku: string;
  name: string;
  brand?: string;
  model?: string;
  category: string;
  unit?: string;
  barcode?: string;
  alternate_names?: string;
  serial_tracking_enabled?: boolean;
  is_active?: boolean;
}

export interface UpdateProductInput {
  id: string;
  name: string;
  brand?: string;
  model?: string;
  category: string;
  unit: string;
  barcode?: string;
  alternate_names?: string;
  serial_tracking_enabled: boolean;
}

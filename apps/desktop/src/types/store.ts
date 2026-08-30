export interface Store {
  id: string;
  code: string;
  name: string;
  address: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateStoreInput {
  code: string;
  name: string;
  address?: string;
}

export interface UpdateStoreInput {
  id: string;
  name: string;
  address?: string;
}

export interface Device {
  id: string;
  store_id: string;
  device_name: string;
  is_active: boolean;
  registered_at: string;
  last_seen_at?: string | null;
}

export interface RegisterDeviceInput {
  store_id: string;
  device_name: string;
}

export type TransferStatus = 'DRAFT' | 'DISPATCHED' | 'RECEIVED' | 'EXCEPTION' | 'CANCELLED';

export interface Transfer {
  id: string;
  source_store_id: string;
  destination_store_id: string;
  product_id: string;
  quantity: number;
  status: TransferStatus;
  created_by_user_id: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTransferInput {
  source_store_id: string;
  destination_store_id: string;
  product_id: string;
  quantity: number;
  created_by_user_id: string;
  notes?: string;
}

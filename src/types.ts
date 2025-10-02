// src/types.ts
export type FileMeta = { id: number; filename: string; url: string; uploaded_at: string; size?: number };

export type ArrivalSearchResponse = { items: Arrival[]; total: number; page: number; per_page: number };

export type User = { id: number; email: string; name: string; role: string };

export type SupplierRef = {
  id: number;
  name: string;
  default_currency?: string;
  is_active?: boolean;
};

export type ArrivalSupplierLink = {
  id?: number;
  arrival_id?: number;
  supplier_id: number;
  supplier?: SupplierRef | null;
  supplier_name?: string;
  value?: number | null;
  currency?: string | null;
  note?: string | null;
};

export type Arrival = {
  id: number;
  supplier: string;
  carrier: string | null;
  plate: string | null;
  type: string;
  driver: string | null;
  pickup_date: string | null;
  eta: string | null;
  transport_price: number | null;
  goods_price: number | null;
  status: "not shipped" | "shipped" | "arrived";
  note: string | null;
  created_at: string;
  country?: string | null;
  countries?: string[];
  countries_verbose?: { code: string; name: string }[];
  suppliers?: ArrivalSupplierLink[];
  suppliers_value_total?: number | null;
};

export type Update = {
  id: number;
  arrival_id: number;
  user_id: number | null;
  message: string;
  created_at: string;
};

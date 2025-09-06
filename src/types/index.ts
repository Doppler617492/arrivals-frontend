// src/types/index.ts
export type FileMeta = { id: number; filename: string; url: string; uploaded_at: string; size?: number };

export type User = { id: number; email: string; name: string; role: string };

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
};

export type Update = {
  id: number;
  arrival_id: number;
  user_id: number | null;
  message: string;
  created_at: string;
};

export type ArrivalSearchResponse = { items: Arrival[]; total: number; page: number; per_page: number };
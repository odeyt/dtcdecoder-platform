export type ProductCategory = "wiring_diagram" | "software_tool";

export type OrderStatus = "pending" | "paid" | "failed" | "refunded";

export interface Product {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: ProductCategory;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year_start: number | null;
  vehicle_year_end: number | null;
  vehicle_system: string | null;
  price_cents: number;
  currency: string;
  creem_product_id: string | null;
  thumbnail_path: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductFile {
  id: string;
  product_id: string;
  storage_path: string;
  file_name: string;
  created_at: string;
}

export interface Order {
  id: string;
  user_id: string | null;
  email: string;
  status: OrderStatus;
  total_cents: number;
  currency: string;
  creem_checkout_id: string | null;
  provider_event_id: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  unit_price_cents: number;
  created_at: string;
}

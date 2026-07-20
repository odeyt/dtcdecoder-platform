import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Order, OrderItem, Product, ProductFile } from "@/lib/types";

export interface OrderWithItems extends Order {
  order_items: (OrderItem & {
    product: Pick<Product, "id" | "title" | "slug" | "category">;
  })[];
}

// Reads the signed-in user's own orders. RLS (orders_owner_read /
// order_items_owner_read) enforces the ownership boundary even if this
// query is ever reused elsewhere, so the plain session client is enough.
export async function getUserOrders(userId: string): Promise<OrderWithItems[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "*, order_items(*, product:products(id, title, slug, category))",
    )
    .eq("user_id", userId)
    .eq("status", "paid")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as OrderWithItems[];
}

// Retroactively attaches guest orders (matched by email) to a newly
// authenticated account. Safe to call on every login — only ever touches
// rows that don't already have a user_id. Requires the admin client since
// there is no update policy for the authenticated role on `orders`.
export async function linkOrdersToUser(
  userId: string,
  email: string,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("orders")
    .update({ user_id: userId })
    .eq("email", email)
    .is("user_id", null);

  if (error) throw error;
}

// Creates a pending order + single order item for a guest checkout. Writes
// always go through the admin client — there is no insert policy for the
// anon/authenticated role on `orders`/`order_items`.
export async function createPendingOrder(input: {
  email: string;
  productId: string;
  priceCents: number;
}): Promise<{ order: Order; orderItem: OrderItem }> {
  const supabase = createAdminClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      email: input.email,
      status: "pending",
      total_cents: input.priceCents,
    })
    .select()
    .single();

  if (orderError || !order) throw orderError ?? new Error("Order insert failed");

  const { data: orderItem, error: itemError } = await supabase
    .from("order_items")
    .insert({
      order_id: order.id,
      product_id: input.productId,
      unit_price_cents: input.priceCents,
    })
    .select()
    .single();

  if (itemError || !orderItem) {
    throw itemError ?? new Error("Order item insert failed");
  }

  return { order, orderItem };
}

export async function attachCreemCheckoutId(
  orderId: string,
  creemCheckoutId: string,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("orders")
    .update({ creem_checkout_id: creemCheckoutId })
    .eq("id", orderId);

  if (error) throw error;
}

// Returns true if this event was already processed (caller should no-op),
// false if this call just claimed it. Relies on provider_event_id's unique
// constraint as the idempotency lock — a second webhook delivery for the
// same event id fails this update's WHERE clause (0 rows affected) rather
// than double-applying the state transition.
export async function markOrderPaidIfNotAlready(
  orderId: string,
  providerEventId: string,
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      provider_event_id: providerEventId,
    })
    .eq("id", orderId)
    .is("provider_event_id", null)
    .select("id");

  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function markOrderFailed(orderId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("orders")
    .update({ status: "failed" })
    .eq("id", orderId);

  if (error) throw error;
}

export async function getOrderById(orderId: string): Promise<Order | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export interface PurchaseVerification {
  productFile: ProductFile;
  productTitle: string;
}

// Confirms the given user purchased the order item, and returns the file
// to serve if so. Returns null on any mismatch (wrong owner, unpaid order,
// unknown item) — callers should turn that into a 403/404, not leak which
// case it was.
export async function verifyPurchaseAndGetFile(
  userId: string,
  orderItemId: string,
): Promise<PurchaseVerification | null> {
  const supabase = createAdminClient();

  const { data: item, error: itemError } = await supabase
    .from("order_items")
    .select("id, product_id, order:orders!inner(id, user_id, status)")
    .eq("id", orderItemId)
    .maybeSingle();

  if (itemError || !item) return null;

  const order = Array.isArray(item.order) ? item.order[0] : item.order;
  if (!order || order.user_id !== userId || order.status !== "paid") {
    return null;
  }

  const { data: file, error: fileError } = await supabase
    .from("product_files")
    .select("*")
    .eq("product_id", item.product_id)
    .maybeSingle();

  if (fileError || !file) return null;

  const { data: product } = await supabase
    .from("products")
    .select("title")
    .eq("id", item.product_id)
    .maybeSingle();

  return { productFile: file, productTitle: product?.title ?? "your purchase" };
}

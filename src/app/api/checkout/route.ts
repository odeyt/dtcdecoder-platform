import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createPendingOrder, attachCreemCheckoutId } from "@/lib/orders";
import { createOneTimeCheckout } from "@/lib/payments/creem";
import { env } from "@/lib/env";

const checkoutSchema = z.object({
  productId: z.string().uuid(),
  email: z.string().email(),
});

export async function POST(request: NextRequest) {
  if (!env.billingEnabled()) {
    return NextResponse.json(
      { error: "Checkout is not available yet" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: product, error } = await supabase
    .from("products")
    .select("id, price_cents, creem_product_id, is_published")
    .eq("id", parsed.data.productId)
    .maybeSingle();

  if (error || !product || !product.is_published) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  try {
    const { order } = await createPendingOrder({
      email: parsed.data.email,
      productId: product.id,
      priceCents: product.price_cents,
    });

    const { checkoutUrl, checkoutId } = await createOneTimeCheckout({
      orderId: order.id,
      email: parsed.data.email,
      priceCents: product.price_cents,
      creemProductId: product.creem_product_id,
    });

    await attachCreemCheckoutId(order.id, checkoutId);

    return NextResponse.json({ checkoutUrl });
  } catch (err) {
    console.error("Checkout creation failed", err);
    return NextResponse.json(
      { error: "Unable to start checkout right now" },
      { status: 500 },
    );
  }
}

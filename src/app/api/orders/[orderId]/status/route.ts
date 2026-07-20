import { NextResponse, type NextRequest } from "next/server";
import { getOrderById } from "@/lib/orders";

// Deliberately returns only the status enum — never email, amount, or
// other order fields — so this can be polled by an unauthenticated buyer
// on the checkout/success page using just the (unguessable UUID) order id.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;
  const order = await getOrderById(orderId);

  if (!order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ status: order.status });
}

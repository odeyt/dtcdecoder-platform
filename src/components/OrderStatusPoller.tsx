"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Polls order status while it's still "pending" (the Creem webhook can land
// a beat after the browser redirect back to us) and refreshes the server
// component once it flips, so the success page shows the real state
// without the buyer needing to manually reload.
export function OrderStatusPoller({ orderId }: { orderId: string }) {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/orders/${orderId}/status`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status !== "pending") {
        clearInterval(interval);
        router.refresh();
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [orderId, router]);

  return null;
}

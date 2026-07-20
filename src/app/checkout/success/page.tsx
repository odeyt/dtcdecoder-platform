import { getOrderById } from "@/lib/orders";
import { OrderStatusPoller } from "@/components/OrderStatusPoller";
import { MagicLinkForm } from "@/components/MagicLinkForm";

type Props = {
  searchParams: Promise<{ order_id?: string }>;
};

export default async function CheckoutSuccessPage({ searchParams }: Props) {
  const { order_id: orderId } = await searchParams;

  if (!orderId) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <p>Missing order reference.</p>
      </div>
    );
  }

  const order = await getOrderById(orderId);

  if (!order) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <p>We couldn&apos;t find that order.</p>
      </div>
    );
  }

  if (order.status === "pending") {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <OrderStatusPoller orderId={order.id} />
        <h1 className="text-xl font-semibold">Confirming your payment…</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          This usually takes a few seconds. This page will update automatically.
        </p>
      </div>
    );
  }

  if (order.status === "failed" || order.status === "refunded") {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-xl font-semibold">Payment not completed</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Your payment didn&apos;t go through. No charge was made — you can try again from the
          product page.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-xl font-semibold">You&apos;re all set 🎉</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Get a login link to download your purchase now and anytime later from your account.
      </p>
      <div className="mt-6">
        <MagicLinkForm initialEmail={order.email} />
      </div>
    </div>
  );
}

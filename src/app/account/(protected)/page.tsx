import { createClient } from "@/lib/supabase/server";
import { getUserOrders } from "@/lib/orders";
import { formatPrice } from "@/lib/format";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Layout above already redirects if there's no user, so this is just
  // satisfying the type — user is guaranteed here at runtime.
  const orders = user ? await getUserOrders(user.id) : [];

  return (
    <div>
      <h1 className="text-2xl font-bold">My Purchases</h1>

      {orders.length === 0 ? (
        <p className="mt-6 text-zinc-600 dark:text-zinc-400">
          No purchases yet. Browse the{" "}
          <a href="/catalog" className="underline">
            catalog
          </a>{" "}
          to get started.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {orders.map((order) =>
            order.order_items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div>
                  <p className="font-medium">{item.product.title}</p>
                  <p className="text-sm text-zinc-500">
                    {formatPrice(item.unit_price_cents, order.currency)} ·{" "}
                    {new Date(order.created_at).toLocaleDateString()}
                  </p>
                </div>
                <a
                  href={`/api/downloads/${item.id}`}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Download
                </a>
              </li>
            )),
          )}
        </ul>
      )}
    </div>
  );
}

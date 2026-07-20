import Link from "next/link";
import { listAllProductsForAdmin } from "@/lib/admin-products";
import { formatPrice } from "@/lib/format";

export default async function AdminProductsPage() {
  const products = await listAllProductsForAdmin();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Products</h1>
        <Link
          href="/admin/products/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          New Product
        </Link>
      </div>

      {products.length === 0 ? (
        <p className="mt-6 text-zinc-600 dark:text-zinc-400">No products yet.</p>
      ) : (
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <th className="py-2">Title</th>
              <th className="py-2">Category</th>
              <th className="py-2">Price</th>
              <th className="py-2">Status</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="py-2">{product.title}</td>
                <td className="py-2">
                  {product.category === "wiring_diagram" ? "Wiring Diagram" : "Software / Tool"}
                </td>
                <td className="py-2">{formatPrice(product.price_cents, product.currency)}</td>
                <td className="py-2">
                  {product.is_published ? (
                    <span className="text-green-600 dark:text-green-400">Published</span>
                  ) : (
                    <span className="text-zinc-500">Draft</span>
                  )}
                </td>
                <td className="py-2 text-right">
                  <Link href={`/admin/products/${product.id}/edit`} className="underline">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

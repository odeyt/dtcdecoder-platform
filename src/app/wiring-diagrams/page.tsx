import type { Metadata } from "next";
import { listProducts } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";

export const metadata: Metadata = {
  title: "Wiring Diagrams",
  description: "Vehicle-specific wiring diagrams available as instant PDF downloads.",
};

export default async function WiringDiagramsPage() {
  const products = await listProducts("wiring_diagram");

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-bold">Wiring Diagrams</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Vehicle-specific wiring diagrams, delivered instantly after purchase.
      </p>

      {products.length === 0 ? (
        <p className="mt-6 text-zinc-600 dark:text-zinc-400">
          No wiring diagrams published yet. Check back soon.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}

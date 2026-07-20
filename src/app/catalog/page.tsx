import type { Metadata } from "next";
import { listProducts } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";

export const metadata: Metadata = {
  title: "Catalog",
  description: "Browse all wiring diagrams and automotive software available on DTCDecoder.",
};

export default async function CatalogPage() {
  const products = await listProducts();

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-bold">Full Catalog</h1>

      {products.length === 0 ? (
        <p className="mt-6 text-zinc-600 dark:text-zinc-400">
          No products published yet. Check back soon.
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

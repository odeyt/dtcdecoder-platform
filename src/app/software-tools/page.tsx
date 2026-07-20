import type { Metadata } from "next";
import { listProducts } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";

export const metadata: Metadata = {
  title: "Software & Tools",
  description: "Automotive diagnostic software and tools available as instant downloads.",
};

export default async function SoftwareToolsPage() {
  const products = await listProducts("software_tool");

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-bold">Software &amp; Tools</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Automotive diagnostic software and tools, delivered instantly after purchase.
      </p>

      {products.length === 0 ? (
        <p className="mt-6 text-zinc-600 dark:text-zinc-400">
          No software or tools published yet. Check back soon.
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

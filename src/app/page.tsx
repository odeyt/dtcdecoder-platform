import Link from "next/link";
import { listProducts } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";

export default async function Home() {
  const products = await listProducts();
  const featured = products.slice(0, 6);

  return (
    <div className="flex flex-1 flex-col">
      <section className="border-b border-zinc-200 bg-zinc-50 px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="mx-auto max-w-2xl text-3xl font-bold sm:text-4xl">
          Wiring diagrams and diagnostic software, instantly.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-zinc-600 dark:text-zinc-400">
          Buy exactly the wiring diagram or tool you need for your vehicle. Pay once, download
          immediately, keep access forever.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/wiring-diagrams"
            className="rounded-md bg-zinc-900 px-5 py-3 font-semibold text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Browse Wiring Diagrams
          </Link>
          <Link
            href="/software-tools"
            className="rounded-md border border-zinc-300 px-5 py-3 font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Browse Software &amp; Tools
          </Link>
        </div>
      </section>

      {featured.length > 0 && (
        <section className="mx-auto w-full max-w-5xl px-6 py-12">
          <h2 className="text-xl font-bold">Featured</h2>
          <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

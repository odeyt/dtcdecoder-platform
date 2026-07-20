import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { getPublicPreviewUrl } from "@/lib/storage";

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-zinc-200 transition-shadow hover:shadow-md dark:border-zinc-800"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-zinc-100 dark:bg-zinc-900">
        <Image
          src={getPublicPreviewUrl(product.thumbnail_path)}
          alt={product.title}
          fill
          className="object-cover transition-transform group-hover:scale-105"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {product.category === "wiring_diagram" ? "Wiring Diagram" : "Software / Tool"}
        </span>
        <h3 className="font-medium leading-snug">{product.title}</h3>
        <p className="mt-auto pt-2 font-semibold">
          {formatPrice(product.price_cents, product.currency)}
        </p>
      </div>
    </Link>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { getProduct } from "@/lib/products";
import { formatPrice } from "@/lib/format";
import { getPublicPreviewUrl } from "@/lib/storage";
import { PurchaseButton } from "@/components/PurchaseButton";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return {};

  return {
    title: `${product.title} | DTCDecoder`,
    description: product.description ?? undefined,
    openGraph: {
      images: [getPublicPreviewUrl(product.thumbnail_path)],
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) notFound();

  const vehicleLine = [
    product.vehicle_year_start && product.vehicle_year_end
      ? product.vehicle_year_start === product.vehicle_year_end
        ? String(product.vehicle_year_start)
        : `${product.vehicle_year_start}–${product.vehicle_year_end}`
      : null,
    product.vehicle_make,
    product.vehicle_model,
    product.vehicle_system,
  ]
    .filter(Boolean)
    .join(" ");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description ?? undefined,
    image: getPublicPreviewUrl(product.thumbnail_path),
    offers: {
      "@type": "Offer",
      priceCurrency: product.currency.toUpperCase(),
      price: (product.price_cents / 100).toFixed(2),
      availability: "https://schema.org/InStock",
    },
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="grid gap-8 sm:grid-cols-2">
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <Image
            src={getPublicPreviewUrl(product.thumbnail_path)}
            alt={product.title}
            fill
            className="object-cover"
          />
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {product.category === "wiring_diagram" ? "Wiring Diagram" : "Software / Tool"}
            </span>
            <h1 className="mt-1 text-2xl font-bold">{product.title}</h1>
            {vehicleLine && (
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{vehicleLine}</p>
            )}
          </div>

          <p className="text-3xl font-bold">{formatPrice(product.price_cents, product.currency)}</p>

          {product.description && (
            <p className="text-zinc-700 dark:text-zinc-300">{product.description}</p>
          )}

          <PurchaseButton
            productId={product.id}
            priceLabel={formatPrice(product.price_cents, product.currency)}
          />

          <p className="text-xs text-zinc-500">
            Instant delivery after payment. You&apos;ll get a login link by email to download
            anytime from your account.
          </p>
        </div>
      </div>
    </div>
  );
}

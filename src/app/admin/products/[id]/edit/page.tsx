import { notFound } from "next/navigation";
import { getProductForAdmin } from "@/lib/admin-products";
import { AdminProductForm } from "@/components/AdminProductForm";
import { updateProductAction, togglePublishAction } from "@/app/admin/actions";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditProductPage({ params }: Props) {
  const { id } = await params;
  const product = await getProductForAdmin(id);

  if (!product) notFound();

  const boundUpdate = updateProductAction.bind(null, product.id);
  const publish = togglePublishAction.bind(null, product.id, true);
  const unpublish = togglePublishAction.bind(null, product.id, false);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Edit Product</h1>
        <form action={product.is_published ? unpublish : publish}>
          <button
            type="submit"
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {product.is_published ? "Unpublish" : "Publish"}
          </button>
        </form>
      </div>

      <div className="mt-6">
        <AdminProductForm mode="edit" action={boundUpdate} product={product} />
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-zinc-500">Files</h2>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {product.files.map((file) => (
            <li key={file.id}>{file.file_name}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-zinc-500">
          File replacement isn&apos;t supported in v1 — create a new product to change the file.
        </p>
      </div>
    </div>
  );
}

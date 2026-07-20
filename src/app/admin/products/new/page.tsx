import { AdminProductForm } from "@/components/AdminProductForm";
import { createProductAction } from "@/app/admin/actions";

export default function NewProductPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">New Product</h1>
      <div className="mt-6">
        <AdminProductForm mode="create" action={createProductAction} />
      </div>
    </div>
  );
}

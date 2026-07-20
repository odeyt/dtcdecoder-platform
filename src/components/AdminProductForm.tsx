"use client";

import { useState } from "react";
import type { Product } from "@/lib/types";

type Mode = "create" | "edit";

export function AdminProductForm({
  mode,
  action,
  product,
}: {
  mode: Mode;
  action: (formData: FormData) => void | Promise<void>;
  product?: Product;
}) {
  const [category, setCategory] = useState(product?.category ?? "wiring_diagram");

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Title
        <input
          name="title"
          required
          defaultValue={product?.title}
          className="rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Description
        <textarea
          name="description"
          rows={4}
          defaultValue={product?.description ?? ""}
          className="rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Category
        <select
          name="category"
          value={category}
          onChange={(e) => setCategory(e.target.value as Product["category"])}
          className="rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="wiring_diagram">Wiring Diagram</option>
          <option value="software_tool">Software / Tool</option>
        </select>
      </label>

      {category === "wiring_diagram" && (
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Make
            <input
              name="vehicleMake"
              defaultValue={product?.vehicle_make ?? ""}
              className="rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Model
            <input
              name="vehicleModel"
              defaultValue={product?.vehicle_model ?? ""}
              className="rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Year start
            <input
              name="vehicleYearStart"
              type="number"
              defaultValue={product?.vehicle_year_start ?? ""}
              className="rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Year end
            <input
              name="vehicleYearEnd"
              type="number"
              defaultValue={product?.vehicle_year_end ?? ""}
              className="rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-sm font-medium">
            System (e.g. HVAC, Engine, Body)
            <input
              name="vehicleSystem"
              defaultValue={product?.vehicle_system ?? ""}
              className="rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm font-medium">
        Price (USD)
        <input
          name="price"
          type="number"
          step="0.01"
          min="0.01"
          required
          defaultValue={product ? (product.price_cents / 100).toFixed(2) : undefined}
          className="rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      {mode === "create" && (
        <>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Thumbnail image
            <input
              name="thumbnail"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
              className="text-sm"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Downloadable file(s)
            <input
              name="files"
              type="file"
              accept="application/pdf,application/zip,.zip"
              multiple
              required
              className="text-sm"
            />
          </label>
        </>
      )}

      <button
        type="submit"
        className="mt-2 rounded-md bg-zinc-900 px-5 py-2 font-semibold text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {mode === "create" ? "Create Product" : "Save Changes"}
      </button>
    </form>
  );
}

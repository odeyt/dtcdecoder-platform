import type { BlogPost } from "@/lib/types";
import { BLOG_CATEGORY_LABELS } from "@/lib/blog";

export function AdminBlogForm({
  post,
  action,
}: {
  post?: BlogPost;
  action: (formData: FormData) => void;
}) {
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-zinc-300">Title</label>
        <input
          type="text"
          name="title"
          defaultValue={post?.title}
          required
          className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-white"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-zinc-300">Slug</label>
        <input
          type="text"
          name="slug"
          defaultValue={post?.slug}
          required
          className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-white"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-zinc-300">Category</label>
        <select
          name="category"
          defaultValue={post?.category ?? "dtc_guides"}
          className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-white"
        >
          {Object.entries(BLOG_CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-zinc-300">Excerpt</label>
        <input
          type="text"
          name="excerpt"
          defaultValue={post?.excerpt ?? ""}
          className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-white"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-zinc-300">Content (Markdown)</label>
        <textarea
          name="content"
          defaultValue={post?.content}
          required
          rows={16}
          className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white"
        />
      </div>
      <button
        type="submit"
        className="rounded-md bg-red-600 px-5 py-2 font-semibold text-white transition hover:bg-red-500"
      >
        Save
      </button>
    </form>
  );
}

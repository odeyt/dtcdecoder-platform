import Link from "next/link";
import { listAllBlogPostsForAdmin } from "@/lib/blog";
import { BLOG_CATEGORY_LABELS } from "@/lib/blog";
import { toggleBlogPublishAction } from "@/app/admin/actions";

export default async function AdminBlogPage() {
  const posts = await listAllBlogPostsForAdmin();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Blog Posts</h1>
        <Link
          href="/admin/blog/new"
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
        >
          New Post
        </Link>
      </div>

      {posts.length === 0 ? (
        <p className="mt-6 text-zinc-400">No blog posts yet.</p>
      ) : (
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-zinc-500">
              <th className="py-2">Title</th>
              <th className="py-2">Category</th>
              <th className="py-2">Status</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id} className="border-b border-white/5">
                <td className="py-2">{post.title}</td>
                <td className="py-2">{BLOG_CATEGORY_LABELS[post.category]}</td>
                <td className="py-2">
                  <form
                    action={toggleBlogPublishAction.bind(null, post.id, !post.is_published)}
                  >
                    <button
                      type="submit"
                      className={post.is_published ? "text-emerald-400" : "text-zinc-500"}
                    >
                      {post.is_published ? "Published" : "Draft"}
                    </button>
                  </form>
                </td>
                <td className="py-2 text-right">
                  <Link href={`/admin/blog/${post.id}/edit`} className="underline">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

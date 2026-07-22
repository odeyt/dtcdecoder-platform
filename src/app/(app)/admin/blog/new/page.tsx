import { AdminBlogForm } from "@/components/AdminBlogForm";
import { saveBlogPostAction } from "@/app/(app)/admin/actions";

export default function NewBlogPostPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white">New Blog Post</h1>
      <div className="mt-6">
        <AdminBlogForm action={saveBlogPostAction.bind(null, null)} />
      </div>
    </div>
  );
}

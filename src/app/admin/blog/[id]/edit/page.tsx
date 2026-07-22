import { notFound } from "next/navigation";
import { getBlogPostForAdmin } from "@/lib/blog";
import { AdminBlogForm } from "@/components/AdminBlogForm";
import { saveBlogPostAction } from "@/app/admin/actions";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditBlogPostPage({ params }: Props) {
  const { id } = await params;
  const post = await getBlogPostForAdmin(id);
  if (!post) notFound();

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Edit Post</h1>
      <div className="mt-6">
        <AdminBlogForm post={post} action={saveBlogPostAction.bind(null, id)} />
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { getGlossaryEntryForAdmin } from "@/lib/admin-glossary";
import { saveGlossaryEntryAction } from "@/app/(app)/admin/actions/glossary";
import { AdminGlossaryForm } from "@/components/AdminGlossaryForm";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditGlossaryEntryPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;
  const entry = await getGlossaryEntryForAdmin(id);
  if (!entry) notFound();

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Edit glossary term</h1>
      <div className="mt-6">
        <AdminGlossaryForm entry={entry} action={saveGlossaryEntryAction.bind(null, id)} />
      </div>
    </div>
  );
}
